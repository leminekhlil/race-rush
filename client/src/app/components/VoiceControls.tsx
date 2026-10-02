import { useStore } from '../../state/store';
import { appStore } from '../../state/appStore';
import { settingsStore } from '../../state/settings';
import { MIC_LABEL, STATUS_LABEL, VoiceChat, voiceStore, voiceSupported, type MicState } from '../../net/voice/VoiceChat';
import { getRealtime } from '../actions';

const micActive = (m: MicState) => m === 'on' || m === 'muted';
const micProblem = (m: MicState) => m === 'denied' || m === 'notfound' || m === 'busy' || m === 'error';

const pill = 'flex items-center justify-center gap-1.5 rounded-xl border-2 font-bold transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';

/** Lobby voice card: 🔊 Voice (join / leave), 🎤 Micro (open / close), self mute, voice volume, status and errors. */
export const VoicePanel = () => {
  const v = useStore(voiceStore, (s) => ({ status: s.status, mic: s.mic, error: s.error, selfSpeaking: s.selfSpeaking }));
  const volume = useStore(settingsStore, (s) => s.voiceVolume);
  const supported = voiceSupported();
  const on = v.status === 'connecting' || v.status === 'connected';
  const statusText = !supported ? STATUS_LABEL.unavailable : v.status === 'off' ? STATUS_LABEL.off : `${STATUS_LABEL[v.status]} · ${MIC_LABEL[v.mic]}`;

  return (
    <section className="pointer-events-auto flex flex-col gap-2 rounded-2xl border border-white/12 bg-night-950/80 p-3 shadow-2xl backdrop-blur-md" data-testid="voice-panel" aria-label="Chat vocal">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base tracking-wide">CHAT VOCAL</h2>
        <span
          className={`flex items-center gap-1.5 text-[11px] font-semibold ${v.status === 'connected' ? 'text-[#3dff6a]' : v.status === 'unavailable' || !supported ? 'text-[#ff8a80]' : 'text-white/60'}`}
          data-testid="voice-status"
          data-status={v.status}
          data-mic={v.mic}
          aria-live="polite"
        >
          <span className={`h-2 w-2 rounded-full ${v.status === 'connected' ? 'bg-[#3dff6a]' : v.status === 'connecting' ? 'animate-pulse bg-gold-400' : 'bg-white/30'}`} />
          {statusText}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          aria-pressed={on}
          disabled={!supported}
          data-testid="voice-toggle"
          onClick={() => (on ? VoiceChat.disable() : VoiceChat.enable())}
          className={`${pill} py-2 text-sm ${on ? 'border-volt-400 bg-volt-500/25 text-white' : 'border-white/15 bg-night-900 text-white/85 hover:border-white/35'}`}
        >
          <span aria-hidden>🔊</span> {on ? 'Voice ON' : 'Voice'}
        </button>
        <button
          type="button"
          aria-pressed={micActive(v.mic)}
          disabled={!supported || v.mic === 'requesting'}
          data-testid="mic-toggle"
          onClick={() => (micActive(v.mic) ? VoiceChat.disableMic() : void VoiceChat.enableMic())}
          className={`${pill} py-2 text-sm ${
            v.mic === 'on'
              ? `border-[#2ee87a] bg-[#2ee87a]/20 text-white ${v.selfSpeaking ? 'shadow-[0_0_16px_#2ee87a]' : ''}`
              : micProblem(v.mic)
                ? 'border-[#ff8a80]/70 bg-[#ff3b30]/15 text-white'
                : 'border-white/15 bg-night-900 text-white/85 hover:border-white/35'
          }`}
        >
          <span aria-hidden>{micActive(v.mic) ? '🎤' : '🎙️'}</span> {v.mic === 'requesting' ? 'Autorisation…' : micActive(v.mic) ? 'Micro ON' : 'Micro'}
        </button>
      </div>

      {micActive(v.mic) && (
        <button
          type="button"
          aria-pressed={v.mic === 'muted'}
          data-testid="mic-mute"
          onClick={() => VoiceChat.toggleMute()}
          className={`${pill} py-1.5 text-xs ${v.mic === 'muted' ? 'border-gold-400 bg-gold-500 text-night-950' : 'border-white/15 bg-night-900 text-white/85 hover:border-white/35'}`}
        >
          {v.mic === 'muted' ? '🔇 Micro coupé — touchez pour parler' : '🔇 Couper mon micro'}
        </button>
      )}

      {on && (
        <label className="flex items-center justify-between gap-2 text-xs font-semibold text-white/75">
          Volume des voix
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            aria-label="Volume des voix"
            onChange={(e) => settingsStore.set({ voiceVolume: Number(e.target.value) })}
            className="w-28 accent-volt-400"
          />
        </label>
      )}

      {(v.error || !supported) && (
        <p className="text-[11px] leading-relaxed text-[#ffb4ab]" role="alert" data-testid="voice-error">
          {v.error ?? 'Voice chat indisponible sur ce navigateur.'}
        </p>
      )}
      <p className="text-[10px] leading-relaxed text-white/45">Touche Micro pour demander l’autorisation du téléphone, puis choisis Autoriser. Aucun casque nécessaire. Le micro reste limité à ce salon.</p>
    </section>
  );
};

/** Per-player voice badge for lobby cards: mic state, speaking glow and local mute of that player. */
export const PlayerVoiceBadge = ({ playerId }: { playerId: string }) => {
  const flags = useStore(appStore, (s) => s.lobby?.players.find((p) => p.id === playerId)?.voice ?? null);
  const self = playerId === getRealtime().id;
  const peer = useStore(voiceStore, (s) => s.peers[playerId] ?? null);
  const selfSpeaking = useStore(voiceStore, (s) => s.selfSpeaking);
  const joined = useStore(voiceStore, (s) => s.status === 'connected');
  if (!flags?.on) return null;
  const speaking = self ? selfSpeaking : !!peer?.speaking;
  const failed = !self && peer?.link === 'failed';
  const title = failed ? 'Connexion vocale impossible' : flags.mic ? (speaking ? 'Parle' : 'Micro ouvert') : 'Écoute (micro fermé)';

  return (
    <span className="flex shrink-0 items-center gap-1 drop-shadow-lg" data-testid={`voice-badge-${playerId}`} data-speaking={speaking ? '1' : '0'}>
      <span
        title={title}
        aria-label={title}
        className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] transition-shadow duration-150 ${
          failed ? 'bg-[#ff3b30]/30' : speaking ? 'bg-[#2ee87a] shadow-[0_0_12px_#2ee87a]' : flags.mic ? 'bg-night-700' : 'bg-night-800 opacity-70'
        }`}
      >
        {failed ? '⚠️' : flags.mic ? '🎤' : '🔈'}
      </span>
      {!self && joined && peer && (
        <button
          type="button"
          aria-pressed={peer.muted}
          aria-label={peer.muted ? 'Réactiver ce joueur' : 'Couper ce joueur'}
          title={peer.muted ? 'Réactiver ce joueur' : 'Couper ce joueur'}
          data-testid={`voice-mute-${playerId}`}
          onClick={() => VoiceChat.setPeerMuted(playerId, !peer.muted)}
          className={`pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full text-[12px] transition-all active:scale-90 ${peer.muted ? 'bg-[#ff3b30]/80' : 'bg-night-800 hover:bg-night-700'}`}
        >
          {peer.muted ? '🔇' : '🔊'}
        </button>
      )}
    </span>
  );
};

