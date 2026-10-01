import { useEffect, useRef } from 'react';
import { formatRaceTime, getTrackPath } from '@race-rush/shared';
import { useStore } from '../../state/store';
import { hudStore } from '../../game/race/hud';
import type { RaceSession } from '../../game/race/RaceSession';
import { settingsStore } from '../../state/settings';

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

const MiniMap = ({ session }: { session: RaceSession }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const path = getTrackPath(session.config.trackId);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < path.count; i++) {
      minX = Math.min(minX, path.xs[i]);
      maxX = Math.max(maxX, path.xs[i]);
      minZ = Math.min(minZ, path.zs[i]);
      maxZ = Math.max(maxZ, path.zs[i]);
    }
    const size = canvas.width;
    const pad = 10;
    const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = pad + ((size - pad * 2) - (maxX - minX) * scale) / 2;
    const oz = pad + ((size - pad * 2) - (maxZ - minZ) * scale) / 2;
    const mx = (x: number) => ox + (x - minX) * scale;
    const mz = (z: number) => size - (oz + (z - minZ) * scale);
    // Pre-render track outline.
    const bg = document.createElement('canvas');
    bg.width = bg.height = size;
    const b = bg.getContext('2d')!;
    b.lineJoin = 'round';
    b.beginPath();
    for (let i = 0; i <= path.count; i += 2) {
      const k = i % path.count;
      if (i === 0) b.moveTo(mx(path.xs[k]), mz(path.zs[k]));
      else b.lineTo(mx(path.xs[k]), mz(path.zs[k]));
    }
    b.closePath();
    b.strokeStyle = 'rgba(4,10,28,0.9)';
    b.lineWidth = 7;
    b.stroke();
    b.strokeStyle = 'rgba(200,215,255,0.85)';
    b.lineWidth = 3;
    b.stroke();
    b.fillStyle = '#ffc61a';
    b.fillRect(mx(path.xs[0]) - 3, mz(path.zs[0]) - 3, 6, 6);

    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 66) return;
      last = t;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(bg, 0, 0);
      const dots = session.minimapDots();
      for (const d of dots) {
        if (d.local) continue;
        ctx.beginPath();
        ctx.arc(mx(d.x), mz(d.z), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = d.color;
        ctx.fill();
        ctx.strokeStyle = '#040a1c';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      const me = dots.find((d) => d.local);
      if (me) {
        ctx.beginPath();
        ctx.arc(mx(me.x), mz(me.z), 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffc61a';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [session]);
  return <canvas ref={ref} width={132} height={132} className="glass-soft h-[96px] w-[96px] rounded-2xl sm:h-[132px] sm:w-[132px]" aria-label="Mini-carte" />;
};

export const RaceHud = ({ session }: { session: RaceSession }) => {
  const hud = useStore(hudStore, (s) => s);
  const showFps = useStore(settingsStore, (s) => s.showFps);
  const speedlinesOpacity = Math.max(0, Math.min(1, (hud.speedRatio - 0.62) * 2.2)) * (hud.boosting ? 0.6 : 0.3);

  return (
    <div className="pointer-events-none absolute inset-0 select-none" data-testid="race-hud">
      {/* Speed lines & boost vignette */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="speedlines" style={{ opacity: hud.phase === 'racing' ? speedlinesOpacity : 0 }} />
        <div
          className="absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: hud.boosting ? 1 : 0,
            background: 'radial-gradient(ellipse at center, transparent 55%, rgba(25,227,255,0.22) 85%, rgba(31,107,255,0.4) 100%)',
          }}
        />
      </div>

      {/* Top-left: position + lap + time */}
      <div className="absolute flex items-start gap-2 sm:gap-3" style={{ left: 'calc(12px + var(--safe-l))', top: 'calc(10px + var(--safe-t))' }}>
        <div className="glass skew-panel flex items-baseline gap-1 rounded-l-2xl py-1 pr-6 pl-3 sm:py-2 sm:pl-4" data-testid="hud-position">
          <span className="font-display text-outline text-4xl leading-none text-gold-400 sm:text-6xl">{hud.position}</span>
          <span className="font-display text-lg text-white/80 sm:text-2xl">/ {hud.total}</span>
        </div>
        <div className="glass rounded-2xl px-3 py-1.5 sm:px-4 sm:py-2">
          <div className="text-[11px] font-bold tracking-[0.2em] text-volt-400 sm:text-xs">TOUR</div>
          <div className="font-display text-xl leading-tight sm:text-3xl" data-testid="hud-lap">
            {Math.min(hud.lap, hud.laps)} <span className="text-white/50">/ {hud.laps}</span>
          </div>
        </div>
        <div className="glass rounded-2xl px-3 py-1.5 sm:px-4 sm:py-2">
          <div className="text-[11px] font-bold tracking-[0.2em] text-volt-400 sm:text-xs">TEMPS</div>
          <div className="font-display text-xl leading-tight tabular-nums sm:text-3xl" data-testid="hud-time">
            {formatRaceTime(hud.raceTime)}
          </div>
          {hud.bestLap != null && <div className="text-[11px] font-semibold text-gold-300 sm:text-xs">Meilleur {formatRaceTime(hud.bestLap)}</div>}
        </div>
      </div>

      {/* Top-right: minimap + standings */}
      <div className="absolute flex flex-col items-end gap-2" style={{ right: 'calc(12px + var(--safe-r))', top: 'calc(10px + var(--safe-t))' }}>
        <MiniMap session={session} />
        <ol className="glass-soft hidden min-w-[150px] rounded-xl px-2 py-1 text-sm sm:block" aria-label="Classement">
          {hud.standings.slice(0, 5).map((r) => (
            <li key={r.id} className={`flex items-center gap-2 py-0.5 ${r.isLocal ? 'font-bold text-gold-300' : 'text-white/85'}`}>
              <span className="w-4 text-right tabular-nums">{r.position}</span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
              <span className="truncate">{r.name}</span>
              {r.finished && <span className="ml-auto text-xs">🏁</span>}
            </li>
          ))}
        </ol>
        {(showFps || hud.offline) && (
          <div className="glass-soft rounded-lg px-2 py-0.5 text-xs text-white/70">
            {hud.offline && <span className="mr-2 text-gold-300">HORS LIGNE</span>}
            {showFps && <span data-testid="hud-fps">{hud.fps} FPS</span>}
          </div>
        )}
      </div>

      {/* Bottom-center: speed + boost gauge */}
      <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: 'calc(10px + var(--safe-b))' }}>
        <div className="flex items-baseline gap-1">
          <span className="font-display text-outline text-4xl tabular-nums sm:text-6xl" data-testid="hud-speed">
            {hud.speedKmh}
          </span>
          <span className="font-bold text-white/70">km/h</span>
        </div>
        <div className="glass-soft mt-1 h-3 w-40 overflow-hidden rounded-full sm:h-4 sm:w-64" aria-label="Jauge de boost">
          <div className={`boost-bar h-full rounded-full transition-[width] duration-100 ${hud.boosting ? 'shine' : ''}`} style={{ width: `${Math.round(hud.boost * 100)}%` }} />
        </div>
        <div className={`mt-0.5 text-[11px] font-bold tracking-[0.3em] ${hud.boost > 0.2 ? 'text-cyanx-400' : 'text-white/40'}`}>
          {hud.boosting ? 'BOOST !' : hud.drifting ? 'DRIFT' : 'BOOST'}
        </div>
      </div>

      {/* Countdown */}
      {hud.countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div key={String(hud.countdown)} className="animate-pop text-center" data-testid="countdown">
            <div className={`font-display text-outline text-[28vmin] leading-none ${hud.countdown === 'GO' ? 'text-gold-400' : 'text-white'}`}>{hud.countdown}</div>
          </div>
        </div>
      )}

      {hud.phase === 'intro' && (
        <div className="absolute inset-x-0 top-[22%] text-center">
          <div className="font-display text-outline text-3xl text-white/95 sm:text-5xl">PRÊTS ?</div>
        </div>
      )}

      {hud.toast && (
        <div key={hud.toast.id} className="absolute inset-x-0 top-[20%] flex justify-center">
          <div
            className={`animate-toast font-display text-outline rounded-2xl px-5 py-1 text-2xl sm:text-4xl ${
              hud.toast.tone === 'good' ? 'text-gold-400' : hud.toast.tone === 'warn' ? 'text-rush-500' : 'text-white'
            }`}
          >
            {hud.toast.text}
          </div>
        </div>
      )}

      {hud.wrongWay && (
        <div className="absolute inset-x-0 top-[34%] flex justify-center">
          <div className="font-display text-outline animate-pulse rounded-2xl bg-rush-500/80 px-6 py-2 text-2xl sm:text-4xl">MAUVAIS SENS ↺</div>
        </div>
      )}

      {hud.phase === 'finished' && (
        <div className="absolute inset-x-0 top-[24%] text-center">
          <div className="animate-pop font-display text-outline text-5xl text-gold-400 sm:text-7xl">ARRIVÉE !</div>
          <div className="font-display text-outline mt-2 text-2xl sm:text-4xl">{ordinal(hud.position)} place</div>
        </div>
      )}
    </div>
  );
};
