import type { ReactNode } from 'react';
import { useStore } from '../../state/store';
import { appStore, goTo, type Screen } from '../../state/appStore';
import { AudioEngine } from '../../game/audio/AudioEngine';
import { CarIcon, CartIcon, ChatIcon, CoinIcon, GamepadIcon, HomeIcon, LockIcon, StarIcon, TrophyIcon } from './icons';

interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  screen?: Screen;
}

const ITEMS: NavItem[] = [
  { id: 'home', label: 'Accueil', icon: <HomeIcon />, screen: 'home' },
  { id: 'play', label: 'Jouer', icon: <GamepadIcon />, screen: 'play' },
  { id: 'garage', label: 'Garage', icon: <CarIcon />, screen: 'garage' },
  { id: 'shop', label: 'Boutique', icon: <CartIcon /> },
  { id: 'tournaments', label: 'Tournois', icon: <TrophyIcon /> },
  { id: 'forum', label: 'Forum', icon: <ChatIcon /> },
];

/** Small wordmark used in navigation bars. */
export const MiniLogo = ({ className = '' }: { className?: string }) => (
  <div className={`font-display text-outline leading-[0.85] italic select-none ${className}`} aria-label="Race Rush">
    <div className="text-xl text-white drop-shadow-[0_3px_0_rgba(31,107,255,0.7)]">RACE</div>
    <div className="bg-gradient-to-b from-gold-300 to-[#ff7a1a] bg-clip-text text-2xl text-transparent">RUSH</div>
  </div>
);

/**
 * Top navigation (garage reference): sections, v-MRU balance, level and avatar.
 * Shop, tournaments and forum are shown locked: they are outside the MVP scope.
 */
export const TopNav = ({ active, compact, narrow = false }: { active: 'home' | 'play' | 'garage'; compact: boolean; narrow?: boolean }) => {
  const profile = useStore(appStore, (s) => s.profile);
  const pct = profile ? Math.max(0, Math.min(1, (profile.xp - profile.xpLevelStart) / Math.max(1, profile.xpNextLevel - profile.xpLevelStart))) : 0;

  return (
    <nav
      className="pointer-events-auto flex items-center gap-1.5 sm:gap-2"
      style={{ paddingLeft: 'calc(12px + var(--safe-l))', paddingRight: 'calc(12px + var(--safe-r))', paddingTop: 'calc(8px + var(--safe-t))' }}
      aria-label="Navigation principale"
    >
      {!compact && <MiniLogo className="mr-2" />}
      <ul className="flex min-w-0 items-center gap-1 sm:gap-1.5">
        {ITEMS.filter((it) => !narrow || it.screen).map((it) => {
          const isActive = it.id === active;
          const locked = !it.screen;
          return (
            <li key={it.id}>
              <button
                type="button"
                data-testid={`nav-${it.id}`}
                aria-current={isActive ? 'page' : undefined}
                aria-disabled={locked || undefined}
                aria-label={locked ? `${it.label} — bientôt disponible` : it.label}
                title={locked ? 'Bientôt disponible' : it.label}
                onClick={() => {
                  if (locked || isActive || !it.screen) return;
                  AudioEngine.click();
                  goTo(it.screen);
                }}
                className={`relative flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-sm font-bold transition-all duration-150 focus-visible:ring-4 focus-visible:ring-cyanx-400/50 focus-visible:outline-none ${
                  isActive
                    ? 'border-gold-300 bg-gradient-to-b from-gold-300 to-gold-500 text-night-950 shadow-lg shadow-gold-500/25'
                    : locked
                      ? 'cursor-not-allowed border-white/10 bg-night-950/80 text-white/50'
                      : 'border-white/15 bg-night-900/70 text-white/90 hover:bg-night-700/80 active:scale-95'
                }`}
              >
                <span className="[&>svg]:h-[18px] [&>svg]:w-[18px]">{it.icon}</span>
                {!compact && <span>{it.label}</span>}
                {locked && <LockIcon className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-night-950 p-[1px] text-white/70" />}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {profile ? (
          <>
            <div className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-night-900/75 py-1 pr-3 pl-1.5" data-testid="vmru-balance">
              <CoinIcon className="h-6 w-6 text-sm" />
              <div className="leading-none">
                <div className="font-display text-base text-white tabular-nums">{profile.balance.toLocaleString('fr-FR')}</div>
                {!compact && <div className="text-[9px] font-bold tracking-wider text-white/55">v-MRU</div>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-night-900/75 px-2 py-1" data-testid="level-badge">
              <StarIcon className="h-5 w-5 text-gold-400" />
              <div className="leading-none">
                <div className="font-display text-sm text-white">Niv. {profile.level}</div>
                <div className="mt-1 h-1.5 w-14 overflow-hidden rounded-full bg-night-950/80 sm:w-20">
                  <div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500" style={{ width: `${pct * 100}%` }} />
                </div>
              </div>
            </div>
            {!compact && (
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-night-900/75 py-1 pr-3 pl-1">
                <span className="font-display flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-volt-400 to-volt-600 text-sm text-white ring-2 ring-white/70">
                  {profile.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-[110px] truncate text-sm font-bold">{profile.name}</span>
              </div>
            )}
          </>
        ) : (
          <span className="rounded-xl bg-night-900/75 px-3 py-1.5 text-xs font-bold text-gold-300">HORS LIGNE</span>
        )}
      </div>
    </nav>
  );
};
