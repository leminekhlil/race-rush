import type { ReactNode } from 'react';
import { MAX_PLAYERS, PAINTS, paintById, TRACK_IDS, VEHICLE_IDS, VEHICLES, type LobbyPlayerDTO, type VehicleId } from '@race-rush/shared';
import { useStore } from '../../state/store';
import { appStore, notify, openVehicleSelect } from '../../state/appStore';
import { actions, getRealtime } from '../actions';
import { VehicleIcon } from '../components/ui';
import { BackIcon, CheckIcon, ChevronIcon, CopyIcon, CrownIcon, LockIcon, PersonIcon, PlayIcon, PlusIcon } from '../components/icons';
import { AudioEngine } from '../../game/audio/AudioEngine';
import { useViewport } from '../useViewport';
import { PlayerVoiceBadge, VoicePanel } from '../components/VoiceControls';

const MAP_INFO: Record<string, { label: string; art: string }> = {
  city: {
    label: 'Ville',
    art: 'linear-gradient(180deg,#2f7fe6 0%,#9fd0ff 45%,transparent 45%),repeating-linear-gradient(90deg,#7fb7ff 0 14px,#f2b5c9 14px 26px,#ffd38a 26px 40px,#9fe0d0 40px 52px),linear-gradient(180deg,transparent 70%,#4a505c 70%)',
  },
  desert: {
    label: 'Désert',
    art: 'linear-gradient(180deg,#2f86e8 0%,#ffd9a0 48%,transparent 48%),radial-gradient(ellipse at 30% 75%,#c4622d 0 22%,transparent 23%),radial-gradient(ellipse at 75% 70%,#d9813d 0 25%,transparent 26%),linear-gradient(180deg,transparent 60%,#d9a35f 60%)',
  },
};

const LAP_OPTIONS = [1, 3, 5];

const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section className={`pointer-events-auto rounded-2xl border border-white/12 bg-night-950/80 shadow-2xl backdrop-blur-md ${className}`}>{children}</section>
);

const Arrow = ({ dir, onClick, disabled, label }: { dir: 'left' | 'right'; onClick: () => void; disabled: boolean; label: string }) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={() => {
      AudioEngine.click();
      onClick();
    }}
    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-night-800 text-white transition-all duration-150 hover:bg-night-700 active:scale-90 disabled:opacity-30"
  >
    <ChevronIcon dir={dir} className="h-5 w-5" />
  </button>
);

