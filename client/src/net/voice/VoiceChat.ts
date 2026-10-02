import { openMicrophone } from './microphone';
import type { ClientMessage, IceServerDTO, LobbyDTO, VoiceSignal } from '@race-rush/shared';
import { createStore } from '../../state/store';
import { appStore } from '../../state/appStore';
import { settingsStore } from '../../state/settings';
import { AudioEngine } from '../../game/audio/AudioEngine';
import { MeshTransport, type PeerLinkState, type VoiceTransport } from './MeshTransport';

/**
 * Voice chat controller (opt-in, scoped to the current lobby and its race).
 * - 🔊 Voice: joins the lobby voice channel (listen). No permission needed.
 * - 🎤 Micro: asks for the microphone only on that explicit click; tracks are stopped when the mic is turned off,
 *   the lobby is left, voice is disabled or the page is closed.
 * Signalling goes through the realtime WebSocket; media flows peer-to-peer (WebRTC mesh, see MeshTransport).
 */

export type VoiceStatus = 'off' | 'connecting' | 'connected' | 'unavailable';
export type MicState = 'off' | 'requesting' | 'on' | 'muted' | 'denied' | 'notfound' | 'busy' | 'error';

export interface PeerVoiceUi {
  link: PeerLinkState;
  speaking: boolean;
  /** Muted locally by me (others still hear this player). */
  muted: boolean;
  volume: number;
}

export interface VoiceState {
  status: VoiceStatus;
  mic: MicState;
  error: string | null;
  selfSpeaking: boolean;
  peers: Record<string, PeerVoiceUi>;
}

export const voiceStore = createStore<VoiceState>({ status: 'off', mic: 'off', error: null, selfSpeaking: false, peers: {} });

export const MIC_LABEL: Record<MicState, string> = {
  off: 'Micro OFF',
  requesting: 'Autorisation…',
  on: 'Micro ON',
  muted: 'Micro coupé',
  denied: 'Permission refusée',
  notfound: 'Aucun micro',
  busy: 'Micro occupé',
  error: 'Erreur micro',
};

export const STATUS_LABEL: Record<VoiceStatus, string> = {
  off: 'Voice désactivé',
  connecting: 'Connexion…',
  connected: 'Voice connecté',
  unavailable: 'Voice chat indisponible',
};

interface Sender {
  readonly id: string;
  send(m: ClientMessage): void;
}

interface RemoteAudio {
  el: HTMLAudioElement;
  stream: MediaStream;
  analyser: AnalyserNode | null;
  source: MediaStreamAudioSourceNode | null;
  lastLoud: number;
}

const DEFAULT_PEER: PeerVoiceUi = { link: 'connecting', speaking: false, muted: false, volume: 1 };
const SPEAK_THRESHOLD = 0.022;
const SPEAK_HOLD_MS = 350;
const CONFIG_TIMEOUT_MS = 7000;

export const voiceSupported = (): boolean =>
  typeof window !== 'undefined' && window.isSecureContext !== false && typeof RTCPeerConnection === 'function' && !!navigator.mediaDevices?.getUserMedia;

class VoiceChatImpl {
  private sender: Sender | null = null;
  private transport: VoiceTransport | null = null;
  private stream: MediaStream | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localSource: MediaStreamAudioSourceNode | null = null;
  private selfLastLoud = 0;
  private remotes = new Map<string, RemoteAudio>();
  private lobby: LobbyDTO | null = null;
  private loop: number | null = null;
  private configTimer: number | null = null;
  /** Bumped on every disable: late getUserMedia / config answers from a previous session are discarded. */
  private generation = 0;
  private hiddenMute = false;
  private holder: HTMLDivElement | null = null;
  private pendingPlay = new Set<HTMLAudioElement>();

  constructor() {
    if (typeof window === 'undefined') return;
    appStore.subscribe(() => {
      const lobby = appStore.get().lobby;
      if (lobby !== this.lobby) this.onLobby(lobby);
    });
    settingsStore.subscribe(() => this.applyVolumes());
    window.addEventListener('pagehide', () => this.disable(true));
    document.addEventListener('visibilitychange', () => this.onVisibility());
    const retry = () => {
      for (const el of this.pendingPlay) void el.play().then(() => this.pendingPlay.delete(el)).catch(() => undefined);
    };
    window.addEventListener('pointerdown', retry, { capture: true, passive: true });
    window.addEventListener('keydown', retry, { capture: true, passive: true });
  }

