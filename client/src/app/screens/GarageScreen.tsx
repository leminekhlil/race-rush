import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  MAX_UPGRADE_LEVEL,
  NO_UPGRADES,
  PAINTS,
  UPGRADE_STATS,
  VEHICLE_IDS,
  VEHICLES,
  displayStats,
  paintById,
  vehicleLevel,
  type UpgradeLevels,
  type UpgradeStat,
  type VehicleId,
} from '@race-rush/shared';
import { useStore } from '../../state/store';
import { appStore, goTo } from '../../state/appStore';
import { api } from '../../net/api';
import { actions, currentSelection } from '../actions';
import { Button } from '../components/ui';
import { TopNav } from '../components/TopNav';
import {
  AccelIcon,
  BrakeIcon,
  BrushIcon,
  CheckIcon,
  ChevronIcon,
  CoinIcon,
  EngineIcon,
  FlameIcon,
  ImageIcon,
  LockIcon,
  PatternIcon,
  PlusIcon,
  SparklesIcon,
  SpeedIcon,
  StabilityIcon,
  StickerIcon,
  SteeringIcon,
  TurboIcon,
  WheelIcon,
  WrenchIcon,
} from '../components/icons';
import { AudioEngine } from '../../game/audio/AudioEngine';
import { useVehicleThumb } from '../../game/garage/Thumbnails';
import { garageFraming, garagePreview } from '../backdrop';
import { useViewport } from '../useViewport';

/* ------------------------------------------------------------------ data */

const UPGRADE_META: Record<UpgradeStat, { label: string; desc: string; icon: ReactNode; bar: string }> = {
  engine: { label: 'Moteur', desc: 'Vitesse max et accélération', icon: <EngineIcon className="h-6 w-6" />, bar: 'bg-volt-400' },
  boost: { label: 'Turbo', desc: 'Réserve et puissance du boost', icon: <TurboIcon className="h-6 w-6" />, bar: 'bg-[#2ee87a]' },
  brakes: { label: 'Freinage', desc: 'Freinage et tenue en drift', icon: <BrakeIcon className="h-6 w-6" />, bar: 'bg-[#ff8a1f]' },
  handling: { label: 'Maniabilité', desc: 'Direction et adhérence', icon: <SteeringIcon className="h-6 w-6" />, bar: 'bg-gold-400' },
};

type StatKey = keyof ReturnType<typeof displayStats>;

const STAT_ROWS: { key: StatKey; label: string; icon: ReactNode; ring: string; bar: string }[] = [
  { key: 'speed', label: 'Vitesse', icon: <SpeedIcon className="h-4 w-4" />, ring: 'text-volt-400 border-volt-400/70', bar: 'from-volt-500 to-cyanx-400' },
  { key: 'accel', label: 'Accélération', icon: <AccelIcon className="h-4 w-4" />, ring: 'text-cyanx-400 border-cyanx-400/70', bar: 'from-[#12b5a6] to-cyanx-400' },
  { key: 'handling', label: 'Maniabilité', icon: <SteeringIcon className="h-4 w-4" />, ring: 'text-gold-400 border-gold-400/70', bar: 'from-gold-500 to-gold-300' },
  { key: 'stability', label: 'Stabilité', icon: <StabilityIcon className="h-4 w-4" />, ring: 'text-[#ff8a1f] border-[#ff8a1f]/70', bar: 'from-[#ff6a1a] to-[#ffb04d]' },
  { key: 'turbo', label: 'Turbo', icon: <TurboIcon className="h-4 w-4" />, ring: 'text-[#b07cff] border-[#b07cff]/70', bar: 'from-[#8a3dff] to-[#c39bff]' },
];

const STANDARD_PAINTS = PAINTS.filter((p) => !p.premium);

/* ------------------------------------------------------------- helpers */

const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section className={`pointer-events-auto rounded-2xl border border-white/12 bg-night-950/80 shadow-2xl backdrop-blur-md ${className}`}>{children}</section>
);

const LockedChip = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <span
    className="flex cursor-not-allowed items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-white/35"
    title="Bientôt disponible"
    aria-disabled
    aria-label={`${label} — bientôt disponible`}
  >
    <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
    {label}
    <LockIcon className="h-3 w-3" />
  </span>
);

