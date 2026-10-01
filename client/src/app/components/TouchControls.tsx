import { useCallback, type ReactNode } from 'react';
import type { InputManager, TouchState } from '../../game/input/InputManager';
import { useStore } from '../../state/store';
import { hudStore } from '../../game/race/hud';

interface PadProps {
  input: InputManager;
  control: keyof TouchState;
  label: string;
  className: string;
  children: ReactNode;
  testId: string;
}

/** Large thumb pad driven by Pointer Events (multi-touch safe, no 300ms delay). */
const Pad = ({ input, control, label, className, children, testId }: PadProps) => {
  const set = useCallback(
    (v: boolean) => (e: React.PointerEvent) => {
      e.preventDefault();
      if (v) (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      input.touch[control] = v;
    },
    [input, control],
  );
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onPointerDown={set(true)}
      onPointerUp={set(false)}
      onPointerCancel={set(false)}
      onLostPointerCapture={() => {
        input.touch[control] = false;
      }}
      onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto flex touch-none items-center justify-center rounded-full border-2 border-white/25 bg-night-900/45 text-white shadow-lg backdrop-blur-sm transition-transform duration-75 select-none active:scale-90 active:border-gold-400 active:bg-volt-500/45 ${className}`}
    >
      {children}
    </button>
  );
};

export const TouchControls = ({ input, onRespawn }: { input: InputManager; onRespawn: () => void }) => {
  const boost = useStore(hudStore, (s) => s.boost);
  return (
    <div className="pointer-events-none absolute inset-0" data-testid="touch-controls">
      <div className="absolute flex gap-3" style={{ left: 'calc(14px + var(--safe-l))', bottom: 'calc(16px + var(--safe-b))' }}>
        <Pad input={input} control="left" label="Gauche" testId="touch-left" className="h-24 w-24 sm:h-28 sm:w-28">
          <svg viewBox="0 0 24 24" className="h-12 w-12" fill="currentColor" aria-hidden>
            <path d="M15.5 4.5 7 12l8.5 7.5z" />
          </svg>
        </Pad>
        <Pad input={input} control="right" label="Droite" testId="touch-right" className="h-24 w-24 sm:h-28 sm:w-28">
          <svg viewBox="0 0 24 24" className="h-12 w-12" fill="currentColor" aria-hidden>
            <path d="M8.5 4.5 17 12l-8.5 7.5z" />
          </svg>
        </Pad>
      </div>
      <div className="absolute flex flex-col items-end gap-3" style={{ right: 'calc(14px + var(--safe-r))', bottom: 'calc(16px + var(--safe-b))' }}>
        <Pad input={input} control="boost" label="Boost" testId="touch-boost" className={`h-24 w-24 sm:h-28 sm:w-28 ${boost > 0.2 ? 'border-cyanx-400/80' : ''}`}>
          <span className="font-display text-lg">BOOST</span>
        </Pad>
        <Pad input={input} control="brake" label="Frein / Drift" testId="touch-brake" className="h-20 w-28 rounded-3xl sm:h-24 sm:w-32">
          <span className="text-center font-display text-sm leading-tight">
            FREIN
            <br />
            DRIFT
          </span>
        </Pad>
      </div>
      <button
        type="button"
        onClick={onRespawn}
        className="pointer-events-auto absolute rounded-xl border border-white/20 bg-night-900/50 px-3 py-1 text-xs font-bold tracking-wider text-white/80 active:scale-95"
        style={{ left: 'calc(14px + var(--safe-l))', bottom: 'calc(140px + var(--safe-b))' }}
      >
        ↺ REPLACER
      </button>
    </div>
  );
};