  bind(sender: Sender): void {
    this.sender = sender;
  }

  get state(): VoiceState {
    return voiceStore.get();
  }

  // ---------------------------------------------------------------- public API (UI)

  /** 🔊 Join the lobby voice channel (listen only until the mic is turned on). */
  enable(): void {
    const st = voiceStore.get().status;
    if (st === 'connecting' || st === 'connected') return;
    if (!voiceSupported()) return this.unavailable('Voice chat indisponible : navigateur non compatible ou connexion non sécurisée (HTTPS requis).');
    const lobby = appStore.get().lobby;
    if (!lobby || lobby.solo || !this.sender?.id) return this.unavailable('Voice chat indisponible hors d’un salon multijoueur.');
    AudioEngine.unlock();
    voiceStore.set({ status: 'connecting', error: null });
    this.send({ t: 'voice.state', on: true, mic: this.micOpen });
    const gen = this.generation;
    if (this.configTimer !== null) window.clearTimeout(this.configTimer);
    this.configTimer = window.setTimeout(() => {
      if (gen === this.generation && voiceStore.get().status === 'connecting' && !this.transport) {
        this.disable(true);
        this.unavailable('Voice chat indisponible : le serveur vocal ne répond pas.');
      }
    }, CONFIG_TIMEOUT_MS);
  }

  /** Leaves the voice channel: stops the mic, closes every peer connection. */
  disable(notifyServer = true): void {
    this.generation++;
    if (this.configTimer !== null) window.clearTimeout(this.configTimer);
    this.configTimer = null;
    const wasOn = voiceStore.get().status !== 'off' && voiceStore.get().status !== 'unavailable';
    this.stopMic();
    this.transport?.close();
    this.transport = null;
    for (const id of [...this.remotes.keys()]) this.dropRemote(id);
    if (this.loop !== null) window.clearInterval(this.loop);
    this.loop = null;
    AudioEngine.duckForVoice(1);
    voiceStore.set({ status: 'off', mic: 'off', selfSpeaking: false, peers: {} });
    if (notifyServer && wasOn) this.send({ t: 'voice.state', on: false, mic: false });
  }