/** Player card above each vehicle (lobby reference): avatar, name, TOI / host crown, ready state. */
const PlayerCard = ({ p, me, compact }: { p: LobbyPlayerDTO; me: boolean; compact: boolean }) => (
  <li
    className={`relative flex min-w-0 items-center gap-2 rounded-xl border-2 bg-night-950/80 p-1.5 shadow-xl backdrop-blur-sm ${me ? 'border-gold-400' : 'border-white/10'} ${compact ? '' : 'tall:p-2'}`}
    data-testid={`lobby-player-${p.id}`}
  >
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-lg ring-2 ${p.isHost ? 'ring-gold-400' : 'ring-white/40'} ${compact ? 'h-8 w-8' : 'h-10 w-10'}`}
      style={{ background: p.isHost ? '#2a2310' : paintById(p.color).hex }}
    >
      {p.isHost ? <CrownIcon className="h-6 w-6 text-gold-400" /> : <PersonIcon className="h-6 w-6 text-white/90" />}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-bold">
        {p.name}
        {p.isBot && <span className="ml-1 text-[10px] text-white/45">BOT</span>}
      </span>
      <span className="block truncate text-[11px] text-white/55">{VEHICLES[p.vehicle].name}</span>
      {me ? (
        <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-gold-400 px-1.5 text-[11px] font-bold text-night-950">
          TOI{p.ready && <CheckIcon className="h-3 w-3" />}
        </span>
      ) : p.ready ? (
        <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-[#3dff6a]">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#2ee87a] text-night-950">
            <CheckIcon className="h-3 w-3" />
          </span>
          Prêt
        </span>
      ) : (
        <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-white/55">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-white/45" />
          Pas prêt
        </span>
      )}
    </span>
    {!p.isBot && (
      <span className="absolute -right-1.5 -top-2.5">
        <PlayerVoiceBadge playerId={p.id} />
      </span>
    )}
  </li>
);

export const LobbyScreen = () => {
  const lobby = useStore(appStore, (s) => s.lobby);
  const profile = useStore(appStore, (s) => s.profile);
  const { w, h } = useViewport();
  const myId = getRealtime().id;
  if (!lobby) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-night-950/40">
        <div className="font-display animate-pulse text-2xl">Connexion au salon…</div>
      </div>
    );
  }
  const portrait = h > w;
  const compact = portrait || h < 560 || w < 900;
  const me = lobby.players.find((p) => p.id === myId);
  const isHost = lobby.hostId === myId;
  const readyCount = lobby.players.filter((p) => p.ready).length;
  const allReady = lobby.players.length > 0 && readyCount === lobby.players.length;
  const ownedPaints = PAINTS.filter((p) => !p.premium || profile?.cosmetics.includes(p.id));
  const empty = Math.max(0, MAX_PLAYERS - lobby.players.length);
  const trackIndex = TRACK_IDS.indexOf(lobby.trackId);
  const map = MAP_INFO[lobby.trackId] ?? MAP_INFO.city;
  const locked = !!me?.ready;

  const inviteUrl = `${location.origin}${location.pathname}?join=${lobby.code}`;
  const copyCode = async () => {
    AudioEngine.click();
    try {
      await navigator.clipboard.writeText(lobby.code);
      notify(`Code ${lobby.code} copié !`, 'good');
    } catch {
      notify(`Code de la partie : ${lobby.code}`, 'info');
    }
  };
  const invite = async () => {
    AudioEngine.click();
    try {
      if (navigator.share) await navigator.share({ title: 'Race Rush', text: `Rejoins ma course Race Rush ! Code ${lobby.code}`, url: inviteUrl });
      else {
        await navigator.clipboard.writeText(inviteUrl);
        notify("Lien d'invitation copié !", 'good');
      }
    } catch {
      /* share cancelled */
    }
  };
  const select = (vehicle: VehicleId, color: string) => {
    AudioEngine.click();
    actions.lobbySelect(vehicle, color);
  };

  const settings = (
    <Card className="flex flex-col gap-3 p-3">
      <h2 className="font-display text-base tracking-wide tall:text-lg">PARAMÈTRES DE LA PARTIE</h2>
      <div className="flex items-center gap-2">
        <Arrow dir="left" label="Map précédente" disabled={!isHost} onClick={() => actions.lobbyConfig({ trackId: TRACK_IDS[(trackIndex - 1 + TRACK_IDS.length) % TRACK_IDS.length] })} />
        <div className="relative h-20 flex-1 overflow-hidden rounded-xl border border-white/20 tall:h-24" style={{ background: map.art }} data-testid="lobby-map">
          <span className="font-display absolute inset-x-2 bottom-1.5 rounded-lg bg-night-950/85 py-0.5 text-center text-sm">Map : {map.label}</span>
        </div>
        <Arrow dir="right" label="Map suivante" disabled={!isHost} onClick={() => actions.lobbyConfig({ trackId: TRACK_IDS[(trackIndex + 1) % TRACK_IDS.length] })} />
      </div>
      <div>
        <div className="mb-1 text-sm font-semibold text-white/80">Nombre de tours</div>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Tours">
          {LAP_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={lobby.laps === n}
              disabled={!isHost}
              data-testid={`lobby-laps-${n}`}
              onClick={() => {
                AudioEngine.click();
                actions.lobbyConfig({ laps: n });
              }}
              className={`font-display rounded-xl border-2 py-1.5 text-lg transition-all duration-150 active:scale-95 disabled:cursor-not-allowed ${
                lobby.laps === n ? 'border-gold-300 bg-gradient-to-b from-gold-300 to-gold-500 text-night-950' : 'border-white/10 bg-night-900 text-white/85 enabled:hover:border-white/30'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-sm font-semibold text-white/80">Mode</div>
        <div className="font-display rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 py-1.5 text-center text-night-950">Course normale</div>
        <div className="mt-1.5 flex items-center justify-center gap-2 rounded-xl border border-white/10 py-1.5 text-xs font-semibold text-white/45" aria-disabled>
          <LockIcon className="h-3.5 w-3.5" /> Contre-la-montre (à venir)
        </div>
      </div>
      <label className={`flex items-center justify-between gap-2 text-sm font-semibold ${isHost ? 'cursor-pointer' : 'opacity-60'}`}>
        Compléter avec des bots
        <input
          type="checkbox"
          checked={lobby.botFill}
          disabled={!isHost}
          onChange={(e) => actions.lobbyConfig({ botFill: e.target.checked })}
          className="h-5 w-5 accent-gold-500"
          data-testid="lobby-bots"
        />
      </label>
      {!isHost && <p className="text-xs text-white/50">Seul l'hôte modifie les paramètres.</p>}
    </Card>
  );

  const myVehicle = (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base tracking-wide">TON VÉHICULE</h2>
        <button
          type="button"
          disabled={locked}
          onClick={() => openVehicleSelect({ kind: 'lobby' })}
          className="rounded-lg px-2 py-0.5 text-xs font-bold text-gold-300 transition-colors hover:bg-white/5 disabled:opacity-40"
          data-testid="lobby-open-select"
        >
          VOIR ›
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {VEHICLE_IDS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={me?.vehicle === v}
            aria-label={VEHICLES[v].name}
            title={VEHICLES[v].name}
            data-testid={`lobby-vehicle-${v}`}
            disabled={locked}
            onClick={() => select(v, me?.color ?? 'red')}
            className={`flex items-center justify-center rounded-xl border-2 py-1.5 transition-all active:scale-95 disabled:opacity-50 ${
              me?.vehicle === v ? 'border-gold-400 bg-gold-500/10' : 'border-white/10 bg-night-900 hover:border-white/30'
            }`}
          >
            <VehicleIcon id={v} color={paintById(me?.color ?? 'red').hex} className="h-6 w-11" />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ownedPaints.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={p.name}
            aria-pressed={me?.color === p.id}
            disabled={locked}
            onClick={() => select(me?.vehicle ?? 'sport', p.id)}
            className={`h-7 w-7 rounded-lg border-2 transition-transform active:scale-90 disabled:opacity-50 ${me?.color === p.id ? 'scale-110 border-gold-400' : 'border-white/25'}`}
            style={{ background: p.hex }}
          />
        ))}
      </div>
    </Card>
  );

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col" data-testid="lobby-screen">
      <div
        className={`flex min-h-0 flex-1 gap-3 ${portrait ? 'scroll-y pointer-events-auto flex-col' : ''}`}
        style={{ paddingLeft: 'calc(12px + var(--safe-l))', paddingRight: 'calc(12px + var(--safe-r))', paddingTop: 'calc(10px + var(--safe-t))', paddingBottom: 'calc(10px + var(--safe-b))' }}
      >
        {/* Left: players over the 3D line-up, bottom action bar */}
        <div className={`flex min-w-0 flex-col ${portrait ? 'min-h-[78vh] shrink-0' : 'flex-1'}`}>
          <ul className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-5'}`} data-testid="lobby-players" aria-label={`Pilotes ${lobby.players.length}/${MAX_PLAYERS}`}>
            {lobby.players.map((p) => (
              <PlayerCard key={p.id} p={p} me={p.id === myId} compact={compact} />
            ))}
            {Array.from({ length: empty }, (_, i) =>
              i === 0 ? (
                <li key="invite" className="pointer-events-auto">
                  <button
                    type="button"
                    onClick={invite}
                    data-testid="lobby-invite"
                    className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-white/35 bg-night-950/55 p-1.5 text-white/75 backdrop-blur-sm transition-colors hover:border-gold-300 hover:text-white"
                  >
                    <PlusIcon className="h-6 w-6" />
                    <span className="text-xs font-semibold">Inviter un joueur</span>
                  </button>
                </li>
              ) : (
                <li key={`empty-${i}`} className={`flex items-center gap-2 rounded-xl border border-white/10 bg-night-950/55 p-1.5 text-xs text-white/55 backdrop-blur-sm ${compact ? 'hidden' : ''}`}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-night-800">
                    <PersonIcon className="h-6 w-6 text-white/40" />
                  </span>
                  {lobby.botFill ? 'Bot au départ' : 'En attente…'}
                </li>
              ),
            )}
          </ul>

          <div className="pointer-events-none flex-1" />

          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                AudioEngine.click();
                actions.leaveLobby();
              }}
              aria-label="Quitter le salon"
              data-testid="lobby-quit"
              className="font-display flex items-center gap-2 rounded-xl border-2 border-white/25 bg-night-950/80 px-4 py-2.5 italic transition-all duration-150 hover:bg-night-800 active:scale-95"
            >
              <BackIcon className="h-5 w-5" />
              QUITTER
            </button>
            <span className="font-display ml-auto flex items-center gap-2 rounded-xl bg-night-950/80 px-3 py-2.5 italic" data-testid="lobby-ready-count">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${allReady ? 'bg-[#2ee87a] text-night-950' : 'bg-night-700 text-white/60'}`}>
                <CheckIcon className="h-4 w-4" />
              </span>
              {readyCount}/{lobby.players.length} prêts
            </span>
            <button
              type="button"
              onClick={() => actions.setReady(!me?.ready)}
              data-testid="ready-button"
              className={`font-display rounded-xl px-5 py-2.5 text-lg italic transition-all duration-150 active:scale-95 ${me?.ready ? 'border-2 border-white/25 bg-night-950/80 text-white' : 'btn-volt'}`}
            >
              {me?.ready ? 'ANNULER' : 'PRÊT !'}
            </button>
            {isHost && (
              <button
                type="button"
                disabled={!allReady}
                onClick={() => actions.startLobby()}
                data-testid="launch-button"
                className="btn-gold font-display flex items-center gap-2 rounded-xl px-6 py-2.5 text-lg italic transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:saturate-50 tall:text-2xl"
              >
                <PlayIcon className="h-6 w-6" />
                LANCER LA COURSE
              </button>
            )}
          </div>
          {!isHost && <p className="pointer-events-none mt-1 text-right text-xs text-white/65">L'hôte lance la course quand tout le monde est prêt.</p>}
        </div>

        {/* Right: code, settings, my vehicle */}
        <div className={`pointer-events-auto flex shrink-0 flex-col gap-2 ${portrait ? 'w-full' : 'scroll-y w-[min(36vw,300px)]'}`}>
          <Card className="flex items-center justify-between gap-2 px-3 py-2">
            <div>
              <div className="text-[11px] font-semibold text-white/65">Code de la partie</div>
              <div className="font-display text-3xl tracking-[0.12em] italic" data-testid="lobby-code">
                {lobby.code}
              </div>
            </div>
            <button
              type="button"
              onClick={copyCode}
              aria-label="Copier le code"
              data-testid="lobby-copy"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-b from-volt-400 to-volt-600 text-white shadow-lg transition-transform active:scale-90"
            >
              <CopyIcon className="h-6 w-6" />
            </button>
          </Card>
          <VoicePanel />
          {settings}
          {myVehicle}
        </div>
      </div>
    </div>
  );
};
