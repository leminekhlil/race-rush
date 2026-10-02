import { realtimeUrl } from '../../net/realtime';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { VEHICLES } from '@race-rush/shared';
import { useStore } from '../../state/store';
import { appStore, goTo } from '../../state/appStore';
import { settingsStore } from '../../state/settings';
import { actions, currentSelection } from '../actions';
import { Button, Panel } from '../components/ui';
import { RaceRushLogo } from '../components/Logo';
import { CarIcon, CoinIcon, GearIcon, LinkIcon, PencilIcon, PersonIcon, PlayIcon, StatsIcon, UsersIcon } from '../components/icons';
import { AudioEngine } from '../../game/audio/AudioEngine';
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '../brand';

const Onboarding = () => {
  const busy = useStore(appStore, (s) => s.busy);
  const [name, setName] = useState(settingsStore.get().playerName || '');
  const submit = async () => {
    AudioEngine.unlock();
    await actions.createProfile(name);
  };
  return (
    <Panel className="w-[min(92vw,380px)] p-5">
      <label htmlFor="pseudo" className="text-xs font-bold tracking-[0.25em] text-volt-400">
        TON PSEUDO DE PILOTE
      </label>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          id="pseudo"
          data-testid="name-input"
          value={name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setName(e.target.value.replace(/[^\p{L}\p{N} _.-]/gu, ''))}
          placeholder="ex. Lemine"
          className="min-w-0 flex-1 rounded-2xl border border-volt-400/40 bg-night-950/70 px-4 py-3 text-lg font-semibold text-white placeholder:text-white/30 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/25 focus:outline-none"
        />
        <Button type="submit" variant="gold" size="md" disabled={busy || name.trim().length < 2} data-testid="start-button">
          GO
        </Button>
      </form>
      <p className="mt-3 text-sm leading-relaxed text-white/60">Compte invité instantané : progression, garage et v-MRU sauvegardés sur le serveur.</p>
    </Panel>
  );
};

/** Big menu button (menu reference): coloured gradient, icon, 3D lip; hover glow, disabled grey. */
const MenuButton = ({
  tone,
  icon,
  children,
  onClick,
  disabled,
  testId,
  size = 'md',
}: {
  tone: 'gold' | 'blue' | 'violet';
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
  size?: 'lg' | 'md';
}) => {
  const tones = {
    gold: 'from-[#ffe07a] via-[#ffc61a] to-[#e0a800] text-night-950 shadow-[0_6px_0_#9b7200,0_14px_30px_rgba(255,198,26,0.35)] hover:shadow-[0_6px_0_#9b7200,0_0_0_3px_#fff3b0,0_14px_36px_rgba(255,198,26,0.6)]',
    blue: 'from-[#4da3ff] via-[#1f7bff] to-[#155ed6] text-white shadow-[0_6px_0_#0d3a9c,0_14px_30px_rgba(31,107,255,0.35)] hover:shadow-[0_6px_0_#0d3a9c,0_0_0_3px_#bfe0ff,0_14px_36px_rgba(31,107,255,0.6)]',
    violet: 'from-[#b07cff] via-[#8a3dff] to-[#6a22e0] text-white shadow-[0_6px_0_#43149a,0_14px_30px_rgba(138,61,255,0.35)] hover:shadow-[0_6px_0_#43149a,0_0_0_3px_#e2d0ff,0_14px_36px_rgba(138,61,255,0.6)]',
  };
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={() => {
        AudioEngine.click();
        onClick();
      }}
      className={`font-display group flex w-full items-center gap-3 rounded-2xl bg-gradient-to-b px-5 text-left italic transition-all duration-150 select-none focus-visible:ring-4 focus-visible:ring-white/60 focus-visible:outline-none active:translate-y-1 disabled:cursor-not-allowed disabled:from-slate-400 disabled:via-slate-500 disabled:to-slate-600 disabled:text-white/60 disabled:shadow-[0_6px_0_#3a4150] ${tones[tone]} ${
        size === 'lg' ? 'py-3 text-3xl tall:py-4 tall:text-4xl' : 'py-2.5 text-lg tall:py-3 tall:text-[22px]'
      }`}
    >
      <span className={`shrink-0 transition-transform duration-150 group-hover:scale-110 ${size === 'lg' ? '[&>svg]:h-8 [&>svg]:w-8' : '[&>svg]:h-6 [&>svg]:w-6'}`}>{icon}</span>
      <span className="truncate">{children}</span>
    </button>
  );
};

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => (
  <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-night-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label={title} onClick={onClose}>
    <div className="glass animate-pop w-[min(92vw,380px)] rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-2xl italic">{title}</h2>
        <button type="button" aria-label="Fermer" onClick={onClose} className="h-9 w-9 rounded-xl text-xl text-white/70 transition-colors hover:bg-white/10">
          ✕
        </button>
      </div>
      {children}
    </div>
  </div>
);

