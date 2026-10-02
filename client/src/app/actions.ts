import { isVehicleId, NO_UPGRADES, PAINTS, type LobbyDTO, type UpgradeLevels, type VehicleId } from '@race-rush/shared';
import { api, ApiError, hasToken } from '../net/api';
import { RealtimeClient } from '../net/realtime';
import { netBridge } from '../net/raceBridge';
import { appStore, goTo, notify, type Profile } from '../state/appStore';
import { settingsStore } from '../state/settings';
import { createOfflineRace } from '../game/race/offline';
import { AudioEngine } from '../game/audio/AudioEngine';

/** Automated-test hook (dev builds or VITE_TEST_HOOKS=1): the local car drives itself. */
const testAutopilot = (): boolean =>
  (import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === '1') && new URLSearchParams(location.search).get('autopilot') === '1';

/** Local selection used when no server profile is available (offline play). */
const offlineSelection = { vehicle: 'sport' as VehicleId, color: 'red' };

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Erreur inattendue.');

const realtime = new RealtimeClient({
  onLobby: (lobby: LobbyDTO | null) => {
    appStore.set({ lobby });
    const screen = appStore.get().screen;
    if (lobby && !lobby.solo && screen !== 'race' && screen !== 'results' && screen !== 'lobby' && screen !== 'select') goTo('lobby');
    if (!lobby && screen === 'lobby') goTo('play');
  },
  onRaceLoad: (load) => {
    appStore.set({ race: { ...load, mode: 'online', autopilot: testAutopilot() }, results: null, screen: 'race', busy: false });
  },
  onResults: (raceId, results, rewards) => {
    const race = appStore.get().race;
    appStore.set({ results: { raceId, results, rewards, localId: realtime.id, trackId: race?.trackId ?? 'city', mode: 'online' }, screen: 'results' });
  },
  onError: (_code, message) => {
    appStore.set({ busy: false });
    notify(message, 'error');
  },
  onClosed: () => {
    const { screen } = appStore.get();
    appStore.set({ lobby: null, busy: false });
    if (screen === 'lobby' || screen === 'race') {
      notify('Connexion au serveur de course perdue.', 'error');
      goTo('home');
    }
  },
});

netBridge.quitHandler = () => {
  realtime.send({ t: 'race.quit' });
  realtime.send({ t: 'lobby.leave' });
  appStore.set({ lobby: null, race: null });
};

export const getRealtime = () => realtime;

export const currentSelection = (): { vehicle: VehicleId; color: string; upgrades: UpgradeLevels } => {
  const p = appStore.get().profile;
  if (!p) return { ...offlineSelection, upgrades: { ...NO_UPGRADES } };
  const v = p.vehicles.find((x) => x.vehicle === p.selectedVehicle) ?? p.vehicles[0];
  return { vehicle: v.vehicle, color: v.color, upgrades: v.upgrades };
};

const setProfile = (profile: Profile | null) => appStore.set({ profile });

