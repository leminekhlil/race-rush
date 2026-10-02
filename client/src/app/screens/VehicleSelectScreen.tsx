import { useState } from 'react';
import { displayStats, PAINTS, paintById, VEHICLE_IDS, VEHICLES, type VehicleId } from '@race-rush/shared';
import { useStore } from '../../state/store';
import { appStore, goTo } from '../../state/appStore';
import { actions, currentSelection } from '../actions';
import { Button, VehicleIcon } from '../components/ui';
import { useVehicleThumb } from '../../game/garage/Thumbnails';
import { AudioEngine } from '../../game/audio/AudioEngine';

const Segments = ({ value, color, label }: { value: number; color: string; label: string }) => {
  const filled = Math.round(value / 2);
  return (
    <div className="flex items-center gap-2">
      <span className="w-[5.5rem] shrink-0 text-[10px] font-bold tracking-[0.12em] text-white/75 uppercase tall:text-xs">{label}</span>
      <div className="flex flex-1 gap-[3px]" aria-label={`${label} ${value} sur 10`}>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="h-2 flex-1 skew-x-[-18deg] rounded-[2px]" style={{ background: i < filled ? color : 'rgba(255,255,255,0.12)' }} />
        ))}
      </div>
    </div>
  );
};

const VehicleCard = ({ id, color, selected, onSelect }: { id: VehicleId; color: string; selected: boolean; onSelect: () => void }) => {
  const spec = VEHICLES[id];
  const thumb = useVehicleThumb(id, color);
  const profile = useStore(appStore, (s) => s.profile);
  const upgrades = profile?.vehicles.find((v) => v.vehicle === id)?.upgrades;
  const stats = displayStats(id, upgrades);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={`select-card-${id}`}
      className={`group relative flex min-w-0 flex-col items-center rounded-2xl border-2 px-2 pt-2 pb-2.5 text-left transition-all duration-200 active:scale-[0.97] ${
        selected ? 'border-gold-400 bg-night-800/80 shadow-[0_0_28px_rgba(255,198,26,0.35)]' : 'border-white/10 bg-night-900/70 hover:border-white/30'
      }`}
    >
      <span className="font-display skew-panel rounded-md px-3 py-0.5 text-[13px] text-night-950 uppercase italic tall:text-base" style={{ background: spec.accent }}>
        {spec.label}
      </span>
      <span className="mt-0.5 text-center text-[10px] font-semibold tracking-wide text-white/70 uppercase tall:text-[11px]">{spec.tagline}</span>
      <div className="relative mt-1 flex h-[84px] w-full items-end justify-center tall:h-[130px]">
        <div
          className="absolute bottom-0 h-[30%] w-[86%] rounded-[50%]"
          style={{
            background: selected ? 'radial-gradient(ellipse at center, rgba(255,198,26,0.55), rgba(255,198,26,0.08) 70%)' : 'radial-gradient(ellipse at center, rgba(77,141,255,0.35), rgba(13,27,69,0.2) 70%)',
            boxShadow: selected ? '0 0 0 2px rgba(255,198,26,0.6)' : '0 0 0 1px rgba(255,255,255,0.12)',
          }}
        />
        {thumb ? (
          <img src={thumb} alt={spec.name} className="relative z-10 h-full w-full object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,0.45)]" draggable={false} />
        ) : (
          <VehicleIcon id={id} color={paintById(color).hex} className="relative z-10 mb-3 h-12 w-24 animate-pulse" />
        )}
      </div>
      <div className="mt-2 flex w-full flex-col gap-1">
        <Segments label="Vitesse" value={stats.speed} color={spec.accent} />
        <Segments label="Accélération" value={stats.accel} color={spec.accent} />
        <Segments label="Maniabilité" value={stats.handling} color={spec.accent} />
      </div>
    </button>
  );
};

const ColorVariant = ({ vehicle, color, selected, onSelect }: { vehicle: VehicleId; color: string; selected: boolean; onSelect: () => void }) => {
  const thumb = useVehicleThumb(vehicle, color, 200, 120);
  const paint = paintById(color);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={`variant-${color}`}
      className={`flex w-[78px] shrink-0 flex-col items-center rounded-xl border-2 px-1 pt-1 pb-0.5 transition-all active:scale-95 tall:w-[100px] ${selected ? 'border-gold-400 bg-gold-500/10' : 'border-white/10 bg-night-900/60 hover:border-white/30'}`}
    >
      <div className="flex h-[34px] w-full items-center justify-center tall:h-[48px]">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-contain" draggable={false} /> : <span className="h-5 w-5 rounded-full" style={{ background: paint.hex }} />}
      </div>
      <span className="text-[10px] font-bold tracking-wider uppercase">{paint.name}</span>
    </button>
  );
};