  /** 🎤 Opens the microphone (explicit user action only). Joins the channel first if needed. */
  async enableMic(): Promise<void> {
    const v = voiceStore.get();
    if (v.mic === 'on' || v.mic === 'requesting') return;
    if (v.mic === 'muted') return this.toggleMute();
    if (v.status === 'off' || v.status === 'unavailable') this.enable();
    if (voiceStore.get().status === 'unavailable') return;
    const gen = this.generation;
    voiceStore.set({ mic: 'requesting', error: null });
    let stream: MediaStream;
    try {
      stream = await openMicrophone(navigator.mediaDevices);
    } catch (err) {
      if (gen !== this.generation) return;
      const name = (err as DOMException)?.name ?? '';
      const [mic, msg]: [MicState, string] =
        name === 'NotAllowedError' || name === 'SecurityError'
          ? ['denied', 'Permission micro refusée. Autorise le micro dans les réglages du navigateur pour parler.']
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? ['notfound', 'Aucun micro détecté sur cet appareil.']
            : name === 'NotReadableError' || name === 'AbortError'
              ? ['busy', 'Micro utilisé par une autre application.']
              : ['error', 'Impossible d’ouvrir le micro.'];
      voiceStore.set({ mic, error: msg });
      return;
    }
    // Voice disabled / lobby left while the permission prompt was open: release immediately.
    if (gen !== this.generation || voiceStore.get().status === 'off') {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    track.onended = () => {
      if (this.stream === stream) {
        this.stopMic();
        voiceStore.set({ mic: 'error', error: 'Le micro a été déconnecté.' });
        this.send({ t: 'voice.state', on: true, mic: false });
      }
    };
    this.transport?.setLocalTrack(track);
    const ctx = AudioEngine.ensure();
    if (ctx) {
      try {
        this.localSource = ctx.createMediaStreamSource(stream);
        this.localAnalyser = ctx.createAnalyser();
        this.localAnalyser.fftSize = 512;
        this.localSource.connect(this.localAnalyser); // analysis only: never routed to the speakers
      } catch {
        this.localAnalyser = null;
      }
    }
    voiceStore.set({ mic: 'on', error: null });
    this.send({ t: 'voice.state', on: true, mic: true });
    this.ensureLoop();
  }

  /** Self mute (keeps the mic open, sends silence). */
  toggleMute(): void {
    const track = this.stream?.getAudioTracks()[0];
    if (!track) return;
    const mic = voiceStore.get().mic;
    if (mic !== 'on' && mic !== 'muted') return;
    track.enabled = mic === 'muted';
    voiceStore.set({ mic: track.enabled ? 'on' : 'muted', selfSpeaking: false });
    this.send({ t: 'voice.state', on: true, mic: track.enabled });
  }

  /** Turns the microphone off completely (tracks stopped: the browser's mic indicator goes off). */
  disableMic(): void {
    const had = !!this.stream;
    this.stopMic();
    voiceStore.set({ mic: 'off', selfSpeaking: false });
    if (had && voiceStore.get().status !== 'off') this.send({ t: 'voice.state', on: true, mic: false });
  }

  setPeerMuted(id: string, muted: boolean): void {
    this.patchPeer(id, { muted });
    this.applyVolumes();
  }

  setPeerVolume(id: string, volume: number): void {
    this.patchPeer(id, { volume: Math.max(0, Math.min(1, volume)) });
    this.applyVolumes();
  }

  // ---------------------------------------------------------------- realtime hooks

  onConfig(iceServers: IceServerDTO[]): void {
    if (voiceStore.get().status !== 'connecting' || !this.sender) return;
    if (this.configTimer !== null) window.clearTimeout(this.configTimer);
    this.configTimer = null;
    this.transport?.close();
    this.transport = new MeshTransport(this.sender.id, iceServers, {
      signal: (to, signal) => this.send({ t: 'voice.signal', to, signal }),
      remoteStream: (id, stream) => this.attachRemote(id, stream),
      peerState: (id, link) => this.patchPeer(id, { link }),
      peerClosed: (id) => {
        this.dropRemote(id);
        voiceStore.set((s) => {
          const peers = { ...s.peers };
          delete peers[id];
          return { peers };
        });
      },
    });
    const track = this.stream?.getAudioTracks()[0] ?? null;
    if (track) this.transport.setLocalTrack(track);
    voiceStore.set({ status: 'connected' });
    this.syncPeers();
    this.ensureLoop();
  }

  onSignal(from: string, signal: VoiceSignal): void {
    void this.transport?.handleSignal(from, signal);
  }

  onServerError(code: string): boolean {
    if (code !== 'voice_unavailable') return false;
    this.disable(false);
    this.unavailable('Voice chat indisponible pour cette partie.');
    return true;
  }

  // ---------------------------------------------------------------- internals

  private get micOpen(): boolean {
    return voiceStore.get().mic === 'on';
  }

  private send(m: ClientMessage): void {
    this.sender?.send(m);
  }

  private unavailable(error: string): void {
    voiceStore.set({ status: 'unavailable', mic: 'off', error });
  }

  private onLobby(lobby: LobbyDTO | null): void {
    const prev = this.lobby;
    this.lobby = lobby;
    if (!lobby || lobby.solo || (prev && prev.code !== lobby.code)) {
      // Left (or switched) lobby: the server already dropped our voice flags.
      if (voiceStore.get().status !== 'off') this.disable(false);
      if (voiceStore.get().status === 'unavailable') voiceStore.set({ status: 'off', error: null });
      return;
    }
    this.syncPeers();
  }

  private syncPeers(): void {
    const lobby = this.lobby;
    if (!lobby || !this.transport || !this.sender) return;
    const ids = lobby.players.filter((p) => p.voice?.on && p.id !== this.sender!.id).map((p) => p.id);
    this.transport.syncPeers(ids);
  }

  private patchPeer(id: string, patch: Partial<PeerVoiceUi>): void {
    voiceStore.set((s) => ({
      peers: { ...s.peers, [id]: { ...(s.peers[id] ?? DEFAULT_PEER), ...patch } },
    }));
  }

  private attachRemote(id: string, stream: MediaStream): void {
    const existing = this.remotes.get(id);
    if (existing?.stream === stream) return;
    if (existing) this.dropRemote(id);
    if (!this.holder) {
      this.holder = document.createElement('div');
      this.holder.hidden = true;
      this.holder.setAttribute('aria-hidden', 'true');
      document.body.appendChild(this.holder);
    }
    // Playback through a media element: the browser's echo canceller uses it as reference (Web Audio output is
    // not always cancelled), and it keeps working when the AudioContext is suspended.
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    el.srcObject = stream;
    el.dataset.peer = id;
    this.holder.appendChild(el);
    void el.play().catch(() => this.pendingPlay.add(el));
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    const ctx = AudioEngine.ctx;
    if (ctx) {
      try {
        source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser); // speaking indicator only
      } catch {
        analyser = null;
      }
    }
    this.remotes.set(id, { el, stream, analyser, source, lastLoud: 0 });
    this.patchPeer(id, {});
    this.applyVolumes();
  }

