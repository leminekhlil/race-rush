/** Inline stroke icons for menus (24×24 grid, currentColor). */
import type { ReactNode } from 'react';

const Svg = ({ className = 'h-5 w-5', children, fill = false }: { className?: string; children: ReactNode; fill?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill={fill ? 'currentColor' : 'none'}
    stroke={fill ? 'none' : 'currentColor'}
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

type P = { className?: string };

export const HomeIcon = ({ className }: P) => (
  <Svg className={className} fill>
    <path d="M12 3 2.5 11h2.6v9.5h5.4v-6h3v6h5.4V11h2.6z" />
  </Svg>
);

export const GamepadIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M6.5 7.5h11a4 4 0 0 1 3.9 4.9l-1 4.3a2.3 2.3 0 0 1-4 .9L14.6 15H9.4l-1.8 2.6a2.3 2.3 0 0 1-4-.9l-1-4.3a4 4 0 0 1 3.9-4.9z" />
    <path d="M8 10.5v3M6.5 12h3" />
    <circle cx="15.5" cy="11" r=".6" fill="currentColor" />
    <circle cx="17.3" cy="12.8" r=".6" fill="currentColor" />
  </Svg>
);

export const CarIcon = ({ className }: P) => (
  <Svg className={className} fill>
    <path d="M5.2 6.6A2.5 2.5 0 0 1 7.6 5h8.8a2.5 2.5 0 0 1 2.4 1.6l1.5 4a2.5 2.5 0 0 1 1.7 2.4v4.5a1 1 0 0 1-1 1h-1.3v1.2a1.3 1.3 0 0 1-2.6 0v-1.2H6.9v1.2a1.3 1.3 0 0 1-2.6 0v-1.2H3a1 1 0 0 1-1-1V13a2.5 2.5 0 0 1 1.7-2.4zm2 4h9.6l-1.2-3.2a.8.8 0 0 0-.7-.5H9.1a.8.8 0 0 0-.7.5zM6 15.6a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8m12 0a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8" />
  </Svg>
);

export const CartIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M2.5 3.5h2.6l2.3 11.2h10.9l2.2-8H6" />
    <circle cx="9" cy="19.5" r="1.4" />
    <circle cx="17" cy="19.5" r="1.4" />
  </Svg>
);

export const TrophyIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3.5M8 20.5h8M9.5 17.5h5" />
  </Svg>
);

export const ChatIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M4 5h16v10.5H9.5L5 19.5v-4H4z" />
  </Svg>
);

export const LockIcon = ({ className }: P) => (
  <Svg className={className} fill>
    <path d="M7 10V7.5a5 5 0 0 1 10 0V10h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2.2 0h5.6V7.5a2.8 2.8 0 0 0-5.6 0z" />
  </Svg>
);

export const StarIcon = ({ className }: P) => (
  <Svg className={className} fill>
    <path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" />
  </Svg>
);

export const CheckIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="m5 12.5 4.5 4.5L19 7.5" strokeWidth={3} />
  </Svg>
);

export const ChevronIcon = ({ dir, className }: P & { dir: 'left' | 'right' }) => (
  <Svg className={className}>{dir === 'left' ? <path d="m15 5-7 7 7 7" strokeWidth={3} /> : <path d="m9 5 7 7-7 7" strokeWidth={3} />}</Svg>
);

export const WrenchIcon = ({ className }: P) => (
  <Svg className={className} fill>
    <path d="M21 7.2a5.2 5.2 0 0 1-7 4.9l-7.6 7.6a2 2 0 0 1-2.8 0l-.3-.3a2 2 0 0 1 0-2.8l7.6-7.6A5.2 5.2 0 0 1 17.4 2l-3 3 .9 3.7 3.7.9 3-3z" />
  </Svg>
);

export const BrushIcon = ({ className }: P) => (
  <Svg className={className} fill>
    <path d="M20.7 3.3a1.6 1.6 0 0 0-2.2 0l-8.7 8.1 2.8 2.8 8.1-8.7a1.6 1.6 0 0 0 0-2.2M8.6 13.1c-2.1 0-3.6 1.6-3.6 3.6 0 1.4-.9 2.1-2 2.6 1 .9 2.7 1.4 4.1 1.4a4.6 4.6 0 0 0 4.4-4.7z" />
  </Svg>
);

