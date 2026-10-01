/** Inline SVG icons used by the race HUD and touch pads (no icon font, no network). */

export const StopwatchIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 13.5V9.5M9.5 2.5h5M12 2.5V6M18.5 6.5l1.5-1.5" />
  </svg>
);

export const BoltIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M13.6 1.8 4.5 13.4h6.1l-1.4 8.8 9.3-12.1h-6.2z" />
  </svg>
);

export const BrakeDiscIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <circle cx="12" cy="12" r="9.5" fill="#cfd6e4" stroke="#6b7487" strokeWidth="1.2" />
    {Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return <circle key={i} cx={12 + Math.cos(a) * 6.6} cy={12 + Math.sin(a) * 6.6} r="0.85" fill="#6b7487" />;
    })}
    <circle cx="12" cy="12" r="3.6" fill="#8d96a8" />
    {Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      return <circle key={i} cx={12 + Math.cos(a) * 2.2} cy={12 + Math.sin(a) * 2.2} r="0.6" fill="#e9edf5" />;
    })}
    <path d="M17.2 4.6a9.6 9.6 0 0 1 3.4 5.6l-3.1.6a6.6 6.6 0 0 0-2.3-3.8z" fill="#e3262f" />
  </svg>
);

export const ArrowIcon = ({ dir, className = '' }: { dir: 'left' | 'right'; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    {dir === 'left' ? <path d="M16 4.2 6.4 12 16 19.8z" /> : <path d="M8 4.2 17.6 12 8 19.8z" />}
  </svg>
);

export const CheckeredFlagIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M4 2.5v19" stroke="#e9edf5" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M5 3.5c4-1.6 7 1.6 14 0v9c-7 1.6-10-1.6-14 0z" fill="#fff" />
    <g fill="#111827">
      <path d="M5 3.5c1.2-.5 2.3-.6 3.3-.5v3c-1-.1-2.1 0-3.3.5z" />
      <path d="M11.6 4.1c1.1.3 2.2.5 3.3.4v3c-1.1.1-2.2-.1-3.3-.4z" />
      <path d="M8.3 6c1.1.1 2.2.4 3.3.6v3c-1.1-.2-2.2-.5-3.3-.6z" />
      <path d="M14.9 7.5c1.2 0 2.5-.1 4.1-.5v3c-1.6.4-2.9.5-4.1.5z" />
      <path d="M5 9.5c1.2-.5 2.3-.6 3.3-.5v3c-1-.1-2.1 0-3.3.5z" />
      <path d="M11.6 9.6c1.1.3 2.2.5 3.3.4v3c-1.1.1-2.2-.1-3.3-.4z" />
    </g>
  </svg>
);
