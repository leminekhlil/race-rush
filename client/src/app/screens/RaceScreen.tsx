import { useEffect, useState } from 'react';
import { getEngineHost } from '../../game/engine/EngineHost';
import { RaceSession, type RaceConfig, type RaceNetAdapter } from '../../game/race/RaceSession';
import { hudStore } from '../../game/race/hud';
import { useStore } from '../../state/store';
import { settingsStore, touchDevice } from '../../state/settings';
import { RaceHud } from '../components/RaceHud';
import { TouchControls } from '../components/TouchControls';
import { appStore, goTo } from '../../state/appStore';
import { netBridge } from '../../net/raceBridge';

declare global {
  interface Window {
    __raceRush?: { session: RaceSession | null; hud: typeof hudStore; app: typeof appStore };
  }
}

const LoadingOverlay = () => {
  const { progress, label } = useStore(hudStore, (s) => ({ progress: s.loadingProgress, label: s.loadingLabel }));
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-night-950" data-testid="race-loading">
      <div className="font-display text-outline text-4xl text-gold-400 italic sm:text-6xl">RACE RUSH</div>
      <div className="mt-6 h-3 w-64 overflow-hidden rounded-full bg-night-800">
        <div className="boost-bar h-full transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="mt-3 text-lg font-semibold text-white/80">{label}</div>
    </div>
  );
};

const PauseMenu = ({ session, onQuit }: { session: RaceSession; onQuit: () => void }) => (
  <div className="absolute inset-0 z-30 flex items-center justify-center bg-night-950/60 backdrop-blur-sm">
    <div className="glass w-[min(92vw,380px)] rounded-3xl p-6 text-center">
      <div className="font-display text-3xl text-gold-400">PAUSE</div>
      <div className="mt-6 flex flex-col gap-3">
        <button type="button" className="btn-gold font-display rounded-2xl py-3 text-xl transition-transform" onClick={() => session.togglePause()}>
          REPRENDRE
        </button>
        <button type="button" className="btn-volt font-display rounded-2xl py-3 text-lg" onClick={onQuit}>
          QUITTER LA COURSE
        </button>
      </div>
    </div>
  </div>
);

export const RaceScreen = ({ config, net }: { config: RaceConfig; net: RaceNetAdapter | null }) => {
  const [session, setSession] = useState<RaceSession | null>(null);
  const phase = useStore(hudStore, (s) => s.phase);
  const paused = useStore(hudStore, (s) => s.paused);
  const autoAccel = useStore(settingsStore, (s) => s.autoAccelerate);
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const host = getEngineHost();
    const s = new RaceSession(host, config, {
      onResults: (results, rewards) => {
        appStore.set({ results: { raceId: config.raceId, results, rewards, localId: config.localId, trackId: config.trackId, mode: config.mode } });
        setTimeout(() => goTo('results'), config.mode === 'offline' ? 1600 : 900);
      },
    }, net);
    window.__raceRush = { session: s, hud: hudStore, app: appStore };
    netBridge.attachSession(s);
    let cancelled = false;
    s.load()
      .then(() => {
        if (!cancelled) setSession(s);
      })
      .catch((err) => {
        console.error('Race load failed', err);
        goTo('home');
      });
    return () => {
      cancelled = true;
      netBridge.attachSession(null);
      if (window.__raceRush) window.__raceRush.session = null;
      s.dispose();
    };
  }, [config, net]);

  useEffect(() => {
    const check = () => setPortrait(touchDevice && window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const quit = () => {
    netBridge.quitRace();
    goTo('home');
  };

  const showTouch = touchDevice || new URLSearchParams(location.search).has('touch');

  return (
    <div className="absolute inset-0">
      {!session && <LoadingOverlay />}
      {session && (
        <>
          <RaceHud session={session} />
          {showTouch && phase !== 'results' && <TouchControls input={session.input} onRespawn={() => session.requestRespawn()} />}
          {!autoAccel && showTouch && (
            <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-white/50">Accélération auto désactivée</div>
          )}
          <button
            type="button"
            aria-label="Pause"
            onClick={() => (config.mode === 'offline' ? session.togglePause() : quit())}
            className="glass-soft absolute flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-white/90 active:scale-90"
            style={{ left: '50%', top: 'calc(10px + var(--safe-t))', transform: 'translateX(-50%)' }}
          >
            {config.mode === 'offline' ? 'II' : '✕'}
          </button>
          {paused && <PauseMenu session={session} onQuit={quit} />}
        </>
      )}
      {portrait && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-night-950/95 p-8 text-center">
          <div className="animate-pulse text-6xl">📱↻</div>
          <div className="font-display mt-4 text-2xl text-gold-400">Tourne ton téléphone</div>
          <div className="mt-2 text-lg text-white/80">La course se joue en mode paysage.</div>
        </div>
      )}
    </div>
  );
};
