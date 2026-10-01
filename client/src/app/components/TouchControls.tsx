import { useCallback, type ReactNode } from 'react';
import type { InputManager, TouchState } from '../../game/input/InputManager';
import { useStore } from '../../state/store';
import { hudStore } from '../../game/race/hud';
import { ArrowIcon, BoltIcon, BrakeDiscIcon } from './HudIcons';

interface PadProps {
  input: InputManager;
  control: keyof TouchState;
  label: string;
  className: string;
  children: ReactNode;
  testId: string;
}

/** Round thumb pad driven by Pointer Events (multi-touch safe, no 300ms delay). */
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
      className={`pointer-events-auto flex touch-none items-center justify-center rounded-full shadow-xl backdrop-blur-sm transition-transform duration-75 select-none active:scale-90 ${className}`}
    >
      {children}
    </button>
  );
};

const ARROW = 'h-[76px] w-[76px] border-[3px] border-white/70 bg-white/20 text-white active:bg-white/40 tall:h-24 tall:w-24';

export const TouchControls = ({ input, onRespawn }: { input: InputManager; onRespawn: () => void }) => {
  const boost = useStore(hudStore, (s) => s.boost);
  const boosting = useStore(hudStore, (s) => s.boosting);
  const ready = boost > 0.2;
  return (
    <div className="pointer-events-none absolute inset-0" data-testid="touch-controls">
      {/* Left: steering arrows */}
      <div className="absolute flex gap-3 tall:gap-4" style={{ left: 'calc(16px + var(--safe-l))', bottom: 'calc(16px + var(--safe-b))' }}>
        <Pad input={input} control="left" label="Gauche" testId="touch-left" className={ARROW}>
          <ArrowIcon dir="left" className="h-10 w-10 -translate-x-0.5 drop-shadow tall:h-12 tall:w-12" />
        </Pad>
        <Pad input={input} control="right" label="Droite" testId="touch-right" className={ARROW}>
          <ArrowIcon dir="right" className="h-10 w-10 translate-x-0.5 drop-shadow tall:h-12 tall:w-12" />
        </Pad>
      </div>

      {/* Right: boost (blue, glowing when charged) above brake / drift disc */}
      <div className="absolute flex flex-col items-center gap-2 tall:gap-3" style={{ right: 'calc(16px + var(--safe-r))', bottom: 'calc(14px + var(--safe-b))' }}>
        <Pad
          input={input}
          control="boost"
          label="Boost"
          testId="touch-boost"
          className={`h-[78px] w-[78px] border-[3px] text-white tall:h-24 tall:w-24 ${
            ready
              ? 'border-cyanx-400 bg-gradient-to-b from-volt-400 to-volt-600 shadow-[0_0_26px_rgba(25,227,255,0.75)]'
              : 'border-white/30 bg-night-900/60 text-white/50'
          } ${boosting ? 'scale-95 shadow-[0_0_40px_rgba(25,227,255,0.95)]' : ''}`}
        >
          <BoltIcon className="h-10 w-10 drop-shadow-[0_0_6px_rgba(255,255,255,0.8)] tall:h-12 tall:w-12" />
        </Pad>
        <Pad
          input={input}
          control="brake"
          label="Frein / Drift"
          testId="touch-brake"
          className="h-[68px] w-[68px] border-[3px] border-white/70 bg-white/20 active:bg-white/40 tall:h-20 tall:w-20"
        >
          <BrakeDiscIcon className="h-11 w-11 tall:h-14 tall:w-14" />
        </Pad>
        <span className="text-[10px] font-bold tracking-wider text-white/80 drop-shadow">FREIN / DRIFT</span>
      </div>

      <button
        type="button"
        onClick={onRespawn}
        className="pointer-events-auto absolute rounded-xl border border-white/25 bg-night-900/55 px-3 py-1 text-xs font-bold tracking-wider text-white/85 transition-transform active:scale-95"
        style={{ left: 'calc(16px + var(--safe-l))', bottom: 'calc(118px + var(--safe-b))' }}
      >
        ↺ REPLACER
      </button>
    </div>
  );
};