/* -------------------------------------------------------- vehicle list */

interface VehicleRowProps {
  id: VehicleId;
  paint: string;
  level: number;
  viewing: boolean;
  equipped: boolean;
  compact: boolean;
  onClick: () => void;
}

const VehicleRow = ({ id, paint, level, viewing, equipped, compact, onClick }: VehicleRowProps) => {
  const thumb = useVehicleThumb(id, paint, 200, 120);
  return (
    <button
      type="button"
      role="option"
      aria-selected={viewing}
      data-testid={`garage-vehicle-${id}`}
      onClick={onClick}
      className={`relative flex w-full items-center rounded-xl border-2 text-left transition-all duration-150 active:scale-[0.98] ${
        viewing ? 'border-gold-400 bg-night-800/90 shadow-[0_0_18px_rgba(255,198,26,0.3)]' : 'border-white/8 bg-night-900/70 hover:border-white/25'
      } ${compact ? 'flex-col gap-0.5 p-1' : 'gap-2 p-1'}`}
    >
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-b from-night-700/80 to-night-900 ${compact ? 'h-10 w-full' : 'h-14 w-[88px]'}`}>
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-contain" draggable={false} /> : <span className="h-3 w-3 animate-ping rounded-full bg-white/30" />}
      </span>
      <span className={`min-w-0 ${compact ? 'w-full text-center' : 'flex-1'}`}>
        <span className={`block truncate font-bold ${compact ? 'text-[11px]' : 'text-[15px]'}`}>{VEHICLES[id].name}</span>
        <span className={`block font-semibold ${compact ? 'text-[10px]' : 'text-xs'} ${viewing ? 'text-gold-300' : 'text-white/55'}`}>Niv. {level}</span>
      </span>
      {equipped && (
        <span
          className={`flex items-center justify-center rounded-full bg-gold-400 text-night-950 ${compact ? 'absolute top-0.5 right-0.5 h-4 w-4' : 'h-6 w-6 shrink-0'}`}
          aria-label="Équipé"
        >
          <CheckIcon className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        </span>
      )}
    </button>
  );
};

/* ------------------------------------------------------------ stats */

const StatsList = ({ stats, dense }: { stats: ReturnType<typeof displayStats>; dense: boolean }) => (
  <ul className={`flex flex-col ${dense ? 'gap-1.5' : 'gap-2.5'}`}>
    {STAT_ROWS.map((r) => (
      <li key={r.key} className="flex items-center gap-2.5">
        <span className={`flex shrink-0 items-center justify-center rounded-full border-2 bg-night-900 ${r.ring} ${dense ? 'h-6 w-6' : 'h-8 w-8'}`}>{r.icon}</span>
        <div className="min-w-0 flex-1">
          <div className={`font-semibold text-white/85 ${dense ? 'text-xs' : 'text-sm'}`}>{r.label}</div>
          <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ${r.bar}`} style={{ width: `${(stats[r.key] / 10) * 100}%` }} />
          </div>
        </div>
        <span className={`font-display w-9 text-right tabular-nums ${dense ? 'text-sm' : 'text-lg'}`}>{stats[r.key].toFixed(1)}</span>
      </li>
    ))}
  </ul>
);

/* ------------------------------------------------------------ colours */