export const VehicleSelectScreen = () => {
  const profile = useStore(appStore, (s) => s.profile);
  const pending = useStore(appStore, (s) => s.pendingSelect);
  const initial = currentSelection();
  const [vehicle, setVehicle] = useState<VehicleId>(initial.vehicle);
  const colorOf = (v: VehicleId) => profile?.vehicles.find((x) => x.vehicle === v)?.color ?? (v === initial.vehicle ? initial.color : 'red');
  const [colors, setColors] = useState<Record<string, string>>(() => Object.fromEntries(VEHICLE_IDS.map((v) => [v, colorOf(v)])));
  const [busy, setBusy] = useState(false);
  const color = colors[vehicle];
  const owned = PAINTS.filter((p) => !p.premium || profile?.cosmetics.includes(p.id));

  const back = () => goTo(pending?.kind === 'lobby' ? 'lobby' : 'play');

  const confirm = async () => {
    setBusy(true);
    AudioEngine.confirm();
    try {
      await actions.applySelection(vehicle, color);
      if (pending?.kind === 'quick') await actions.playQuick(pending.trackId);
      else if (pending?.kind === 'lobby') {
        actions.lobbySelect(vehicle, color);
        goTo('lobby');
      } else goTo('play');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-night-950/80 via-night-950/55 to-night-950/85 backdrop-blur-[2px]" data-testid="select-screen">
      <div className="flex items-center gap-3 px-4 pt-3" style={{ paddingLeft: 'calc(16px + var(--safe-l))', paddingRight: 'calc(16px + var(--safe-r))', paddingTop: 'calc(10px + var(--safe-t))' }}>
        <h1 className="font-display text-outline skew-panel rounded-l-xl bg-volt-500 py-1 pr-6 pl-3 text-lg text-white uppercase italic tall:text-2xl">Sélection du véhicule</h1>
        <div className="ml-auto flex items-center gap-2">
          {profile && (
            <span className="glass flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold">
              <span className="text-gold-400">♛</span>
              {profile.name}
            </span>
          )}
          <button type="button" onClick={back} className="glass rounded-xl px-3 py-1.5 font-display text-sm active:scale-95" data-testid="select-back">
            ‹ RETOUR
          </button>
        </div>
      </div>

      <div className="scroll-y flex-1 px-4 pt-2 pb-3" style={{ paddingLeft: 'calc(16px + var(--safe-l))', paddingRight: 'calc(16px + var(--safe-r))' }}>
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2 landscape:grid-cols-4 tall:gap-3">
          {VEHICLE_IDS.map((v) => (
            <VehicleCard
              key={v}
              id={v}
              color={colors[v]}
              selected={vehicle === v}
              onSelect={() => {
                AudioEngine.click();
                setVehicle(v);
              }}
            />
          ))}
        </div>

        <div className="mx-auto mt-2 flex max-w-6xl flex-col gap-2 tall:mt-3 landscape:flex-row landscape:items-end">
          <div className="glass min-w-0 flex-1 rounded-2xl p-2">
            <div className="mb-1 text-[11px] font-bold tracking-[0.2em] text-white uppercase">
              Variantes de couleurs <span className="text-volt-400">({VEHICLES[vehicle].label})</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ touchAction: 'pan-x' }}>
              {owned.map((p) => (
                <ColorVariant
                  key={p.id}
                  vehicle={vehicle}
                  color={p.id}
                  selected={color === p.id}
                  onSelect={() => {
                    AudioEngine.click();
                    setColors((c) => ({ ...c, [vehicle]: p.id }));
                  }}
                />
              ))}
            </div>
          </div>
          <Button variant="gold" size="lg" className="shrink-0 px-10 landscape:h-[64px] tall:landscape:h-[84px] tall:landscape:text-3xl" disabled={busy} onClick={confirm} data-testid="select-confirm">
            ✔ CONFIRMER
          </Button>
        </div>
      </div>
    </div>
  );
};
