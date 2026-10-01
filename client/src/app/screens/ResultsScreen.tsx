import { useEffect, useState, type ReactNode } from 'react';
import { formatRaceTime, paintById, TRACKS, type ResultDTO } from '@race-rush/shared';
import { useStore } from '../../state/store';
import { appStore, goTo } from '../../state/appStore';
import { actions } from '../actions';
import { AudioEngine } from '../../game/audio/AudioEngine';
import { CoinIcon, HomeIcon, StarIcon } from '../components/icons';

/** Counts up to a target for satisfying reward reveals. */
const useCountUp = (target: number, delay = 300, duration = 900) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (t: number) => {
      const k = Math.max(0, Math.min(1, (t - start) / duration));
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, delay, duration]);
  return v;
};

const PLACE_BADGE = [
  'bg-gradient-to-b from-gold-300 to-gold-600 text-night-950',
  'bg-gradient-to-b from-slate-100 to-slate-400 text-night-950',
  'bg-gradient-to-b from-[#ffc08a] to-[#a8561c] text-white',
];

const CrownIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M3 18.5 2 7.5l5.5 4.5L12 4.5l4.5 7.5L22 7.5l-1 11z" />
  </svg>
);

const PersonIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <circle cx="12" cy="8" r="4.2" />
    <path d="M3.8 21a8.2 8.2 0 0 1 16.4 0z" />
  </svg>
);

const gapLabel = (r: ResultDTO, leaderTime: number | null): string => {
  if (r.flagged) return 'DSQ';
  if (!r.finished || r.time == null) return 'DNF';
  if (leaderTime == null || r.position === 1) return '—';
  return `+${(r.time - leaderTime).toFixed(2)}`;
};

const Row = ({ r, local, leaderTime }: { r: ResultDTO; local: boolean; leaderTime: number | null }) => (
  <li
    className={`grid grid-cols-[2.2rem_1fr_auto_3.6rem] items-center gap-2 rounded-xl px-1.5 py-0.5 tall:py-1.5 ${
      local ? 'bg-gradient-to-r from-gold-400 to-gold-500 font-bold text-night-950 shadow-[0_0_18px_rgba(255,198,26,0.35)]' : 'bg-night-900/75'
    }`}
  >
    <span className={`font-display flex h-7 w-8 items-center justify-center rounded-lg text-lg italic ${PLACE_BADGE[r.position - 1] ?? (local ? 'bg-night-950/20' : 'bg-night-700 text-white')}`}>
      {r.position}
    </span>
    <span className="flex min-w-0 items-center gap-2">
      {r.position === 1 && <CrownIcon className={`h-4 w-4 shrink-0 ${local ? 'text-night-950' : 'text-gold-400'}`} />}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ring-white/40" style={{ background: paintById(r.color).hex }}>
        <PersonIcon className="h-4 w-4 text-white/90" />
      </span>
      <span className="truncate font-semibold">
        {local ? 'Toi' : r.name}
        {r.isBot && !local && <span className="ml-1 text-[10px] font-bold text-white/40">BOT</span>}
      </span>
    </span>
    <span className="font-display text-sm tabular-nums">{r.finished && !r.flagged ? formatRaceTime(r.time) : '—'}</span>
    <span className={`font-display text-right text-sm tabular-nums ${r.flagged ? 'text-rush-500' : ''}`}>{gapLabel(r, leaderTime)}</span>
  </li>
);

const Panel = ({ children, className = '', testId }: { children: ReactNode; className?: string; testId?: string }) => (
  <section className={`rounded-2xl border border-white/12 bg-night-950/85 p-3 shadow-2xl backdrop-blur-md ${className}`} data-testid={testId}>
    {children}
  </section>
);

const ActionButton = ({ onClick, testId, className, children }: { onClick: () => void; testId: string; className: string; children: ReactNode }) => (
  <button
    type="button"
    data-testid={testId}
    onClick={() => {
      AudioEngine.click();
      onClick();
    }}
    className={`font-display flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm whitespace-nowrap tracking-wide sm:text-base transition-all duration-150 focus-visible:ring-4 focus-visible:ring-cyanx-400/60 focus-visible:outline-none tall:py-3 tall:text-lg ${className}`}
  >
    {children}
  </button>
);

