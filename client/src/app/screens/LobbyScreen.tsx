import { MAX_PLAYERS, PAINTS, paintById, TRACKS, VEHICLE_IDS, VEHICLES, type VehicleId } from '@race-rush/shared';
import { useStore } from '../../state/store';
import { appStore, notify } from '../../state/appStore';
import { actions, getRealtime } from '../actions';
import { Button, Panel, ScreenHeader, SectionTitle, VehicleIcon } from '../components/ui';
import { AudioEngine } from '../../game/audio/AudioEngine';

export const LobbyScreen = () => {
  const lobby = useStore(appStore, (s) => s.lobby);
  const profile = useStore(appStore, (s) => s.profile);
  const myId = getRealtime().id;
  if (!lobby) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-night-950/60">
        <div className="font-display animate-pulse text-2xl">Connexion au salon…</div>
      </div>
    );
  }
  const me = lobby.players.find((p) => p.id === myId);
  const isHost = lobby.hostId === myId;
  const allReady = lobby.players.every((p) => p.ready);
  const ownedPaints = PAINTS.filter((p) => !p.premium || profile?.cosmetics.includes(p.id));
  const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => lobby.players[i] ?? null);

  const share = async () => {
    const url = `${location.origin}${location.pathname}?join=${lobby.code}`;
    AudioEngine.click();
    try {
      if (navigator.share) await navigator.share({ title: 'Race Rush', text: `Rejoins ma course Race Rush ! Code ${lobby.code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        notify('Lien copié !', 'good');
      }
    } catch {
      /* user cancelled share */
    }
  };

  const select = (vehicle: VehicleId, color: string) => {
    AudioEngine.click();
    actions.lobbySelect(vehicle, color);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-night-950/60 backdrop-blur-[2px]" data-testid="lobby-screen">
      <ScreenHeader
        title="SALON"
        onBack={() => actions.leaveLobby()}
        right={
          <button type="button" onClick={share} className="glass flex items-center gap-3 rounded-2xl px-4 py-1.5 active:scale-95" aria-label="Partager le code">
            <span className="text-[10px] font-bold tracking-[0.2em] text-volt-400">CODE</span>
            <span className="font-display text-3xl tracking-[0.2em] text-gold-400" data-testid="lobby-code">
              {lobby.code}
            </span>
            <span className="text-lg">⤴</span>
          </button>
        }
      />
      <div className="scroll-y flex-1 px-4 pt-3 pb-4" style={{ paddingLeft: 'calc(16px + var(--safe-l))', paddingRight: 'calc(16px + var(--safe-r))' }}>
        <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-[1.1fr_1fr] landscape:grid-cols-[1.1fr_1fr]">
          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <SectionTitle>Pilotes {lobby.players.length}/{MAX_PLAYERS}</SectionTitle>
              <span className="text-xs font-semibold text-white/60">
                {TRACKS[lobby.trackId].name} · {lobby.laps} tours
              </span>
            </div>
            <ul className="flex flex-col gap-2" data-testid="lobby-players">
              {slots.map((p, i) =>
                p ? (
                  <li key={p.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${p.id === myId ? 'bg-volt-500/20 ring-1 ring-volt-400/50' : 'bg-night-950/45'}`}>
                    <VehicleIcon id={p.vehicle} color={paintById(p.color).hex} className="h-7 w-12 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-base">
                        {p.isHost && <span title="Hôte">👑 </span>}
                        {p.name}
                      </div>
                      <div className="text-xs text-white/55">
                        {VEHICLES[p.vehicle].name} · Niv. {p.level}
                      </div>
                    </div>
                    <span className={`rounded-xl px-3 py-1 font-display text-sm ${p.ready ? 'bg-gold-500 text-night-950' : 'bg-night-800 text-white/60'}`}>{p.ready ? 'READY' : 'ATTENTE'}</span>
                  </li>
                ) : (
                  <li key={`empty-${i}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-white/15 px-3 py-2.5 text-sm text-white/40">
                    {lobby.botFill ? '🤖 Bot (complète la grille)' : 'Place libre — partage le code'}
                  </li>
                ),
              )}
            </ul>
          </Panel>

          <Panel className="flex flex-col gap-3 p-4">
            <div>
              <SectionTitle>Ton véhicule</SectionTitle>
              <div className="grid grid-cols-4 gap-2">
                {VEHICLE_IDS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={me?.vehicle === v}
                    data-testid={`lobby-vehicle-${v}`}
                    disabled={me?.ready}
                    onClick={() => select(v, me?.color ?? 'red')}
                    className={`flex flex-col items-center rounded-2xl border-2 px-1 py-2 transition-all active:scale-95 disabled:opacity-50 ${me?.vehicle === v ? 'border-gold-400 bg-gold-500/10' : 'border-white/10 bg-night-950/45 hover:border-volt-400/60'}`}
                  >
                    <VehicleIcon id={v} color={paintById(me?.color ?? 'red').hex} className="h-7 w-12" />
                    <span className="mt-1 text-[11px] leading-tight font-bold">{VEHICLES[v].name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <SectionTitle>Couleur</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {ownedPaints.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={p.name}
                    disabled={me?.ready}
                    onClick={() => select(me?.vehicle ?? 'sport', p.id)}
                    className={`h-9 w-9 rounded-full border-2 transition-transform active:scale-90 disabled:opacity-50 ${me?.color === p.id ? 'scale-110 border-gold-400' : 'border-white/30'}`}
                    style={{ background: p.hex }}
                  />
                ))}
              </div>
            </div>
            {isHost && (
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="Circuit"
                  value={lobby.trackId}
                  onChange={(e) => actions.lobbyConfig({ trackId: e.target.value })}
                  className="rounded-xl border border-white/15 bg-night-950/70 px-3 py-2 font-semibold"
                >
                  {Object.values(TRACKS).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select aria-label="Tours" value={lobby.laps} onChange={(e) => actions.lobbyConfig({ laps: Number(e.target.value) })} className="rounded-xl border border-white/15 bg-night-950/70 px-3 py-2 font-semibold">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} tour{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="mt-auto flex gap-2">
              <Button variant={me?.ready ? 'ghost' : 'gold'} size="lg" className="flex-1" onClick={() => actions.setReady(!me?.ready)} data-testid="ready-button">
                {me?.ready ? 'ANNULER' : 'READY'}
              </Button>
              {isHost && (
                <Button variant="volt" size="lg" className="flex-1" disabled={!allReady} onClick={() => actions.startLobby()} data-testid="launch-button">
                  LANCER
                </Button>
              )}
            </div>
            <p className="text-center text-xs text-white/50">{isHost ? (allReady ? 'Tout le monde est prêt !' : 'Lancement dès que tous les pilotes sont READY.') : "L'hôte lance la course quand tout le monde est READY."}</p>
          </Panel>
        </div>
      </div>
    </div>
  );
};
