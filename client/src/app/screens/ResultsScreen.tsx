import { useEffect, useState } from 'react';
import { formatRaceTime, paintById, TRACKS, type ResultDTO } from '@race-rush/shared';
import { useStore } from '../../state/store';
import { appStore, goTo } from '../../state/appStore';
import { actions } from '../actions';
import { Button, Panel, VehicleIcon } from '../components/ui';
import { AudioEngine } from '../../game/audio/AudioEngine';

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

const PODIUM_STYLE = ['from-gold-300 to-gold-600 text-night-950', 'from-slate-200 to-slate-400 text-night-950', 'from-amber-600 to-amber-800 text-white'];

const Row = ({ r, local }: { r: ResultDTO; local: boolean }) => (
  <li className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${local ? 'bg-volt-500/25 ring-1 ring-volt-400/60' : 'bg-night-950/45'}`}>
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b font-display ${PODIUM_STYLE[r.position - 1] ?? 'from-night-700 to-night-800 text-white'}`}>{r.position}</span>
    <VehicleIcon id={r.vehicle} color={paintById(r.color).hex} className="h-6 w-11 shrink-0" />
    <span className="min-w-0 flex-1 truncate font-display">
      {r.name}
      {r.isBot && <span className="ml-1 text-xs text-white/40">BOT</span>}
    </span>
    {r.flagged ? (
      <span className="rounded-lg bg-rush-500/80 px-2 py-0.5 text-xs font-bold">DSQ</span>
    ) : (
      <span className="text-right font-display tabular-nums">
        {r.finished ? formatRaceTime(r.time) : <span className="text-white/45">DNF</span>}
        {r.bestLap != null && <span className="block text-[10px] font-sans font-semibold text-white/45">Tour {formatRaceTime(r.bestLap)}</span>}
      </span>
    )}
  </li>
);

export const ResultsScreen = () => {
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

  return (
    <div className="absolute inset-0 flex flex-col bg-night-950/70 backdrop-blur-[3px]" data-testid="results-screen">
      <div className="scroll-y flex-1 px-4 py-4" style={{ paddingLeft: 'calc(16px + var(--safe-l))', paddingRight: 'calc(16px + var(--safe-r))', paddingTop: 'calc(12px + var(--safe-t))' }}>
        <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-[1.25fr_1fr]">
          <Panel className="p-4">
            <div className="flex items-baseline justify-between">
              <h1 className="font-display text-outline text-3xl italic">CLASSEMENT</h1>
              <span className="text-sm font-semibold text-white/55">{TRACKS[res.trackId]?.name}</span>
            </div>
            <ol className="mt-3 flex flex-col gap-1.5" data-testid="results-table">
              {res.results.map((r) => (
                <Row key={r.id} r={r} local={r.id === res.localId} />
              ))}
            </ol>
          </Panel>

          <Panel className="flex flex-col p-4">
            <div className="text-center">
              <div className="text-xs font-bold tracking-[0.3em] text-volt-400">TA COURSE</div>
              <div className="animate-pop font-display text-outline text-6xl text-gold-400" data-testid="my-position">
                {me ? (me.flagged ? 'DSQ' : me.position === 1 ? '1er' : `${me.position}e`) : '—'}
              </div>
              {me?.finished && <div className="font-display text-lg tabular-nums">{formatRaceTime(me.time)}</div>}
            </div>

            {res.mode === 'online' && res.rewards === 'granted' && reward ? (
              <div className="mt-4 grid grid-cols-2 gap-2" data-testid="rewards">
                <div className="rounded-2xl bg-night-950/55 p-3 text-center">
                  <div className="text-xs font-bold tracking-[0.2em] text-cyanx-400">XP</div>
                  <div className="font-display text-3xl" data-testid="reward-xp">
                    +{xp}
                  </div>
                </div>
                <div className="rounded-2xl bg-night-950/55 p-3 text-center">
                  <div className="text-xs font-bold tracking-[0.2em] text-gold-300">v-MRU</div>
                  <div className="font-display text-3xl text-gold-300" data-testid="reward-vmru">
                    +{vmru}
                  </div>
                </div>
                {levelUp && (
                  <div className="animate-pop col-span-2 rounded-2xl bg-gradient-to-r from-volt-500 to-cyanx-400 p-2 text-center font-display text-xl">NIVEAU {reward.levelAfter} ATTEINT !</div>
                )}
                <div className="col-span-2 text-center text-sm text-white/60">
                  Solde : <span className="font-bold text-gold-300">{(profile?.balance ?? reward.balance).toLocaleString('fr-FR')} v-MRU</span> · Niveau {profile?.level ?? reward.levelAfter}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-night-950/55 p-3 text-center text-sm leading-relaxed text-white/65" data-testid="rewards-unavailable">
                {res.mode === 'offline'
                  ? 'Course d’entraînement hors ligne : aucune récompense (les récompenses sont calculées uniquement par le serveur).'
                  : me?.flagged
                    ? 'Course invalidée par le contrôle anti-triche : aucune récompense.'
                    : 'Récompenses momentanément indisponibles (serveur). Ta course n’a pas été créditée.'}
              </div>
            )}

            <div className="mt-auto flex flex-col gap-2 pt-4">
              <Button variant="gold" size="lg" onClick={() => actions.rematch()} data-testid="rematch-button">
                ↻ REJOUER
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="volt" size="md" onClick={() => goTo('garage')} data-testid="results-garage">
                  GARAGE
                </Button>
                <Button variant="ghost" size="md" onClick={() => actions.backHome()} data-testid="results-home">
                  ACCUEIL
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
};
