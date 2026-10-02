/**
 * RACE RUSH wordmark (menu reference): white "RACE" outlined in blue, gold→orange "RUSH",
 * checkered flag and speed streaks. Pure SVG, scales to any size, uses the display font.
 */
export const RaceRushLogo = ({ className = '', title = 'Race Rush' }: { className?: string; title?: string }) => (
  <svg viewBox="0 0 520 250" className={className} role="img" aria-label={title}>
    <defs>
      <linearGradient id="rrRush" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff3a0" />
        <stop offset="0.45" stopColor="#ffc61a" />
        <stop offset="1" stopColor="#ff6a1a" />
      </linearGradient>
      <linearGradient id="rrRace" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#d6e6ff" />
      </linearGradient>
      <linearGradient id="rrStreak" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ff3b30" stopOpacity="0" />
        <stop offset="1" stopColor="#ff8a1f" />
      </linearGradient>
      <pattern id="rrChecker" width="20" height="20" patternUnits="userSpaceOnUse">
        <rect width="20" height="20" fill="#ffffff" />
        <rect width="10" height="10" fill="#111827" />
        <rect x="10" y="10" width="10" height="10" fill="#111827" />
      </pattern>
    </defs>
    {/* Speed streaks */}
    <g transform="skewX(-14)">
      <rect x="70" y="40" width="190" height="10" rx="5" fill="url(#rrStreak)" />
      <rect x="40" y="200" width="230" height="10" rx="5" fill="url(#rrStreak)" />
      <rect x="330" y="20" width="160" height="8" rx="4" fill="url(#rrStreak)" />
    </g>
    {/* Checkered flags */}
    <g transform="translate(18 90) rotate(-18)">
      <rect x="0" y="0" width="70" height="56" fill="url(#rrChecker)" stroke="#0a1438" strokeWidth="5" />
    </g>
    <g transform="translate(430 20) rotate(14)">
      <rect x="0" y="0" width="70" height="50" fill="url(#rrChecker)" stroke="#0a1438" strokeWidth="5" />
    </g>
    <g fontFamily="'Russo One', Impact, sans-serif" fontStyle="italic" textAnchor="middle" strokeLinejoin="round" style={{ paintOrder: 'stroke fill' }}>
      <text x="270" y="118" fontSize="104" fill="url(#rrRace)" stroke="#0a1438" strokeWidth="22">
        RACE
      </text>
      <text x="270" y="118" fontSize="104" fill="none" stroke="#1f6bff" strokeWidth="9">
        RACE
      </text>
      <text x="270" y="118" fontSize="104" fill="url(#rrRace)">
        RACE
      </text>
      <text x="282" y="222" fontSize="118" fill="url(#rrRush)" stroke="#0a1438" strokeWidth="22">
        RUSH
      </text>
      <text x="282" y="222" fontSize="118" fill="none" stroke="#ffffff" strokeWidth="7">
        RUSH
      </text>
      <text x="282" y="222" fontSize="118" fill="url(#rrRush)">
        RUSH
      </text>
    </g>
  </svg>
);
