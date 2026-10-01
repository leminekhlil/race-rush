import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { VehicleId } from '@race-rush/shared';
import { AudioEngine } from '../../game/audio/AudioEngine';
import { useStore } from '../../state/store';
import { appStore } from '../../state/appStore';

type Variant = 'gold' | 'volt' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  gold: 'btn-gold',
  volt: 'btn-volt',
  ghost: 'border border-white/20 bg-night-900/40 text-white hover:bg-night-700/60 active:scale-95',
  danger: 'bg-rush-500 text-white shadow-lg shadow-rush-500/30 active:scale-95',
};

export const Button = ({
  variant = 'volt',
  size = 'md',
  className = '',
  children,
  onClick,
  sound = true,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'xl'; sound?: boolean }) => {
  const sizes = { sm: 'px-3 py-1.5 text-sm rounded-xl', md: 'px-5 py-2.5 text-base rounded-2xl', lg: 'px-7 py-3.5 text-xl rounded-2xl', xl: 'px-10 py-4 text-3xl rounded-3xl' };
  return (
    <button
      type="button"
      {...rest}
      onClick={(e) => {
        if (sound) AudioEngine.click();
        onClick?.(e);
      }}
      className={`font-display inline-flex items-center justify-center gap-2 tracking-wide transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyanx-400/60 disabled:cursor-not-allowed disabled:opacity-45 disabled:saturate-50 ${VARIANTS[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Panel = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`glass rounded-3xl ${className}`}>{children}</div>
);

export const SectionTitle = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`mb-2 text-xs font-bold tracking-[0.25em] text-volt-400 uppercase ${className}`}>{children}</div>
);

/** Recognisable silhouettes for the four vehicle classes (UI only). */
export const VehicleIcon = ({ id, className = 'h-8 w-14', color = 'currentColor' }: { id: VehicleId; className?: string; color?: string }) => {
  const paths: Record<VehicleId, ReactNode> = {
    sport: (
      <>
        <path d="M4 26 L10 18 L24 15 L36 9 L50 9 L60 16 L74 18 L78 26 Z" fill={color} />
        <path d="M38 11 L48 11 L55 16 L33 16 Z" fill="#0d1a36" />
        <circle cx="19" cy="27" r="6" fill="#111" stroke="#ccc" strokeWidth="2" />
        <circle cx="64" cy="27" r="6" fill="#111" stroke="#ccc" strokeWidth="2" />
        <path d="M4 18 L12 18 L12 20 L4 20 Z" fill="#111" />
      </>
    ),
    moto: (
      <>
        <circle cx="18" cy="26" r="7" fill="#111" stroke="#ccc" strokeWidth="2" />
        <circle cx="62" cy="26" r="7" fill="#111" stroke="#ccc" strokeWidth="2" />
        <path d="M18 26 L32 16 L50 16 L62 26 L54 14 L46 12 L32 13 Z" fill={color} />
        <circle cx="40" cy="6" r="4" fill={color} />
        <path d="M37 10 L44 10 L48 18 L34 18 Z" fill="#232a3d" />
      </>
    ),
    buggy: (
      <>
        <path d="M10 22 L22 18 L60 18 L72 22 L70 26 L12 26 Z" fill={color} />
        <path d="M28 18 L32 6 L52 6 L56 18" fill="none" stroke={color} strokeWidth="3" />
        <circle cx="20" cy="27" r="7" fill="#111" stroke="#ccc" strokeWidth="2" />
        <circle cx="62" cy="26" r="8" fill="#111" stroke="#ccc" strokeWidth="2" />
      </>
    ),
    monster: (
      <>
        <path d="M14 16 L26 14 L32 6 L52 6 L58 14 L70 15 L70 20 L14 20 Z" fill={color} />
        <path d="M34 8 L50 8 L54 13 L31 13 Z" fill="#0d1a36" />
        <rect x="30" y="20" width="24" height="3" fill="#ffc61a" />
        <circle cx="22" cy="26" r="9" fill="#111" stroke="#ccc" strokeWidth="2" />
        <circle cx="62" cy="26" r="9" fill="#111" stroke="#ccc" strokeWidth="2" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 82 36" className={className} aria-hidden stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" strokeLinejoin="round">
      {paths[id]}
    </svg>
  );
};

export const StatBar = ({ label, value, bonus = 0, max = 10 }: { label: string; value: number; bonus?: number; max?: number }) => (
  <div className="flex items-center gap-3">
    <div className="w-24 shrink-0 text-sm font-bold tracking-wider text-white/75 uppercase">{label}</div>
    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-night-950/70">
      <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-volt-500 to-cyanx-400 transition-[width] duration-500" style={{ width: `${(value / max) * 100}%` }} />
      {bonus > 0 && (
        <div
          className="absolute inset-y-0 rounded-full bg-gold-400 transition-[width,left] duration-500"
          style={{ left: `${(value / max) * 100}%`, width: `${(Math.min(bonus, max - value) / max) * 100}%` }}
        />
      )}
    </div>
    <div className="w-9 text-right font-display text-sm tabular-nums">{(value + bonus).toFixed(bonus % 1 ? 1 : 0)}</div>
  </div>
);

export const VmruBadge = ({ amount, className = '' }: { amount: number; className?: string }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full bg-night-950/60 px-3 py-1 font-display text-gold-300 ${className}`} data-testid="vmru-balance">
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-b from-gold-300 to-gold-600 text-[10px] text-night-950">V</span>
    {amount.toLocaleString('fr-FR')}
  </span>
);

export const LevelBadge = ({ level, xp, start, next }: { level: number; xp: number; start: number; next: number }) => {
  const pct = Math.max(0, Math.min(1, (xp - start) / Math.max(1, next - start)));
  return (
    <div className="flex items-center gap-2" data-testid="level-badge">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-volt-400 to-volt-600 font-display text-lg shadow-lg shadow-volt-500/30">{level}</div>
      <div className="w-28">
        <div className="text-[10px] font-bold tracking-[0.2em] text-white/60">NIVEAU</div>
        <div className="h-1.5 overflow-hidden rounded-full bg-night-950/70">
          <div className="h-full rounded-full bg-gradient-to-r from-cyanx-400 to-gold-400" style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="text-[10px] text-white/50 tabular-nums">
          {xp - start} / {next - start} XP
        </div>
      </div>
    </div>
  );
};

/** Global toast notices (errors, confirmations). */
export const NoticeHost = () => {
  const notice = useStore(appStore, (s) => s.notice);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!notice) return;
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);
  if (!notice || !visible) return null;
  const tone = notice.tone === 'error' ? 'border-rush-500/70 bg-rush-500/20' : notice.tone === 'good' ? 'border-gold-400/70 bg-gold-500/15' : 'border-volt-400/60 bg-volt-500/15';
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center px-4" role="status" aria-live="polite">
      <div key={notice.id} className={`animate-pop glass max-w-md rounded-2xl border px-5 py-3 text-center text-base font-semibold ${tone}`} data-testid="notice">
        {notice.text}
      </div>
    </div>
  );
};

export const ScreenHeader = ({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) => (
  <div className="flex items-center gap-3 px-4 pt-3" style={{ paddingLeft: 'calc(16px + var(--safe-l))', paddingRight: 'calc(16px + var(--safe-r))', paddingTop: 'calc(12px + var(--safe-t))' }}>
    {onBack && (
      <button
        type="button"
        onClick={() => {
          AudioEngine.click();
          onBack();
        }}
        aria-label="Retour"
        className="glass flex h-11 w-11 items-center justify-center rounded-2xl text-2xl transition-transform hover:bg-night-700 active:scale-90"
      >
        ‹
      </button>
    )}
    <h1 className="font-display text-outline text-2xl italic sm:text-3xl">{title}</h1>
    <div className="ml-auto flex items-center gap-2">{right}</div>
  </div>
);
