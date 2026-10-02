import type { IceServerDTO, VoiceSignal } from '@race-rush/shared';

export type PeerLinkState = 'connecting' | 'connected' | 'failed';

export interface VoiceTransportEvents {
  signal(to: string, signal: VoiceSignal): void;
  remoteStream(peerId: string, stream: MediaStream): void;
  peerState(peerId: string, state: PeerLinkState): void;
  peerClosed(peerId: string): void;
}

/**
 * Transport abstraction: the mesh below can later be swapped for an SFU (LiveKit / mediasoup) without touching the
 * UI or the VoiceChat controller — both only use these methods.
 */
export interface VoiceTransport {
  /** Track sent to every peer (null = listen only). No renegotiation: senders use replaceTrack. */
  setLocalTrack(track: MediaStreamTrack | null): void;
  /** Peers that currently have voice enabled in the lobby. Opens / closes connections accordingly. */
  syncPeers(ids: string[]): void;
  handleSignal(from: string, signal: VoiceSignal): Promise<void>;
  close(): void;
}

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  offerer: boolean;
  pendingIce: RTCIceCandidateInit[];
  restartTimer: number | null;
  restarts: number;
}

const MAX_RESTARTS = 3;

/**
 * Peer-to-peer mesh (2–5 players): one RTCPeerConnection per remote player, Opus audio only.
 * Glare-free by construction: the player with the smaller id always sends the offer (also for ICE restarts);
 * the other side only answers, asking for a restart if its link fails.
 */
export class MeshTransport implements VoiceTransport {
  private peers = new Map<string, Peer>();
  private track: MediaStreamTrack | null = null;
  private closed = false;

  constructor(
    private readonly selfId: string,
    private readonly iceServers: IceServerDTO[],
    private readonly events: VoiceTransportEvents,
  ) {}

  setLocalTrack(track: MediaStreamTrack | null): void {
    this.track = track;
    for (const p of this.peers.values()) {
      const sender = p.pc.getTransceivers()[0]?.sender;
      if (sender) void sender.replaceTrack(track).catch(() => undefined);
    }
  }

  syncPeers(ids: string[]): void {
    if (this.closed) return;
    const wanted = new Set(ids.filter((id) => id !== this.selfId));
    for (const id of [...this.peers.keys()]) if (!wanted.has(id)) this.closePeer(id);
    for (const id of wanted) {
      if (this.peers.has(id) || !this.isOfferer(id)) continue;
      const p = this.createPeer(id, true);
      p.pc.addTransceiver('audio', { direction: 'sendrecv', streams: [] });
      this.attachTrack(p);
      void this.sendOffer(p, false);
    }
  }

  async handleSignal(from: string, signal: VoiceSignal): Promise<void> {
    if (this.closed || from === this.selfId) return;
    let p = this.peers.get(from);
    try {
      switch (signal.kind) {
        case 'offer': {
          if (this.isOfferer(from)) return; // we are the offerer for this pair: ignore (no glare)
          if (!p) p = this.createPeer(from, false);
          await p.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
          const tr = p.pc.getTransceivers()[0];
          if (tr) {
            tr.direction = 'sendrecv';
            this.attachTrack(p);
          }
          await this.flushIce(p);
          await p.pc.setLocalDescription(await p.pc.createAnswer());
          this.events.signal(from, { kind: 'answer', sdp: p.pc.localDescription!.sdp });
          return;
        }
        case 'answer':
          if (!p || !p.offerer || p.pc.signalingState !== 'have-local-offer') return;
          await p.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
          await this.flushIce(p);
          return;
        case 'ice': {
          if (!p) return;
          const c: RTCIceCandidateInit = { candidate: signal.candidate, sdpMid: signal.sdpMid, sdpMLineIndex: signal.sdpMLineIndex };
          if (p.pc.remoteDescription) await p.pc.addIceCandidate(c);
          else p.pendingIce.push(c);
          return;
        }
        case 'restart':
          if (p?.offerer) void this.sendOffer(p, true);
          return;
      }
    } catch (err) {
      console.warn('[voice] signal error', signal.kind, err);
    }
  }

  close(): void {
    this.closed = true;
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.track = null;
  }

  private isOfferer(peerId: string): boolean {
    return this.selfId < peerId;
  }

  private attachTrack(p: Peer): void {
    const sender = p.pc.getTransceivers()[0]?.sender;
    if (sender && sender.track !== this.track) void sender.replaceTrack(this.track).catch(() => undefined);
  }

  private createPeer(id: string, offerer: boolean): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers as RTCIceServer[], bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    const p: Peer = { id, pc, offerer, pendingIce: [], restartTimer: null, restarts: 0 };
    this.peers.set(id, p);
    pc.onicecandidate = (e) => {
      if (!e.candidate || !e.candidate.candidate) return;
      this.events.signal(id, { kind: 'ice', candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      this.events.remoteStream(id, stream);
    };
    pc.onconnectionstatechange = () => this.onConnState(p);
    this.events.peerState(id, 'connecting');
    return p;
  }

  private onConnState(p: Peer): void {
    if (this.peers.get(p.id) !== p) return;
    const st = p.pc.connectionState;
    if (st === 'connected') {
      p.restarts = 0;
      if (p.restartTimer !== null) window.clearTimeout(p.restartTimer);
      p.restartTimer = null;
      this.events.peerState(p.id, 'connected');
      return;
    }
    if (st === 'failed' || st === 'disconnected') {
      this.events.peerState(p.id, st === 'failed' ? 'failed' : 'connecting');
      if (p.restartTimer !== null) return;
      // "disconnected" often heals by itself (network switch): give it a moment before restarting ICE.
      p.restartTimer = window.setTimeout(
        () => {
          p.restartTimer = null;
          if (this.peers.get(p.id) !== p || p.pc.connectionState === 'connected') return;
          if (++p.restarts > MAX_RESTARTS) return this.events.peerState(p.id, 'failed');
          if (p.offerer) void this.sendOffer(p, true);
          else this.events.signal(p.id, { kind: 'restart' });
        },
        st === 'failed' ? 300 : 3500,
      );
    }
  }

  private async sendOffer(p: Peer, iceRestart: boolean): Promise<void> {
    try {
      if (iceRestart) p.pc.restartIce();
      await p.pc.setLocalDescription(await p.pc.createOffer(iceRestart ? { iceRestart: true } : undefined));
      this.events.signal(p.id, { kind: 'offer', sdp: p.pc.localDescription!.sdp });
    } catch (err) {
      console.warn('[voice] offer failed', err);
    }
  }

  private async flushIce(p: Peer): Promise<void> {
    const list = p.pendingIce.splice(0);
    for (const c of list) await p.pc.addIceCandidate(c).catch(() => undefined);
  }

  private closePeer(id: string): void {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    if (p.restartTimer !== null) window.clearTimeout(p.restartTimer);
    p.pc.onicecandidate = null;
    p.pc.ontrack = null;
    p.pc.onconnectionstatechange = null;
    try {
      p.pc.close();
    } catch {
      /* already closed */
    }
    this.events.peerClosed(id);
  }
}