const ColorThumb = ({ vehicle, paint, active, onPick }: { vehicle: VehicleId; paint: string; active: boolean; onPick: () => void }) => {
  const thumb = useVehicleThumb(vehicle, paint, 200, 120);
  const p = paintById(paint);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Peindre en ${p.name}`}
      aria-pressed={active}
      className={`relative flex w-[92px] shrink-0 flex-col items-center rounded-xl border-2 pb-1 transition-all duration-150 active:scale-95 ${
        active ? 'border-gold-400 bg-night-800' : 'border-transparent bg-night-900/70 hover:border-white/25'
      }`}
    >
      <span className="flex h-14 w-full items-center justify-center">{thumb ? <img src={thumb} alt="" className="h-full w-full object-contain" draggable={false} /> : null}</span>
      <span className={`text-xs font-bold ${active ? 'text-gold-300' : 'text-white/75'}`}>{p.name}</span>
      {active && (
        <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold-400 text-night-950">
          <CheckIcon className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
};

interface PaintProps {
  color: string;
  owned: string[];
  prices: Record<string, number>;
  online: boolean;
  pending: boolean;
  onPaint: (id: string) => void;
  onBuy: (id: string) => void;
}

const Swatches = ({ color, owned, prices, online, pending, onPaint, onBuy, size }: PaintProps & { size: 'sm' | 'lg' }) => (
  <div className={`grid ${size === 'lg' ? 'grid-cols-10 gap-2' : 'grid-cols-5 gap-1.5'}`}>
    {PAINTS.map((p) => {
      const unlocked = !p.premium || owned.includes(p.id);
      const price = prices[p.id] ?? 0;
      const active = color === p.id;
      return (
        <button
          key={p.id}
          type="button"
          data-testid={`paint-${p.id}`}
          aria-label={`${p.name}${unlocked ? '' : ` — ${price} v-MRU`}`}
          aria-pressed={active}
          title={unlocked ? p.name : `${p.name} — ${price} v-MRU`}
          disabled={pending || (!unlocked && !online)}
          onClick={() => {
            AudioEngine.click();
            if (unlocked) onPaint(p.id);
            else onBuy(p.id);
          }}
          className={`relative aspect-[5/4] rounded-xl border-2 shadow-[inset_0_-6px_10px_rgba(0,0,0,0.25),inset_0_4px_6px_rgba(255,255,255,0.25)] transition-all duration-150 hover:scale-105 active:scale-95 disabled:opacity-50 ${
            active ? 'border-gold-400 ring-2 ring-gold-400/40' : 'border-white/15'
          }`}
          style={{ background: p.hex }}
        >
          {!unlocked && (
            <span className="absolute inset-0 flex flex-col items-center justify-center rounded-[10px] bg-night-950/55 text-[10px] font-bold text-white">
              <LockIcon className="h-3.5 w-3.5" />
              {price}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

const ColorCarousel = ({ vehicle, color, onPaint }: { vehicle: VehicleId; color: string; onPaint: (id: string) => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * 200, behavior: 'smooth' });
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="Couleurs précédentes" onClick={() => scroll(-1)} className="rounded-lg p-1 text-white/70 transition-colors hover:bg-white/10 active:scale-90">
        <ChevronIcon dir="left" className="h-5 w-5" />
      </button>
      <div ref={ref} className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]" style={{ touchAction: 'pan-x' }}>
        {STANDARD_PAINTS.map((p) => (
          <ColorThumb key={p.id} vehicle={vehicle} paint={p.id} active={color === p.id} onPick={() => onPaint(p.id)} />
        ))}
      </div>
      <button type="button" aria-label="Couleurs suivantes" onClick={() => scroll(1)} className="rounded-lg p-1 text-white/70 transition-colors hover:bg-white/10 active:scale-90">
        <ChevronIcon dir="right" className="h-5 w-5" />
      </button>
    </div>
  );
};

/* ----------------------------------------------------------- upgrades */

interface UpgradeProps {
  upgrades: UpgradeLevels;
  costs: number[] | undefined;
  balance: number | null;
  pending: boolean;
  onUpgrade: (stat: UpgradeStat) => void;
}

const UpgradeList = ({ upgrades, costs, balance, pending, onUpgrade, dense }: UpgradeProps & { dense: boolean }) => (
  <ul className={`flex flex-col ${dense ? 'gap-1.5' : 'gap-2'}`}>
    {UPGRADE_STATS.map((stat) => {
      const meta = UPGRADE_META[stat];
      const level = upgrades[stat] ?? 0;
      const maxed = level >= MAX_UPGRADE_LEVEL;
      const cost = costs?.[level];
      const affordable = balance !== null && cost !== undefined && balance >= cost;
      return (
        <li key={stat} className={`flex items-center gap-2.5 rounded-xl border border-white/8 bg-night-900/70 ${dense ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-night-800 text-white/85">{meta.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">{meta.label}</div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold whitespace-nowrap text-white/55">
                Niv. {level} / {MAX_UPGRADE_LEVEL}
              </span>
              <span className="flex gap-0.5" aria-hidden>
                {Array.from({ length: MAX_UPGRADE_LEVEL }, (_, i) => (
                  <span key={i} className={`h-2 w-3 rounded-[3px] ${i < level ? meta.bar : 'bg-white/12'}`} />
                ))}
              </span>
            </div>
          </div>
          {maxed ? (
            <span className="font-display rounded-lg bg-gold-400/15 px-2 py-1 text-sm text-gold-300">MAX</span>
          ) : (
            <>
              <span className="font-display flex items-center gap-1 text-sm tabular-nums">
                <CoinIcon className="h-4 w-4 text-[9px]" />
                {cost ?? '—'}
              </span>
              <button
                type="button"
                data-testid={`upgrade-${stat}`}
                aria-label={`Améliorer ${meta.label}`}
                disabled={!affordable || pending}
                onClick={() => onUpgrade(stat)}
                className="btn-gold flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-50"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </>
          )}
        </li>
      );
    })}
  </ul>
);