const JoinModal = ({ onClose }: { onClose: () => void }) => {
  const busy = useStore(appStore, (s) => s.busy);
  const [code, setCode] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <Modal title="Rejoindre une partie" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void actions.joinLobby(code);
        }}
        className="flex flex-col gap-3"
      >
        <input
          ref={ref}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
          placeholder="7X9K"
          aria-label="Code de partie"
          data-testid="home-join-code"
          autoCapitalize="characters"
          className="font-display w-full rounded-2xl border border-volt-400/40 bg-night-950/70 py-3 text-center text-5xl tracking-[0.4em] text-gold-300 placeholder:text-white/15 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/25 focus:outline-none"
        />
        <Button type="submit" variant="volt" size="lg" disabled={busy || code.length !== 4} data-testid="home-join-submit">
          REJOINDRE
        </Button>
        <p className="text-center text-sm text-white/55">Demande le code à 4 caractères à l'hôte de la partie.</p>
      </form>
    </Modal>
  );
};

const RenameModal = ({ current, onClose }: { current: string; onClose: () => void }) => {
  const [name, setName] = useState(current);
  return (
    <Modal title="Ton pseudo" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await actions.rename(name)) onClose();
        }}
        className="flex flex-col gap-3"
      >
        <input
          value={name}
          maxLength={16}
          autoFocus
          onChange={(e) => setName(e.target.value.replace(/[^\p{L}\p{N} _.-]/gu, ''))}
          aria-label="Pseudo"
          data-testid="rename-input"
          className="rounded-2xl border border-volt-400/40 bg-night-950/70 px-4 py-3 text-lg font-semibold focus:border-gold-400 focus:ring-4 focus:ring-gold-400/25 focus:outline-none"
        />
        <Button type="submit" variant="gold" size="md" disabled={name.trim().length < 2}>
          ENREGISTRER
        </Button>
      </form>
    </Modal>
  );
};

