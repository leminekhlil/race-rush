import { useStore } from '../../state/store';
import { settingsStore } from '../../state/settings';
import { AudioEngine, audioStatus } from '../../game/audio/AudioEngine';

/**
 * Bottom-left audio control: while the browser keeps audio locked (no gesture yet, iOS silent policy…) it invites a
 * tap; once running it becomes a one-tap mute toggle.
 */
export const SoundChip = ({ compact = false }: { compact?: boolean }) => {
  const status = useStore(audioStatus, (s) => s.status);
  const muted = useStore(settingsStore, (s) => s.muted);
  if (status === 'unavailable') return null;

  const locked = status !== 'running';
  const label = locked ? 'Touchez pour activer le son' : muted ? 'Son coupé' : 'Son activé';
  return (
    <button
      type="button"
      data-testid="sound-chip"
      data-status={locked ? 'locked' : muted ? 'muted' : 'on'}
      aria-label={locked ? 'Activer le son' : muted ? 'Réactiver le son' : 'Couper le son'}
      aria-pressed={!locked && !muted}
      onClick={() => {
        AudioEngine.unlock();
        if (!locked) settingsStore.set({ muted: !muted });
        else if (muted) settingsStore.set({ muted: false });
      }}
      className={`pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold shadow-lg backdrop-blur-md transition-all duration-200 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-volt-400 active:scale-95 ${
        locked ? 'animate-pulse border-gold-500/70 bg-gold-500/90 text-night-950' : 'border-white/15 bg-night-950/60 text-white/85'
      }`}
    >
      <span aria-hidden className="text-base leading-none">
        {locked || muted ? '🔇' : '🔊'}
      </span>
      {(!compact || locked) && <span>{label}</span>}
    </button>
  );
};