export const actions = {
  async boot(): Promise<void> {
    const catalogP = api.catalog().then((catalog) => appStore.set({ catalog, apiStatus: 'online' })).catch(() => appStore.set({ apiStatus: 'offline' }));
    if (hasToken()) {
      try {
        setProfile(await api.me());
        appStore.set({ apiStatus: 'online' });
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) appStore.set({ apiStatus: 'offline' });
      }
    }
    await catalogP;
    const join = new URLSearchParams(location.search).get('join');
    goTo('home');
    if (join && appStore.get().profile) void actions.joinLobby(join);
  },

  async createProfile(name: string): Promise<boolean> {
    const clean = name.trim();
    if (clean.length < 2) {
      notify('Choisis un pseudo (2 caractères minimum).', 'error');
      return false;
    }
    const goOffline = () => {
      // No backend reachable: the player can still race (offline practice, no rewards).
      settingsStore.set({ playerName: clean });
      appStore.set({ apiStatus: 'offline' });
      notify('Serveur indisponible : mode hors ligne (sans récompenses).', 'info');
      return true;
    };
    if (appStore.get().apiStatus === 'offline') return goOffline();
    appStore.set({ busy: true });
    try {
      const profile = await api.guest(clean);
      settingsStore.set({ playerName: clean });
      setProfile(profile);
      appStore.set({ apiStatus: 'online' });
      notify(`Bienvenue ${profile.name} ! +${profile.balance} v-MRU de départ`, 'good');
      AudioEngine.confirm();
      return true;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 0 || e.status === 404 || e.status >= 500)) return goOffline();
      notify(errorText(e), 'error');
      return false;
    } finally {
      appStore.set({ busy: false });
    }
  },

  /** Renames the pilot (server-validated when online, local name offline). */
  async rename(name: string): Promise<boolean> {
    const clean = name.trim().replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 16);
    if (clean.length < 2) {
      notify('Le pseudo doit contenir au moins 2 caractères.', 'error');
      return false;
    }
    if (!appStore.get().profile) {
      settingsStore.set({ playerName: clean });
      return true;
    }
    try {
      setProfile(await api.rename(clean));
      settingsStore.set({ playerName: clean });
      notify('Pseudo mis à jour.', 'good');
      return true;
    } catch (e) {
      notify(errorText(e), 'error');
      return false;
    }
  },

  async refreshProfile(): Promise<void> {
    if (!hasToken()) return;
    try {
      setProfile(await api.me());
    } catch {
      /* keep last known profile */
    }
  },

  /** Connects to the realtime server with a fresh signed ticket. */
  async ensureRealtime(): Promise<boolean> {
    if (realtime.connected) return true;
    try {
      const ticket = appStore.get().profile ? (await api.ticket()).ticket : null;
      await realtime.connect(ticket, appStore.get().profile?.name ?? settingsStore.get().playerName ?? 'Pilote');
      return true;
    } catch {
      return false;
    }
  },

  startOffline(trackId: string): void {
    const sel = currentSelection();
    const config = createOfflineRace({
      trackId,
      laps: 3,
      vehicle: sel.vehicle,
      color: sel.color,
      upgrades: sel.upgrades,
      playerName: appStore.get().profile?.name ?? settingsStore.get().playerName ?? 'Toi',
      bots: 4,
      autopilot: testAutopilot(),
    });
    appStore.set({ race: config, results: null, screen: 'race', trackId });
  },

  /** Quick race vs bots. Online (server-validated rewards) when possible, otherwise offline practice. */
  async playQuick(trackId: string): Promise<void> {
    AudioEngine.ensure();
    appStore.set({ busy: true, trackId });
    const sel = currentSelection();
    if (appStore.get().profile && (await actions.ensureRealtime())) {
      realtime.send({ t: 'lobby.create', trackId, laps: 3, botFill: true, solo: true, vehicle: sel.vehicle, color: sel.color });
      // race.load will switch to the race screen.
      window.setTimeout(() => appStore.get().busy && appStore.get().screen !== 'race' && appStore.set({ busy: false }), 6000);
      return;
    }
    appStore.set({ busy: false });
    if (appStore.get().profile) notify('Serveur de course indisponible : course hors ligne.', 'info');
    actions.startOffline(trackId);
  },

  async createLobby(opts: { trackId: string; laps: number; botFill: boolean }): Promise<void> {
    AudioEngine.ensure();
    if (!(await actions.ensureRealtime())) return notify('Serveur multijoueur injoignable.', 'error');
    const sel = currentSelection();
    realtime.send({ t: 'lobby.create', trackId: opts.trackId, laps: opts.laps, botFill: opts.botFill, vehicle: sel.vehicle, color: sel.color });
  },

  async joinLobby(code: string): Promise<void> {
    AudioEngine.ensure();
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(clean)) return notify('Le code fait 4 caractères (ex. 7X9K).', 'error');
    if (!(await actions.ensureRealtime())) return notify('Serveur multijoueur injoignable.', 'error');
    const sel = currentSelection();
    realtime.send({ t: 'lobby.join', code: clean, vehicle: sel.vehicle, color: sel.color });
  },

  leaveLobby(): void {
    realtime.send({ t: 'lobby.leave' });
    appStore.set({ lobby: null });
    goTo('play');
  },

  setReady(ready: boolean): void {
    AudioEngine.click();
    realtime.send({ t: 'lobby.ready', ready });
  },

  startLobby(): void {
    AudioEngine.confirm();
    realtime.send({ t: 'lobby.start' });
  },

  lobbySelect(vehicle: VehicleId, color: string): void {
    realtime.send({ t: 'lobby.select', vehicle, color });
  },

  lobbyConfig(cfg: { trackId?: string; laps?: number; botFill?: boolean }): void {
    realtime.send({ t: 'lobby.config', ...cfg });
  },

  async garage<T extends unknown[]>(fn: (...a: T) => Promise<Profile>, ...args: T): Promise<boolean> {
    if (!appStore.get().profile) {
      notify('Connecte-toi au serveur pour modifier ton garage.', 'info');
      return false;
    }
    try {
      setProfile(await fn(...args));
      return true;
    } catch (e) {
      notify(errorText(e), 'error');
      return false;
    }
  },

  /** Selecting a vehicle works offline too (local fallback). */
  async selectVehicle(vehicle: VehicleId): Promise<void> {
    if (!appStore.get().profile) {
      offlineSelection.vehicle = vehicle;
      appStore.set({});
      return;
    }
    await actions.garage(api.select, vehicle);
  },

  async paint(vehicle: VehicleId, color: string): Promise<void> {
    if (!appStore.get().profile) {
      const paint = PAINTS.find((p) => p.id === color);
      if (paint && !paint.premium) {
        offlineSelection.color = color;
        appStore.set({});
      }
      return;
    }
    await actions.garage(api.paint, vehicle, color);
  },

  /** Persists the vehicle + colour chosen on the selection screen (server when online, local otherwise). */
  async applySelection(vehicle: VehicleId, color: string): Promise<void> {
    const p = appStore.get().profile;
    if (!p) {
      offlineSelection.vehicle = vehicle;
      if (!PAINTS.find((x) => x.id === color)?.premium) offlineSelection.color = color;
      appStore.set({});
      return;
    }
    const current = p.vehicles.find((v) => v.vehicle === vehicle);
    if (current && current.color !== color) await actions.garage(api.paint, vehicle, color);
    if (p.selectedVehicle !== vehicle) await actions.garage(api.select, vehicle);
  },

  rematch(): void {
    const res = appStore.get().results;
    const lobby = appStore.get().lobby;
    if (res?.mode === 'online' && lobby && !lobby.solo) {
      goTo('lobby');
      return;
    }
    if (res?.mode === 'online') void actions.playQuick(res.trackId);
    else actions.startOffline(res?.trackId ?? 'city');
  },

  backHome(): void {
    const lobby = appStore.get().lobby;
    if (lobby) realtime.send({ t: 'lobby.leave' });
    appStore.set({ lobby: null, race: null });
    goTo('home');
  },
};

export const isValidVehicle = isVehicleId;