const StatsModal = ({ onClose }: { onClose: () => void }) => {
  const profile = useStore(appStore, (s) => s.profile);
  const rows: [string, string][] = profile
    ? [
        ['Niveau', String(profile.level)],
        ['Expérience', `${profile.xp} XP`],
        ['Courses', String(profile.racesPlayed)],
        ['Victoires', String(profile.wins)],
        ['Taux de victoire', profile.racesPlayed ? `${Math.round((profile.wins / profile.racesPlayed) * 100)} %` : '—'],
        ['Solde', `${profile.balance.toLocaleString('fr-FR')} v-MRU`],
      ]
    : [];
  return (
    <Modal title="Statistiques" onClose={onClose}>
      {profile ? (
        <dl className="grid grid-cols-2 gap-2" data-testid="stats-list">
          {rows.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-night-950/55 p-3">
              <dt className="text-xs font-bold tracking-wider text-white/55 uppercase">{k}</dt>
              <dd className="font-display text-xl">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm leading-relaxed text-white/65">Les statistiques sont enregistrées par le serveur : connecte-toi en ligne pour les suivre.</p>
      )}
    </Modal>
  );
};

const IconButton = ({ label, onClick, children, testId }: { label: string; onClick: () => void; children: ReactNode; testId?: string }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    data-testid={testId}
    onClick={() => {
      AudioEngine.click();
      onClick();
    }}
    className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-night-900/75 text-white shadow-lg backdrop-blur-sm transition-all duration-150 hover:bg-night-700 focus-visible:ring-4 focus-visible:ring-cyanx-400/50 focus-visible:outline-none active:scale-90 [&>svg]:h-6 [&>svg]:w-6"
  >
    {children}
  </button>
);

export const HomeScreen = ({ onSettings }: { onSettings: () => void }) => {
  const profile = useStore(appStore, (s) => s.profile);
  const apiStatus = useStore(appStore, (s) => s.apiStatus);
  const busy = useStore(appStore, (s) => s.busy);
  const trackId = useStore(appStore, (s) => s.trackId);
  const playerName = useStore(settingsStore, (s) => s.playerName);
  const [modal, setModal] = useState<'join' | 'rename' | 'stats' | null>(null);
  const sel = currentSelection();
  const canPlay = !!profile || (apiStatus === 'offline' && !!playerName);
  const online = apiStatus !== 'offline' && !!profile;
  // Multiplayer needs the realtime server (public config.js).
  const multi = online && realtimeUrl() !== null;
  const name = profile?.name ?? playerName;

  return (
    <div className="pointer-events-none absolute inset-0" data-testid="home-screen">
      <div className="absolute inset-0 bg-gradient-to-r from-night-950/55 via-transparent to-transparent portrait:bg-gradient-to-t portrait:from-night-950/70 portrait:via-transparent" />

      {/* Top-right: profile chip, balance, garage, settings, stats */}
      <div className="pointer-events-auto absolute flex items-center gap-2" style={{ right: 'calc(14px + var(--safe-r))', top: 'calc(12px + var(--safe-t))' }}>
        {canPlay && (
          <button
            type="button"
            onClick={() => {
              AudioEngine.click();
              setModal('rename');
            }}
            aria-label={`Profil ${name} — modifier le pseudo`}
            className="flex items-center gap-2 rounded-xl border border-white/15 bg-night-900/75 py-1 pr-3 pl-1 shadow-lg backdrop-blur-sm transition-colors hover:bg-night-700"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-b from-volt-400 to-volt-600 ring-2 ring-white/50">
              <PersonIcon className="h-6 w-6" />
            </span>
            <span className="max-w-[120px] truncate font-bold" data-testid="player-name">
              {name}
            </span>
            <PencilIcon className="h-4 w-4 text-white/70" />
          </button>
        )}
        {profile && (
          <span className="hidden items-center gap-1.5 rounded-xl border border-white/15 bg-night-900/75 px-2.5 py-2 font-display shadow-lg sm:flex" data-testid="vmru-balance">
            <CoinIcon className="h-6 w-6 text-sm" />
            {profile.balance.toLocaleString('fr-FR')}
          </span>
        )}
        {canPlay && (
          <IconButton label="Garage" onClick={() => goTo('garage')} testId="garage-button">
            <CarIcon />
          </IconButton>
        )}
        <IconButton label="Paramètres" onClick={onSettings} testId="settings-button">
          <GearIcon />
        </IconButton>
        <IconButton label="Statistiques" onClick={() => setModal('stats')} testId="stats-button">
          <StatsIcon />
        </IconButton>
      </div>

      {/* Logo */}
      <div className="absolute left-1/2 w-[min(32vw,290px)] -translate-x-[45%] tall:w-[min(44vw,520px)] tall:-translate-x-[62%] portrait:top-[9%] portrait:w-[78vw] portrait:-translate-x-1/2" style={{ top: 'calc(8px + var(--safe-t))' }}>
        <RaceRushLogo className="h-auto w-full drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)]" />
      </div>

      {/* Left column (landscape) / bottom (portrait): main actions */}
      <div
        className="pointer-events-auto absolute flex w-[min(42vw,390px)] flex-col gap-3 tall:gap-4 portrait:inset-x-0 portrait:mx-auto portrait:w-[min(86vw,360px)]"
        style={{ left: 'calc(20px + var(--safe-l))', bottom: 'calc(20px + var(--safe-b))' }}
      >
        {canPlay ? (
          <>
            <MenuButton tone="gold" size="lg" icon={<PlayIcon />} onClick={() => goTo('play')} testId="play-button">
              JOUER
            </MenuButton>
            <MenuButton
              tone="blue"
              icon={<UsersIcon />}
              disabled={!multi || busy}
              onClick={() => actions.createLobby({ trackId, laps: 3, botFill: true })}
              testId="home-create"
            >
              CRÉER UNE PARTIE
            </MenuButton>
            <MenuButton tone="violet" icon={<LinkIcon />} disabled={!multi} onClick={() => setModal('join')} testId="home-join">
              REJOINDRE UNE PARTIE
            </MenuButton>
            <div className="rounded-xl bg-night-950/60 py-1.5 pr-3 pl-12 text-xs font-semibold text-white/75 backdrop-blur-sm">
              <span className="text-gold-300">{VEHICLES[sel.vehicle].name}</span>
              {profile ? ` · Niv. ${profile.level} · ${profile.racesPlayed} courses` : ''}
              {apiStatus === 'offline' && <span className="block text-gold-300">● Hors ligne — entraînement sans récompense</span>}
            </div>
          </>
        ) : (
          <Onboarding />
        )}
      </div>

      <a
        href={SUPPORT_MAILTO}
        className="pointer-events-auto absolute rounded-lg bg-night-950/55 px-2 py-1 text-[11px] font-semibold text-white/70 backdrop-blur-sm transition-colors hover:text-gold-300 portrait:hidden"
        style={{ right: 'calc(14px + var(--safe-r))', bottom: 'calc(18px + var(--safe-b))' }}
        data-testid="home-support"
      >
        Un problème ? {SUPPORT_EMAIL}
      </a>

      {modal === 'join' && <JoinModal onClose={() => setModal(null)} />}
      {modal === 'rename' && <RenameModal current={name} onClose={() => setModal(null)} />}
      {modal === 'stats' && <StatsModal onClose={() => setModal(null)} />}
    </div>
  );
};
