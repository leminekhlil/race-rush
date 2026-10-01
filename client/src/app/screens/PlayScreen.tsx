import { useState } from 'react';
import { TRACKS, VEHICLES } from '@race-rush/shared';
import { useStore } from '../../state/store';
import { appStore, goTo, openVehicleSelect } from '../../state/appStore';
import { actions, currentSelection } from '../actions';
import { Button, Panel, ScreenHeader, SectionTitle, VehicleIcon, VmruBadge } from '../components/ui';
import { paintById } from '@race-rush/shared';

const TRACK_INFO: Record<string, { label: string; badge?: string; gradient: string }> = {
  city: { label: 'City', gradient: 'from-[#13265e] via-[#1f3f9c] to-[#3b6fd8]' },
  desert: { label: 'Desert', badge: 'PREVIEW', gradient: 'from-[#8c4a1f] via-[#d9813d] to-[#f6c27a]' },
};

const TrackPicker = ({ value, onChange, prefix }: { value: string; onChange: (id: string) => void; prefix: string }) => (
  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Circuit">
    {Object.keys(TRACKS).map((id) => (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={value === id}
        data-testid={`${prefix}-track-${id}`}
        onClick={() => onChange(id)}
        className={`relative overflow-hidden rounded-2xl border-2 bg-gradient-to-br px-3 py-3 text-left transition-all duration-150 active:scale-95 ${TRACK_INFO[id].gradient} ${
          value === id ? 'border-gold-400 shadow-lg shadow-gold-500/25' : 'border-transparent opacity-70 hover:opacity-100'
        }`}
      >
        <div className="font-display text-lg">{TRACK_INFO[id].label}</div>
        <div className="text-xs font-semibold text-white/80">{TRACKS[id].name.split('—')[1]?.trim()}</div>
        {TRACK_INFO[id].badge && <span className="absolute top-1.5 right-1.5 rounded-md bg-night-950/70 px-1.5 text-[10px] font-bold tracking-wider text-gold-300">{TRACK_INFO[id].badge}</span>}
      </button>
    ))}
  </div>
);

const Stepper = ({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-sm font-bold tracking-wider text-white/75 uppercase">{label}</span>
    <div className="flex items-center gap-1">
      <button type="button" aria-label={`Moins de ${label}`} onClick={() => onChange(Math.max(min, value - 1))} className="h-9 w-9 rounded-xl bg-night-950/60 text-xl font-bold active:scale-90">
        −
      </button>
      <span className="w-8 text-center font-display text-xl tabular-nums">{value}</span>
      <button type="button" aria-label={`Plus de ${label}`} onClick={() => onChange(Math.min(max, value + 1))} className="h-9 w-9 rounded-xl bg-night-950/60 text-xl font-bold active:scale-90">
        +
      </button>
    </div>
  </div>
);

export const PlayScreen = () => {
  const profile = useStore(appStore, (s) => s.profile);
  const busy = useStore(appStore, (s) => s.busy);
  const apiStatus = useStore(appStore, (s) => s.apiStatus);
  const [quickTrack, setQuickTrack] = useState(appStore.get().trackId);
  const [hostTrack, setHostTrack] = useState('city');
  const [laps, setLaps] = useState(3);
  const [bots, setBots] = useState(true);
  const [code, setCode] = useState('');
  const sel = currentSelection();
  const online = apiStatus !== 'offline' && !!profile;

  return (
    <div className="absolute inset-0 flex flex-col bg-night-950/55 backdrop-blur-[2px]" data-testid="play-screen">
      <ScreenHeader
        title="JOUER"
        onBack={() => goTo('home')}
        right={
          <>
            <button type="button" onClick={() => openVehicleSelect({ kind: 'browse' })} data-testid="play-vehicle-chip" className="glass flex items-center gap-2 rounded-2xl px-3 py-1.5 transition-transform active:scale-95" aria-label="Changer de véhicule">
              <VehicleIcon id={sel.vehicle} color={paintById(sel.color).hex} className="h-6 w-10" />
              <span className="hidden font-display text-sm sm:inline">{VEHICLES[sel.vehicle].name}</span>
              <span className="text-xs font-bold text-gold-300">CHANGER ›</span>
            </button>
            {profile && <VmruBadge amount={profile.balance} />}
          </>
        }
      />
      <div className="scroll-y flex-1 px-4 pt-3 pb-4" style={{ paddingLeft: 'calc(16px + var(--safe-l))', paddingRight: 'calc(16px + var(--safe-r))' }}>
        <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-3 landscape:grid-cols-3">
          <Panel className="flex flex-col gap-3 p-4">
            <div>
              <SectionTitle>Course rapide</SectionTitle>
              <div className="font-display text-xl">Toi + 4 bots</div>
              <p className="text-sm leading-relaxed text-white/65">{online ? 'Résultats validés par le serveur : XP et v-MRU.' : 'Entraînement hors ligne (sans récompense).'}</p>
            </div>
            <TrackPicker prefix="quick" value={quickTrack} onChange={setQuickTrack} />
            <Button variant="gold" size="lg" disabled={busy} onClick={() => openVehicleSelect({ kind: 'quick', trackId: quickTrack })} data-testid="quick-race" className="mt-auto">
              {busy ? '…' : "C'EST PARTI"}
            </Button>
          </Panel>

          <Panel className="flex flex-col gap-3 p-4">
            <div>
              <SectionTitle>Créer une partie</SectionTitle>
              <div className="font-display text-xl">2 à 5 pilotes</div>
            </div>
            <TrackPicker prefix="host" value={hostTrack} onChange={setHostTrack} />
            <Stepper label="Tours" value={laps} min={1} max={5} onChange={setLaps} />
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span className="text-sm font-bold tracking-wider text-white/75 uppercase">Compléter avec bots</span>
              <input type="checkbox" checked={bots} onChange={(e) => setBots(e.target.checked)} className="h-6 w-6 accent-gold-500" />
            </label>
            <Button variant="volt" size="lg" disabled={busy || !online} onClick={() => actions.createLobby({ trackId: hostTrack, laps, botFill: bots })} data-testid="create-lobby" className="mt-auto">
              CRÉER
            </Button>
          </Panel>

          <Panel className="flex flex-col gap-3 p-4">
            <div>
              <SectionTitle>Rejoindre</SectionTitle>
              <div className="font-display text-xl">Code de partie</div>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              placeholder="7X9K"
              aria-label="Code de partie"
              data-testid="join-code"
              inputMode="text"
              autoCapitalize="characters"
              className="w-full rounded-2xl border border-volt-400/40 bg-night-950/70 py-3 text-center font-display text-4xl tracking-[0.4em] text-gold-300 placeholder:text-white/15 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/25 focus:outline-none"
            />
            <Button variant="volt" size="lg" disabled={busy || code.length !== 4 || !online} onClick={() => actions.joinLobby(code)} data-testid="join-lobby" className="mt-auto">
              REJOINDRE
            </Button>
          </Panel>
        </div>
      </div>

    </div>
  );
};