/* ------------------------------------------------------------- screen */

type CompactTab = 'stats' | 'paint' | 'upgrades';
type CustomTab = 'perso' | 'upgrades';

export const GarageScreen = () => {
  const profile = useStore(appStore, (s) => s.profile);
  const catalog = useStore(appStore, (s) => s.catalog);
  const sel = currentSelection();
  const [viewing, setViewing] = useState<VehicleId>(sel.vehicle);
  const [tab, setTab] = useState<CompactTab>('stats');
  const [customTab, setCustomTab] = useState<CustomTab>('perso');
  const [pending, setPending] = useState(false);
  const { w, h } = useViewport();

  const portrait = h > w;
  const wide = !portrait && w >= 960 && h >= 560;

  const owned = profile?.vehicles.find((v) => v.vehicle === viewing);
  const color = owned?.color ?? (viewing === sel.vehicle ? sel.color : 'red');
  const upgrades = owned?.upgrades ?? NO_UPGRADES;
  const spec = VEHICLES[viewing];
  const isSelected = sel.vehicle === viewing;
  const stats = displayStats(viewing, upgrades);
  const prices: Record<string, number> = Object.fromEntries((catalog?.paints ?? []).map((p) => [p.code, p.price]));
  const ownedCount = profile ? profile.vehicles.length : VEHICLE_IDS.length;

  useEffect(() => {
    garagePreview(viewing, color);
  }, [viewing, color]);

  useEffect(() => {
    if (wide) garageFraming(-0.02, 0.1, 1.2);
    else if (!portrait) garageFraming(-0.12, -0.04, 1);
  }, [wide, portrait]);

  const run = async (fn: () => Promise<unknown>) => {
    if (pending) return;
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  };

  const paint = (code: string) => void run(() => actions.paint(viewing, code));
  const buyPaint = (code: string) =>
    void run(async () => {
      if (await actions.garage(api.purchase, code)) {
        AudioEngine.confirm();
        await actions.paint(viewing, code);
      }
    });
  const upgrade = (stat: UpgradeStat) =>
    void run(async () => {
      if (await actions.garage(api.upgrade, viewing, stat)) AudioEngine.confirm();
    });

  const paintProps: PaintProps = { color, owned: profile?.cosmetics ?? [], prices, online: !!profile, pending, onPaint: paint, onBuy: buyPaint };
  const upgradeProps: UpgradeProps = { upgrades, costs: catalog?.upgradeCosts, balance: profile?.balance ?? null, pending, onUpgrade: upgrade };

  const cta = !isSelected ? (
    <Button variant="gold" size="md" className="w-full" disabled={pending} onClick={() => run(() => actions.selectVehicle(viewing))} data-testid="select-vehicle">
      SÉLECTIONNER
    </Button>
  ) : (
    <Button variant="volt" size="md" className="w-full" onClick={() => goTo('play')} data-testid="garage-race">
      ▶ COURIR
    </Button>
  );

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h1 className="font-display truncate text-2xl leading-tight italic tall:text-[28px]" data-testid="garage-vehicle-name">
          {spec.name}
        </h1>
        <p className="text-sm text-white/65">{spec.tagline}</p>
      </div>
      <span className="font-display shrink-0 rounded-lg border-2 border-gold-400 bg-gold-400/10 px-2 py-0.5 text-sm text-gold-300">Niv. {vehicleLevel(upgrades)}</span>
    </div>
  );

  const vehicleList = (compact: boolean) => (
    <div className={compact ? 'flex flex-col gap-1.5 portrait:grid portrait:grid-cols-4' : 'flex flex-col gap-2'} role="listbox" aria-label="Mes véhicules">
      {VEHICLE_IDS.map((v) => {
        const pv = profile?.vehicles.find((x) => x.vehicle === v);
        return (
          <VehicleRow
            key={v}
            id={v}
            paint={pv?.color ?? (v === sel.vehicle ? sel.color : 'red')}
            level={vehicleLevel(pv?.upgrades ?? NO_UPGRADES)}
            viewing={viewing === v}
            equipped={sel.vehicle === v}
            compact={compact}
            onClick={() => {
              AudioEngine.click();
              setViewing(v);
            }}
          />
        );
      })}
    </div>
  );

  /* ---------- wide layout (desktop / tablet landscape): garage reference */
  if (wide) {
    const dense = h < 760;
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col" data-testid="garage-screen">
        <TopNav active="garage" compact={false} />
        <div
          className="grid min-h-0 flex-1 gap-3 pt-3"
          style={{
            gridTemplateColumns: 'minmax(230px, 21%) 1fr minmax(300px, 26%)',
            gridTemplateRows: 'minmax(0, 1fr) auto',
            paddingLeft: 'calc(12px + var(--safe-l))',
            paddingRight: 'calc(12px + var(--safe-r))',
            paddingBottom: 'calc(12px + var(--safe-b))',
          }}
        >
          <Card className="flex min-h-0 flex-col p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-display text-lg tracking-wide">MES VÉHICULES</h2>
              <span className="font-display text-sm text-white/70">
                {ownedCount} / {VEHICLE_IDS.length}
              </span>
            </div>
            <div className="scroll-y min-h-0 flex-1 pr-0.5">{vehicleList(false)}</div>
          </Card>

          <div className="flex items-end justify-center pb-1">
            <span className="rounded-full bg-night-950/55 px-3 py-1 text-xs font-semibold text-white/65">⟲ Glisse pour tourner · molette pour zoomer</span>
          </div>

          <Card className="flex min-h-0 flex-col p-4">
            {header}
            <div className="scroll-y mt-3 min-h-0 flex-1">
              <StatsList stats={stats} dense={dense} />
              <p className="mt-3 text-sm leading-relaxed text-white/55">
                Poids, adhérence, drift et suspension sont propres à chaque véhicule : les différences se ressentent en course.
              </p>
            </div>
            <div className="mt-3">{cta}</div>
          </Card>

          <Card className="col-span-2 flex min-h-0 flex-col overflow-hidden">
            <div className="flex items-center gap-1 border-b border-white/10 bg-night-900/60 px-2 pt-2" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={customTab === 'perso'}
                data-testid="garage-custom-perso"
                onClick={() => setCustomTab('perso')}
                className={`flex items-center gap-2 rounded-t-xl px-4 py-2 text-sm font-bold transition-colors ${
                  customTab === 'perso' ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-night-950' : 'text-white/75 hover:bg-white/5 hover:text-white'
                }`}
              >
                <BrushIcon className="h-4 w-4" />
                Personnalisation
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={customTab === 'upgrades'}
                data-testid="garage-custom-upgrades"
                onClick={() => setCustomTab('upgrades')}
                className={`flex items-center gap-2 rounded-t-xl px-4 py-2 text-sm font-bold transition-colors ${
                  customTab === 'upgrades' ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-night-950' : 'text-white/75 hover:bg-white/5 hover:text-white'
                }`}
              >
                <WrenchIcon className="h-4 w-4" />
                Améliorations
              </button>
              <LockedChip icon={<WheelIcon />} label="Roues" />
              <LockedChip icon={<SparklesIcon />} label="Effets" />
              <LockedChip icon={<StickerIcon />} label="Stickers" />
            </div>
            {customTab === 'perso' ? (
              <div className="flex min-h-0 gap-3 p-3">
                <div className="flex w-[160px] shrink-0 flex-col gap-1">
                  <span className="flex items-center gap-2 rounded-xl border-2 border-gold-400 bg-gold-400/10 px-3 py-2 text-sm font-bold text-gold-300">
                    <BrushIcon className="h-4 w-4" />
                    Couleurs
                  </span>
                  <LockedChip icon={<PatternIcon />} label="Motifs" />
                  <LockedChip icon={<ImageIcon />} label="Stickers" />
                  <LockedChip icon={<FlameIcon />} label="Effets de boost" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <Swatches {...paintProps} size="lg" />
                  <ColorCarousel vehicle={viewing} color={color} onPaint={paint} />
                </div>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-2 p-3">
                {UPGRADE_STATS.map((s) => (
                  <li key={s} className="flex items-center gap-3 rounded-xl bg-night-900/70 p-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-night-800">{UPGRADE_META[s].icon}</span>
                    <div>
                      <div className="font-bold">{UPGRADE_META[s].label}</div>
                      <div className="text-sm leading-relaxed text-white/60">{UPGRADE_META[s].desc}</div>
                    </div>
                  </li>
                ))}
                <li className="col-span-2 text-sm leading-relaxed text-white/55">
                  Les améliorations se paient en v-MRU (monnaie virtuelle du jeu, sans valeur réelle) et sont validées par le serveur.
                </li>
              </ul>
            )}
          </Card>

          <Card className="flex min-h-0 flex-col p-3">
            <h2 className="font-display mb-2 flex items-center gap-2 text-lg">
              <WrenchIcon className="h-5 w-5" />
              Améliorations
            </h2>
            <div className="scroll-y min-h-0 flex-1">
              <UpgradeList {...upgradeProps} dense={dense} />
              {!profile && <p className="mt-2 text-sm text-white/55">Disponible en ligne uniquement.</p>}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  /* ---------- compact layout (phones, landscape or portrait) */
  const tabs: { id: CompactTab; label: string }[] = [
    { id: 'stats', label: 'STATS' },
    { id: 'paint', label: 'COULEURS' },
    { id: 'upgrades', label: 'AMÉLIORER' },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col" data-testid="garage-screen">
      <TopNav active="garage" compact narrow={w < 560} />
      <div
        className="flex min-h-0 flex-1 gap-2 pt-2 portrait:flex-col"
        style={{ paddingLeft: 'calc(12px + var(--safe-l))', paddingRight: 'calc(12px + var(--safe-r))', paddingBottom: 'calc(10px + var(--safe-b))' }}
      >
        <Card className="w-[108px] shrink-0 p-1.5 portrait:order-2 portrait:w-full">
          <div className="scroll-y h-full portrait:h-auto">{vehicleList(true)}</div>
        </Card>

        <div className="flex min-w-0 flex-1 items-end justify-center portrait:order-1 portrait:min-h-[24vh] portrait:flex-none">
          <span className="rounded-full bg-night-950/55 px-3 py-1 text-[11px] font-semibold text-white/65">⟲ Glisse pour tourner</span>
        </div>

        <Card className="flex w-[min(44vw,360px)] min-w-[270px] flex-col p-3 portrait:order-3 portrait:min-h-0 portrait:w-full portrait:min-w-0 portrait:flex-1">
          {header}
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-night-900/80 p-1" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                data-testid={`garage-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`rounded-lg py-1.5 text-[11px] font-bold tracking-wider transition-colors ${
                  tab === t.id ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-night-950' : 'text-white/65 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="scroll-y mt-2 min-h-0 flex-1">
            {tab === 'stats' && <StatsList stats={stats} dense />}
            {tab === 'paint' && (
              <div className="flex flex-col gap-2">
                <Swatches {...paintProps} size="sm" />
                <div className="flex flex-wrap">
                  <LockedChip icon={<PatternIcon />} label="Motifs" />
                  <LockedChip icon={<WheelIcon />} label="Roues" />
                  <LockedChip icon={<FlameIcon />} label="Effets" />
                </div>
              </div>
            )}
            {tab === 'upgrades' && (
              <>
                <UpgradeList {...upgradeProps} dense />
                {!profile && <p className="mt-2 text-sm text-white/55">Disponible en ligne uniquement.</p>}
              </>
            )}
          </div>
          <div className="mt-2">{cta}</div>
        </Card>
      </div>
    </div>
  );
};
