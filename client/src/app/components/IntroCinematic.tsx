import { useEffect, useState } from 'react';
import { RaceRushLogo } from './Logo';
import { AudioEngine } from '../../game/audio/AudioEngine';
import { settingsStore } from '../../state/settings';

/**
 * Opening cinematic: light streaks sweep across a dark sky, the RACE RUSH logo slams in, then "par Zahra Khlil".
 * Tap / click / key skips it (and unlocks audio). Shorter once seen.
 */
export const IntroCinematic = ({ onDone }: { onDone: () => void }) => {
  const seen = settingsStore.get().introSeen;
  const total = seen ? 3400 : 6500;
  // Logo / credit are pure CSS animations (compositor thread): smooth even while the menu scene is being built.
  const [phase, setPhase] = useState<'play' | 'out'>('play');

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhase('out'), total - 600),
      window.setTimeout(() => finish(), total),
    ];
    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    settingsStore.set({ introSeen: true });
    onDone();
  };
  const skip = () => {
    AudioEngine.unlock();
    finish();
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') && skip();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`intro-root pointer-events-auto fixed inset-0 z-[60] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#03060f] transition-opacity duration-500 ${phase === 'out' ? 'opacity-0' : 'opacity-100'}`}
      onClick={skip}
      role="button"
      aria-label="Passer l'introduction"
      data-testid="intro"
    >
      <div className="intro-glow absolute inset-0" />
      <div className="absolute inset-0">
        {Array.from({ length: 14 }, (_, i) => (
          <span
            key={i}
            className="intro-streak absolute h-[2px] rounded-full"
            style={{
              top: `${8 + ((i * 53) % 84)}%`,
              width: `${18 + ((i * 37) % 30)}%`,
              animationDelay: `${(i * 137) % 900}ms`,
              background: i % 3 === 0 ? 'linear-gradient(90deg,transparent,#ffc61a)' : i % 3 === 1 ? 'linear-gradient(90deg,transparent,#19e3ff)' : 'linear-gradient(90deg,transparent,#ff4fa3)',
            }}
          />
        ))}
      </div>

      <div className="intro-logo-in relative w-[min(86vw,720px)]" style={{ animationDelay: seen ? '0.2s' : '0.7s' }}>
        <RaceRushLogo className="intro-logo h-auto w-full drop-shadow-[0_18px_40px_rgba(31,107,255,0.45)]" />
        <span className="intro-shine pointer-events-none absolute inset-0" />
      </div>

      <div className="intro-credit-in relative mt-4 text-center sm:mt-6" style={{ animationDelay: seen ? '1.1s' : '2.1s' }}>
        <div className="text-xs font-bold tracking-[0.5em] text-white/55 sm:text-sm">UN JEU</div>
        <div className="intro-credit mt-1 text-3xl italic sm:text-5xl">par Zahra Khlil</div>
      </div>

      <div className="absolute bottom-[calc(14px+var(--safe-b))] text-[11px] font-semibold tracking-widest text-white/40">TOUCHE L'ÉCRAN POUR PASSER</div>
    </div>
  );
};
