import { useEffect, useState } from 'react';
import { MAX_UPGRADE_LEVEL, PAINTS, paintById, VEHICLE_IDS, VEHICLES, type UpgradeStat, type VehicleId } from '@race-rush/shared';
import { useStore } from '../../state/store';
import { appStore, goTo } from '../../state/appStore';
import { api } from '../../net/api';
import { actions, currentSelection } from '../actions';
import { Button, LevelBadge, Panel, ScreenHeader, SectionTitle, StatBar, VehicleIcon, VmruBadge } from '../components/ui';
import { AudioEngine } from '../../game/audio/AudioEngine';
import { garagePreview } from '../backdrop';

const UPGRADES: { stat: UpgradeStat; label: string; desc: string }[] = [
  { stat: 'engine', label: 'Moteur', desc: 'Vitesse max + accélération' },
  { stat: 'handling', label: 'Tenue de route', desc: 'Direction + adhérence' },
  { stat: 'boost', label: 'Boost', desc: 'Réserve + puissance' },
];

type Tab = 'stats' | 'upgrades' | 'paint';

export const GarageScreen = () => {
  const profile = useStore(appStore, (s) => s.profile);
  const catalog = useStore(appStore, (s) => s.catalog);
  const sel = currentSelection();
  const [viewing, setViewing] = useState<VehicleId>(sel.vehicle);
  const [tab, setTab] = useState<Tab>('stats');
  const [pending, setPending] = useState(false);

  const owned = profile?.vehicles.find((v) => v.vehicle === viewing);
  const color = owned?.color ?? (viewing === sel.vehicle ? sel.color : 'red');
  const upgrades = owned?.upgrades ?? { engine: 0, handling: 0, boost: 0 };
  const spec = VEHICLES[viewing];
  const isSelected = sel.vehicle === viewing;

  useEffect(() => {
    garagePreview(viewing, color);
  }, [viewing, color]);

  const run = async (fn: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  };

  const buyPaint = (code: string) =>
    run(async () => {
      if (await actions.garage(api.purchase, code)) {
        AudioEngine.confirm();
        await actions.paint(viewing, code);
      }
    });

  const upgrade = (stat: UpgradeStat) =>
    run(async () => {
      if (await actions.garage(api.upgrade, viewing, stat)) AudioEngine.confirm();
    });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'stats', label: 'STATS' },
    { id: 'upgrades', label: 'AMÉLIORER' },
    { id: 'paint', label: 'PEINTURE' },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col" data-testid="garage-screen">
      <div className="pointer-events-auto">
        <ScreenHeader
          title="GARAGE"
          onBack={() => goTo('home')}
          right={
            profile && (
              <>
                <div className="hidden sm:block">
                  <LevelBadge level={profile.level} xp={profile.xp} start={profile.xpLevelStart} next={profile.xpNextLevel} />
                </div>
                <VmruBadge amount={profile.balance} />
              </>
            )
          }
        />
      </div>

      <div className="relative flex min-h-0 flex-1 gap-3 px-4 pt-2 pb-3 portrait:flex-col" style={{ paddingLeft: 'calc(16px + var(--safe-l))', paddingRight: 'calc(16px + var(--safe-r))', paddingBottom: 'calc(12px + var(--safe-b))' }}>
        {/* Vehicle list */}
        <div className="pointer-events-auto flex w-[118px] shrink-0 flex-col gap-2 sm:w-[150px] portrait:order-2 portrait:w-full portrait:flex-row" role="listbox" aria-label="Véhicules">
          {VEHICLE_IDS.map((v) => {
            const pv = profile?.vehicles.find((x) => x.vehicle === v);
            const c = pv?.color ?? (v === sel.vehicle ? sel.color : 'red');
            return (
              <button
                key={v}
                type="button"
                role="option"
                aria-selected={viewing === v}
                data-testid={`garage-vehicle-${v}`}
                onClick={() => {
                  AudioEngine.click();
                  setViewing(v);
                }}
                className={`glass relative flex flex-col items-center rounded-2xl border-2 px-2 py-2 transition-all active:scale-95 portrait:flex-1 portrait:px-1 ${viewing === v ? 'border-gold-400' : 'border-transparent opacity-80 hover:opacity-100'}`}
              >
                <VehicleIcon id={v} color={paintById(c).hex} className="h-8 w-16" />
                <span className="text-xs font-bold">{VEHICLES[v].name}</span>
                {sel.vehicle === v && <span className="absolute top-1 right-1.5 text-[10px] text-gold-300">●</span>}
              </button>
            );
          })}
        </div>

        {/* Center: 3D orbit area (pointer events reach the canvas) */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-end portrait:order-1 portrait:min-h-[26vh]">
          <div className="pointer-events-none rounded-full bg-night-950/50 px-3 py-1 text-xs font-semibold text-white/60">⟲ Glisse pour tourner · pince pour zoomer</div>
        </div>

        {/* Details panel */}
        <Panel className="pointer-events-auto flex w-[min(46vw,380px)] min-w-[250px] flex-col p-3 sm:p-4 portrait:order-3 portrait:max-h-[44vh] portrait:w-full portrait:min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-display text-2xl leading-tight italic" data-testid="garage-vehicle-name">
                {spec.name}
              </div>
              <div className="text-sm text-white/65">{spec.tagline}</div>
            </div>
            <span className="rounded-xl bg-volt-500/25 px-2 py-1 font-display text-sm">NIV. {1 + upgrades.engine + upgrades.handling + upgrades.boost}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-night-950/50 p-1" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                data-testid={`garage-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`rounded-xl py-1.5 text-xs font-bold tracking-wider transition-colors ${tab === t.id ? 'bg-volt-500 text-white' : 'text-white/60 hover:text-white'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="scroll-y mt-3 min-h-0 flex-1">
            {tab === 'stats' && (
              <div className="flex flex-col gap-2.5">
                <StatBar label="Vitesse" value={spec.stats.speed} bonus={upgrades.engine * 0.2} />
                <StatBar label="Accél." value={spec.stats.accel} bonus={upgrades.engine * 0.2} />
                <StatBar label="Maniabilité" value={spec.stats.handling} bonus={upgrades.handling * 0.2} />
                <StatBar label="Stabilité" value={spec.stats.stability} bonus={upgrades.handling * 0.1} />
                <p className="mt-1 text-sm leading-relaxed text-white/60">Les différences se ressentent en course : poids, adhérence, drift et suspension sont propres à chaque véhicule.</p>
              </div>
            )}

            {tab === 'upgrades' && (
              <div className="flex flex-col gap-2">
                {UPGRADES.map((u) => {
                  const level = upgrades[u.stat];
                  const cost = catalog?.upgradeCosts[level];
                  const maxed = level >= MAX_UPGRADE_LEVEL;
                  const affordable = !!profile && cost !== undefined && profile.balance >= cost;
                  return (
                    <div key={u.stat} className="flex items-center gap-3 rounded-2xl bg-night-950/45 p-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-sm">{u.label}</div>
                        <div className="mt-1 flex gap-1" aria-label={`Niveau ${level} sur ${MAX_UPGRADE_LEVEL}`}>
                          {Array.from({ length: MAX_UPGRADE_LEVEL }, (_, i) => (
                            <span key={i} className={`h-2 w-5 rounded-sm ${i < level ? 'bg-gold-400' : 'bg-white/15'}`} />
                          ))}
                        </div>
                        <div className="mt-0.5 text-[11px] text-white/50">{u.desc}</div>
                      </div>
                      <Button
                        size="sm"
                        variant={affordable && !maxed ? 'gold' : 'ghost'}
                        disabled={!profile || maxed || !affordable || pending}
                        onClick={() => upgrade(u.stat)}
                        data-testid={`upgrade-${u.stat}`}
                        sound={false}
                      >
                        {maxed ? 'MAX' : `+1 · ${cost ?? '—'} V`}
                      </Button>
                    </div>
                  );
                })}
                {!profile && <p className="text-sm text-white/55">Améliorations disponibles en ligne uniquement.</p>}
              </div>
            )}

            {tab === 'paint' && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-4 gap-2">
                  {PAINTS.map((p) => {
                    const unlocked = !p.premium || profile?.cosmetics.includes(p.id);
                    const price = catalog?.paints.find((c) => c.code === p.id)?.price ?? 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        data-testid={`paint-${p.id}`}
                        aria-label={`${p.name}${unlocked ? '' : ` — ${price} v-MRU`}`}
                        disabled={pending}
                        onClick={() => {
                          AudioEngine.click();
                          if (unlocked) void run(() => actions.paint(viewing, p.id));
                          else if (profile) void buyPaint(p.id);
                        }}
                        className={`relative flex flex-col items-center gap-1 rounded-2xl border-2 p-1.5 transition-transform active:scale-90 ${color === p.id ? 'border-gold-400 bg-gold-500/10' : 'border-transparent bg-night-950/40'}`}
                      >
                        <span className="h-9 w-9 rounded-full border border-white/30 shadow-inner" style={{ background: p.hex }} />
                        <span className="text-[10px] leading-tight font-bold">{unlocked ? p.name.split(' ')[0] : `🔒 ${price}`}</span>
                      </button>
                    );
                  })}
                </div>
                <div>
                  <SectionTitle className="mt-1">Bientôt disponible</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    {(catalog?.comingSoon ?? [
                      { code: 's', name: 'Stickers', type: 'sticker' },
                      { code: 'p', name: 'Motifs', type: 'pattern' },
                      { code: 'w', name: 'Jantes', type: 'wheels' },
                      { code: 'b', name: 'Effets boost', type: 'boost_fx' },
                    ]).map((c) => (
                      <span key={c.code} className="rounded-xl border border-white/10 bg-night-950/40 px-2.5 py-1 text-xs font-semibold text-white/45">
                        🔒 {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            {!isSelected ? (
              <Button variant="gold" size="md" className="flex-1" disabled={pending} onClick={() => run(() => actions.selectVehicle(viewing))} data-testid="select-vehicle">
                SÉLECTIONNER
              </Button>
            ) : (
              <Button variant="gold" size="md" className="flex-1" onClick={() => goTo('play')} data-testid="garage-race">
                ▶ COURIR
              </Button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
};