/** In-race voice widget: mic toggle + who is talking. Only in multiplayer races. */
export const VoiceHud = () => {
  const lobby = useStore(appStore, (s) => s.lobby);
  const v = useStore(voiceStore, (s) => s);
  if (!lobby || lobby.solo || !voiceSupported()) return null;
  const myId = getRealtime().id;
  const talking = lobby.players.filter((p) => (p.id === myId ? v.selfSpeaking : v.peers[p.id]?.speaking));
  const on = v.status === 'connected' || v.status === 'connecting';

  return (
    <div className="pointer-events-auto flex flex-col items-start gap-1" data-testid="voice-hud">
      <button
        type="button"
        data-testid="hud-mic"
        aria-pressed={v.mic === 'on'}
        aria-label={v.mic === 'on' ? 'Couper mon micro' : 'Parler (micro)'}
        onClick={() => {
          if (v.mic === 'on' || v.mic === 'muted') VoiceChat.toggleMute();
          else void VoiceChat.enableMic();
        }}
        className={`flex h-9 items-center gap-1 rounded-xl border px-2.5 text-xs font-bold shadow-lg backdrop-blur-sm transition-all active:scale-95 ${
          v.mic === 'on' ? `border-[#2ee87a] bg-[#2ee87a]/25 ${v.selfSpeaking ? 'shadow-[0_0_14px_#2ee87a]' : ''}` : 'border-white/15 bg-night-950/70 text-white/85'
        }`}
      >
        <span aria-hidden>{v.mic === 'on' ? '🎤' : '🔇'}</span>
        {v.mic === 'on' ? 'ON' : on ? 'OFF' : 'Voice'}
      </button>
      {talking.map((p) => (
        <span key={p.id} className="flex items-center gap-1 rounded-lg bg-[#2ee87a]/85 px-2 py-0.5 text-[11px] font-bold text-night-950 shadow">
          🎙 {p.id === myId ? 'Toi' : p.name}
        </span>
      ))}
    </div>
  );
};