  private dropRemote(id: string): void {
    const r = this.remotes.get(id);
    if (!r) return;
    this.remotes.delete(id);
    this.pendingPlay.delete(r.el);
    try {
      r.source?.disconnect();
    } catch {
      /* ignore */
    }
    r.el.pause();
    r.el.srcObject = null;
    r.el.remove();
  }

  private stopMic(): void {
    const stream = this.stream;
    this.stream = null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    this.transport?.setLocalTrack(null);
    try {
      this.localSource?.disconnect();
    } catch {
      /* ignore */
    }
    this.localSource = null;
    this.localAnalyser = null;
    this.hiddenMute = false;
  }

  private applyVolumes(): void {
    const s = settingsStore.get();
    const peers = voiceStore.get().peers;
    for (const [id, r] of this.remotes) {
      const p = peers[id];
      r.el.muted = s.muted || !!p?.muted;
      // iOS ignores element.volume (hardware buttons only); mute still works everywhere.
      r.el.volume = Math.max(0, Math.min(1, s.masterVolume * s.voiceVolume * (p?.volume ?? 1)));
    }
  }

  private ensureLoop(): void {
    if (this.loop !== null) return;
    const buf = new Float32Array(512);
    const level = (a: AnalyserNode) => {
      a.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    };
    this.loop = window.setInterval(() => {
      const now = performance.now();
      const st = voiceStore.get();
      let anyRemote = false;
      let changed = false;
      const peers = { ...st.peers };
      for (const [id, r] of this.remotes) {
        if (r.analyser && level(r.analyser) > SPEAK_THRESHOLD) r.lastLoud = now;
        const speaking = now - r.lastLoud < SPEAK_HOLD_MS && !peers[id]?.muted;
        if (speaking) anyRemote = true;
        if (peers[id] && peers[id].speaking !== speaking) {
          peers[id] = { ...peers[id], speaking };
          changed = true;
        }
      }
      if (this.localAnalyser && st.mic === 'on' && level(this.localAnalyser) > SPEAK_THRESHOLD) this.selfLastLoud = now;
      const selfSpeaking = st.mic === 'on' && now - this.selfLastLoud < SPEAK_HOLD_MS;
      if (changed || selfSpeaking !== st.selfSpeaking) voiceStore.set({ peers, selfSpeaking });
      // Ducking: music and engines step back while someone talks.
      AudioEngine.duckForVoice(anyRemote ? 0.25 : 1);
    }, 90);
  }

  private onVisibility(): void {
    const track = this.stream?.getAudioTracks()[0];
    if (!track) return;
    if (document.hidden && track.enabled) {
      // Background tab / app switch: stop sending audio until the player comes back.
      track.enabled = false;
      this.hiddenMute = true;
    } else if (!document.hidden && this.hiddenMute) {
      this.hiddenMute = false;
      if (voiceStore.get().mic === 'on') track.enabled = true;
    }
  }
}

export const VoiceChat = new VoiceChatImpl();
if (typeof window !== 'undefined') (window as unknown as { __raceRushVoice: unknown }).__raceRushVoice = { chat: VoiceChat, store: voiceStore };