const useShortScreen = () => {
  const get = () => window.innerHeight < 520 && window.innerWidth > window.innerHeight;
  const [short, setShort] = useState(get);
  useEffect(() => {
    const on = () => setShort(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return short;
};

export const ResultsScreen = () => {
  const short = useShortScreen();
  const res = useStore(appStore, (s) => s.results);
  const profile = useStore(appStore, (s) => s.profile);
  const me = res?.results.find((r) => r.id === res.localId);
  const reward = me?.reward ?? null;
  const xp = useCountUp(reward?.xp ?? 0, 500);
  const vmru = useCountUp(reward?.vmru ?? 0, 900);

  useEffect(() => {
    if (res?.mode === 'online') void actions.refreshProfile();
    if (me?.position === 1) AudioEngine.finish();
  }, [res, me?.position]);

  if (!res) return null;
  const levelUp = reward && reward.levelAfter > reward.levelBefore;
  const leader = res.results.find((r) => r.position === 1 && r.finished && !r.flagged);
  const leaderTime = leader?.time ?? null;
  const won = me?.position === 1 && !me.flagged;
  const myPlace = me ? (me.flagged ? 'DSQ' : me.position === 1 ? '1er' : `${me.position}e`) : '—';

  const actionsRow = (
    <div className="grid grid-cols-3 gap-2">
      <ActionButton onClick={() => actions.backHome()} testId="results-home" className="border border-white/20 bg-night-900/90 text-white hover:bg-night-700 active:scale-95">
        <HomeIcon className="h-5 w-5" />
        MENU
      </ActionButton>
      <ActionButton onClick={() => actions.rematch()} testId="rematch-button" className="btn-gold">
        ↻ REJOUER
      </ActionButton>
      <ActionButton onClick={() => goTo('garage')} testId="results-garage" className="btn-volt">
        CONTINUER
      </ActionButton>
    </div>
  );

  return (
    <div className="pointer-events-none absolute inset-0 flex portrait:flex-col" data-testid="results-screen">
      {/* Title over the podium */}
      <div className="flex min-w-0 flex-1 flex-col items-start p-4 portrait:flex-none portrait:items-center" style={{ paddingLeft: 'calc(16px + var(--safe-l))', paddingTop: 'calc(12px + var(--safe-t))' }}>
        <div className={`font-display text-outline animate-pop text-3xl whitespace-nowrap italic sm:text-4xl tall:text-5xl ${won ? 'countdown-digit' : 'text-white'}`}>{won ? 'VICTOIRE !' : 'COURSE TERMINÉE !'}</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-lg bg-night-950/75 px-2.5 py-1 text-sm font-bold">
            Ta position : <span className="font-display text-gold-300" data-testid="my-position">{myPlace}</span>
          </span>
          {me?.finished && !me.flagged && <span className="font-display rounded-lg bg-night-950/75 px-2.5 py-1 text-sm tabular-nums">{formatRaceTime(me.time)}</span>}
          <span className="hidden rounded-lg bg-night-950/60 px-2.5 py-1 text-xs font-semibold text-white/70 sm:inline">{TRACKS[res.trackId]?.name}</span>
        </div>
        {short && <div className="pointer-events-auto mt-auto w-full max-w-[420px]">{actionsRow}</div>}
      </div>

      {/* Ranking, rewards and actions */}
      <div
        className="scroll-y pointer-events-auto flex w-[min(44vw,460px)] min-w-[330px] shrink-0 flex-col gap-2 p-3 portrait:mt-auto portrait:max-h-[64vh] portrait:w-full portrait:min-w-0"
        style={{ paddingRight: 'calc(12px + var(--safe-r))', paddingTop: 'calc(10px + var(--safe-t))', paddingBottom: 'calc(10px + var(--safe-b))' }}
      >
        <Panel>
          <h2 className="font-display mb-1.5 text-lg tracking-wide">CLASSEMENT FINAL</h2>
          <div className="mb-1 grid grid-cols-[2.2rem_1fr_auto_3.6rem] gap-2 px-1.5 text-[11px] font-bold tracking-wider text-white/55">
            <span>POS</span>
            <span>JOUEUR</span>
            <span>TEMPS</span>
            <span className="text-right">ÉCART</span>
          </div>
          <ol className="flex flex-col gap-1" data-testid="results-table">
            {res.results.map((r) => (
              <Row key={r.id} r={r} local={r.id === res.localId} leaderTime={leaderTime} />
            ))}
          </ol>
        </Panel>

        <Panel>
          <h2 className="font-display mb-1.5 text-lg tracking-wide">RÉCOMPENSES</h2>
          {res.mode === 'online' && res.rewards === 'granted' && reward ? (
            <div className="grid grid-cols-2 gap-2" data-testid="rewards">
              <div className="flex items-center gap-3 rounded-xl bg-night-900/80 p-2.5">
                <CoinIcon className="h-11 w-11 text-xl" />
                <div>
                  <div className="font-display text-2xl leading-none text-gold-300" data-testid="reward-vmru">
                    +{vmru}
                  </div>
                  <div className="text-xs font-semibold text-white/65">v-MRU gagnés</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-night-900/80 p-2.5">
                <span className="relative flex h-11 w-11 items-center justify-center text-volt-400">
                  <StarIcon className="h-11 w-11 drop-shadow-[0_0_8px_rgba(77,141,255,0.8)]" />
                  <span className="font-display absolute text-[11px] text-white">XP</span>
                </span>
                <div>
                  <div className="font-display text-2xl leading-none" data-testid="reward-xp">
                    +{xp}
                  </div>
                  <div className="text-xs font-semibold text-white/65">XP gagnée</div>
                </div>
              </div>
              {levelUp && (
                <div className="animate-pop font-display col-span-2 rounded-xl bg-gradient-to-r from-volt-500 to-cyanx-400 p-1.5 text-center text-lg">NIVEAU {reward.levelAfter} ATTEINT !</div>
              )}
              <div className="col-span-2 text-center text-xs text-white/60">
                Solde : <span className="font-bold text-gold-300">{(profile?.balance ?? reward.balance).toLocaleString('fr-FR')} v-MRU</span> · Niveau {profile?.level ?? reward.levelAfter}
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-night-900/80 p-2.5 text-sm leading-relaxed text-white/70" data-testid="rewards-unavailable">
              {res.mode === 'offline'
                ? 'Course d’entraînement hors ligne : aucune récompense (les récompenses sont calculées uniquement par le serveur).'
                : me?.flagged
                  ? 'Course invalidée par le contrôle anti-triche : aucune récompense.'
                  : 'Récompenses momentanément indisponibles (serveur). Ta course n’a pas été créditée.'}
            </p>
          )}
        </Panel>

        {!short && actionsRow}
      </div>
    </div>
  );
};
