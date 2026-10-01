import { useState } from 'react';
import { VEHICLES } from '@race-rush/shared';
import { useStore } from '../../state/store';
import { appStore, goTo } from '../../state/appStore';
import { settingsStore } from '../../state/settings';
import { actions, currentSelection } from '../actions';
import { Button, LevelBadge, Panel, VmruBadge } from '../components/ui';
import { AudioEngine } from '../../game/audio/AudioEngine';

const Logo = () => (
  <div className="select-none">
    <div className="font-display text-outline text-5xl leading-[0.9] text-white italic drop-shadow-[0_6px_0_rgba(31,107,255,0.6)] sm:text-7xl">
      RACE
      <span className="ml-2 bg-gradient-to-b from-gold-300 to-gold-600 bg-clip-text text-transparent">RUSH</span>
    </div>
    <div className="mt-1 text-sm font-bold tracking-[0.25em] text-cyanx-400 sm:text-base sm:tracking-[0.4em]">ARCADE · 3D · MULTIJOUEUR</div>
  </div>
);

const Onboarding = () => {
  const busy = useStore(appStore, (s) => s.busy);
  const [name, setName] = useState(settingsStore.get().playerName || '');
  const submit = async () => {
    AudioEngine.ensure();
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

export const HomeScreen = ({ onSettings }: { onSettings: () => void }) => {
  const profile = useStore(appStore, (s) => s.profile);
  const apiStatus = useStore(appStore, (s) => s.apiStatus);
  const playerName = useStore(settingsStore, (s) => s.playerName);
  const sel = currentSelection();
  const canPlay = !!profile || (apiStatus === 'offline' && !!playerName);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col" data-testid="home-screen">
      <div className="absolute inset-0 bg-gradient-to-r from-night-950/85 via-night-950/30 to-transparent" />
      <div className="relative flex flex-1 flex-col justify-between gap-4 p-4 sm:p-8" style={{ paddingLeft: 'calc(20px + var(--safe-l))', paddingTop: 'calc(16px + var(--safe-t))' }}>
        <div className="flex items-start justify-between gap-4">
          <Logo />
          <div className="pointer-events-auto flex items-center gap-2">
            {profile && <VmruBadge amount={profile.balance} />}
            <button
              type="button"
              aria-label="Paramètres"
              data-testid="settings-button"
              onClick={() => {
                AudioEngine.click();
                onSettings();
              }}
              className="glass flex h-11 w-11 items-center justify-center rounded-2xl text-xl transition-transform hover:bg-night-700 active:scale-90"
            >
              ⚙
            </button>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          {canPlay ? (
            <Panel className="w-[min(92vw,360px)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold tracking-[0.25em] text-volt-400">PILOTE</div>
                  <div className="truncate font-display text-2xl" data-testid="player-name">
                    {profile?.name ?? playerName}
                  </div>
                </div>
                {profile && <LevelBadge level={profile.level} xp={profile.xp} start={profile.xpLevelStart} next={profile.xpNextLevel} />}
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-white/70">
                <span className="rounded-lg bg-night-950/60 px-2 py-0.5 font-bold text-gold-300">{VEHICLES[sel.vehicle].name}</span>
                {profile && (
                  <span>
                    {profile.racesPlayed} courses · {profile.wins} victoires
                  </span>
                )}
              </div>
              {apiStatus === 'offline' && <div className="mt-2 text-xs font-semibold text-gold-300">● Hors ligne — courses d'entraînement sans récompense</div>}
            </Panel>
          ) : (
            <Onboarding />
          )}

          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <Button variant="gold" size="xl" disabled={!canPlay} onClick={() => goTo('play')} data-testid="play-button" className="min-w-[220px]">
              ▶ JOUER
            </Button>
            <Button variant="volt" size="lg" disabled={!canPlay} onClick={() => goTo('garage')} data-testid="garage-button">
              🔧 GARAGE
            </Button>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] tracking-wider whitespace-nowrap text-white/35 portrait:hidden">Race Rush MVP · Ing. Mohamed Lemine Khlil</div>
    </div>
  );
};