export const WheelIcon = ({ className }: P) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.6" />
    <path d="M12 3v6.4M12 14.6V21M3 12h6.4M14.6 12H21M5.6 5.6l4.6 4.6M13.8 13.8l4.6 4.6M18.4 5.6l-4.6 4.6M10.2 13.8l-4.6 4.6" />
  </Svg>
);

export const SparklesIcon = ({ className }: P) => (
  <Svg className={className} fill>
    <path d="M10 3.5 11.7 8l4.5 1.7-4.5 1.7L10 16l-1.7-4.6L3.8 9.7 8.3 8zM18 13l.9 2.2 2.1.8-2.1.9L18 19l-.9-2.1-2.1-.9 2.1-.8zM18 2.5l.7 1.6 1.6.7-1.6.6L18 7l-.7-1.6-1.6-.6 1.6-.7z" />
  </Svg>
);

export const StickerIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M4 4h16v9.5L13.5 20H4z" />
    <path d="M13.5 20v-6.5H20" />
  </Svg>
);

export const PatternIcon = ({ className }: P) => (
  <Svg className={className} fill>
    <path d="M3 3h6v6H3zM15 3h6v6h-6zM9 9h6v6H9zM3 15h6v6H3zM15 15h6v6h-6z" />
  </Svg>
);

export const ImageIcon = ({ className }: P) => (
  <Svg className={className}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="m3.5 17 5-5 4 4 2.5-2.5 5 5" />
    <circle cx="15.5" cy="9" r="1.6" />
  </Svg>
);

export const FlameIcon = ({ className }: P) => (
  <Svg className={className} fill>
    <path d="M12.6 2.2c.6 3.1-1.6 4.6-3.1 6.6-1.4 1.9-2.6 3.6-2.6 6.1A5.1 5.1 0 0 0 12 20.1a5.1 5.1 0 0 0 5.1-5.2c0-1.6-.6-3-1.4-4.2-.3 1.3-1 2.2-2 2.6.6-3.2-.2-7.6-1.1-11.1M12 20.1c-1.6 0-2.8-1.2-2.8-2.8 0-1.5 1-2.4 2-3.6.2 1.1.8 1.8 1.6 2.1.1-.6.4-1.1.8-1.6.6.9 1.2 1.9 1.2 3.1 0 1.6-1.2 2.8-2.8 2.8" />
  </Svg>
);

export const SpeedIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M4.2 17a8.5 8.5 0 1 1 15.6 0" />
    <path d="m12 14 4.5-5" strokeWidth={2.6} />
    <circle cx="12" cy="14" r="1.4" fill="currentColor" />
  </Svg>
);

export const AccelIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M3.5 12.5a8.5 8.5 0 1 1 3 6.5" />
    <path d="M12 12.5 8 8M3 19h5" strokeWidth={2.6} />
  </Svg>
);

export const SteeringIcon = ({ className }: P) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="8.8" />
    <circle cx="12" cy="12" r="2.2" />
    <path d="M3.5 10.5c3-1 5.8-1 8.5-1s5.5 0 8.5 1M10.5 14 8 20M13.5 14l2.5 6" />
  </Svg>
);

export const StabilityIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6z" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Svg>
);

export const TurboIcon = ({ className }: P) => (
  <Svg className={className}>
    <circle cx="11" cy="12" r="7.5" />
    <path d="M11 12c0-3 1.5-4.5 4-4.5M11 12c-3 0-4.5-1.5-4.5-4M11 12c0 3-1.5 4.5-4 4.5M11 12c3 0 4.5 1.5 4.5 4M18.5 12H22" />
  </Svg>
);

export const EngineIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M7 7.5h6V5.5H9M10 7.5V5.5" />
    <path d="M4 10.5h2v-3h9l2 2.5h2v-2h2v9h-2v-2h-2l-2 3H6.5L6 16H4z" />
  </Svg>
);

export const BrakeIcon = ({ className }: P) => (
  <Svg className={className}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3" />
    <path d="M17.5 5.5a8.6 8.6 0 0 1 3 5" strokeWidth={3.4} />
  </Svg>
);

export const CoinIcon = ({ className = 'h-5 w-5' }: P) => (
  <span
    className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-gold-300 to-gold-600 font-display text-[0.6em] leading-none text-night-950 shadow-[inset_0_-2px_0_rgba(0,0,0,0.25),0_0_0_1.5px_#9b7200] ${className}`}
    aria-hidden
  >
    V
  </span>
);

export const PlusIcon = ({ className }: P) => (
  <Svg className={className}>
    <path d="M12 5v14M5 12h14" strokeWidth={3.2} />
  </Svg>
);
