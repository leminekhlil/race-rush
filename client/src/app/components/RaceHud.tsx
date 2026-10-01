import { useEffect, useRef, type ReactNode } from 'react';
import { formatRaceTime, getTrackPath } from '@race-rush/shared';
import { useStore } from '../../state/store';
import { hudStore } from '../../game/race/hud';
import type { RaceSession } from '../../game/race/RaceSession';
import { settingsStore } from '../../state/settings';
import { CheckeredFlagIcon, StopwatchIcon } from './HudIcons';

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);
const BOOST_SEGMENTS = 5;

/** Small checkered flag painted on the minimap at the start line. */
const drawFlag = (b: CanvasRenderingContext2D, x: number, y: number) => {
  const cell = 3;
  b.fillStyle = '#e9edf5';
  b.fillRect(x - 1, y - 12, 1.6, 13);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      b.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111827';
      b.fillRect(x + 0.6 + c * cell, y - 12 + r * cell, cell, cell);
    }
  }
};

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
    const pad = 16;
    const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = pad + (size - pad * 2 - (maxX - minX) * scale) / 2;
    const oz = pad + (size - pad * 2 - (maxZ - minZ) * scale) / 2;
    const mx = (x: number) => ox + (x - minX) * scale;
    const mz = (z: number) => size - (oz + (z - minZ) * scale);

    // Pre-render the circuit: dark outline + thick white ribbon + checkered flag at the start.
    const bg = document.createElement('canvas');
    bg.width = bg.height = size;
    const b = bg.getContext('2d')!;
    b.lineJoin = 'round';
    b.lineCap = 'round';
    b.beginPath();
    for (let i = 0; i <= path.count; i += 2) {
      const k = i % path.count;
      if (i === 0) b.moveTo(mx(path.xs[k]), mz(path.zs[k]));
      else b.lineTo(mx(path.xs[k]), mz(path.zs[k]));
    }
    b.closePath();
    b.strokeStyle = 'rgba(4,10,28,0.95)';
    b.lineWidth = 11;
    b.stroke();
    b.strokeStyle = '#eef2fa';
    b.lineWidth = 6;
    b.stroke();
    drawFlag(b, mx(path.xs[0]) + 4, mz(path.zs[0]) - 2);

    const dot = (x: number, y: number, r: number, fill: string, ring: string, ringW: number) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = ring;
      ctx.lineWidth = ringW;
      ctx.stroke();
    };
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 66) return;
      last = t;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(bg, 0, 0);
      const dots = session.minimapDots();
      for (const d of dots) if (!d.local) dot(mx(d.x), mz(d.z), 5, d.color, '#ffffff', 2);
      const me = dots.find((d) => d.local);
      if (me) dot(mx(me.x), mz(me.z), 7.5, '#ffffff', '#040a1c', 3);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [session]);
  return (
    <canvas
      ref={ref}
      width={160}
      height={160}
      className="h-[92px] w-[92px] rounded-[22px] border border-white/15 bg-night-950/70 shadow-xl backdrop-blur-sm tall:h-[136px] tall:w-[136px] tall:rounded-[28px]"
      aria-label="Mini-carte du circuit"
    />
  );
};

/** Segmented boost gauge (reference "Barre de boost"): fills while driving and drifting. */
const BoostGauge = ({ boost, boosting }: { boost: number; boosting: boolean }) => (
  <div
    className={`flex gap-1 rounded-xl border-2 border-white/20 bg-night-950/75 p-1 shadow-xl transition-shadow duration-200 ${
      boosting ? 'shadow-[0_0_24px_rgba(25,227,255,0.65)]' : ''
    }`}
    role="meter"
    aria-label="Jauge de boost"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(boost * 100)}
  >
    {Array.from({ length: BOOST_SEGMENTS }, (_, i) => {
      const fill = Math.max(0, Math.min(1, boost * BOOST_SEGMENTS - i));
      return (
        <div key={i} className="h-2.5 w-7 overflow-hidden rounded-[5px] bg-white/10 tall:h-3.5 tall:w-11">
          <div
            className="h-full rounded-[5px] bg-gradient-to-b from-cyanx-400 to-volt-500 transition-[width] duration-100"
            style={{ width: `${fill * 100}%`, boxShadow: fill > 0 ? 'inset 0 1px 0 rgba(255,255,255,0.55)' : undefined }}
          />
        </div>
      );
    })}
  </div>
);

/** Start lights shown during the countdown: red lamps light up 3-2-1, all green on GO. */
const StartLights = ({ countdown }: { countdown: number | 'GO' }) => {
  const lit = countdown === 'GO' ? 3 : Math.max(0, 4 - countdown);
  return (
    <div className="flex gap-2 rounded-2xl border-2 border-white/15 bg-night-950/85 px-3 py-2 shadow-2xl tall:gap-3 tall:px-4 tall:py-2.5" aria-hidden>
      {[0, 1, 2].map((i) => {
        const color =
          countdown === 'GO' ? 'bg-[#3dff6a] shadow-[0_0_18px_#3dff6a]' : i < lit ? 'bg-[#ff3b30] shadow-[0_0_18px_#ff3b30]' : 'bg-[#2a3142]';
        return <div key={i} className={`h-6 w-6 rounded-full border-2 border-black/50 tall:h-9 tall:w-9 ${color}`} />;
      })}
    </div>
  );
};

interface RaceHudProps {
  session: RaceSession;
  compact: boolean;
  /** Rendered at the start of the top-right row (pause / quit button). */
  leading?: ReactNode;
}

export const RaceHud = ({ session, compact, leading }: RaceHudProps) => {
  const hud = useStore(hudStore, (s) => s);
  const showFps = useStore(settingsStore, (s) => s.showFps);
  const speedlinesOpacity = Math.max(0, Math.min(1, (hud.speedRatio - 0.62) * 2.2)) * (hud.boosting ? 0.6 : 0.3);
  const lap = Math.min(hud.lap, hud.laps);
  const lastLap = hud.phase === 'racing' && lap === hud.laps && hud.laps > 1;

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

      {/* Top-left: position card + standings ("Toi" highlighted) */}
      <div className="absolute flex w-[118px] flex-col gap-1.5 tall:w-[150px]" style={{ left: 'calc(12px + var(--safe-l))', top: 'calc(10px + var(--safe-t))' }}>
        <div className="rounded-2xl border border-white/15 bg-night-950/75 px-3 py-1 text-center shadow-xl backdrop-blur-sm tall:py-2" data-testid="hud-position">
          <div className="font-display text-outline leading-none">
            <span className="text-4xl text-white tall:text-5xl">{hud.position}</span>
            <span className="text-xl text-white/80 tall:text-2xl">/{hud.total}</span>
          </div>
          <div className="mt-0.5 text-[10px] font-bold tracking-[0.18em] text-white/85 tall:text-xs">POSITION</div>
        </div>
        <ol className="overflow-hidden rounded-xl border border-white/10 bg-night-950/60 text-[13px] backdrop-blur-sm tall:text-[15px]" aria-label="Classement">
          {hud.standings.slice(0, compact ? 4 : 5).map((r) => (
            <li
              key={r.id}
              className={`flex items-center gap-2 px-2 leading-[1.45] ${
                r.isLocal ? 'bg-gradient-to-r from-gold-400 to-gold-500 font-bold text-night-950' : 'text-white/90 odd:bg-white/[0.04]'
              }`}
            >
              <span className="font-display w-4 text-right italic tabular-nums">{r.position}</span>
              <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/40" style={{ background: r.color }} />
              <span className="truncate font-semibold">{r.isLocal ? 'Toi' : r.name}</span>
              {r.finished && <CheckeredFlagIcon className="ml-auto h-3.5 w-3.5 shrink-0" />}
            </li>
          ))}
        </ol>
      </div>

      {/* Top-right: [pause] lap + stopwatch + minimap */}
      <div className="absolute flex items-start gap-2 tall:gap-3" style={{ right: 'calc(12px + var(--safe-r))', top: 'calc(10px + var(--safe-t))' }}>
        <div className="flex items-center gap-2 tall:gap-3">
          {leading}
          <div
            className={`flex items-baseline gap-1.5 rounded-xl border px-2.5 py-1 shadow-xl backdrop-blur-sm tall:px-3.5 tall:py-1.5 ${
              lastLap ? 'border-gold-400/70 bg-night-950/85' : 'border-white/15 bg-night-950/75'
            }`}
            data-testid="hud-lap"
          >
            {lastLap && <CheckeredFlagIcon className="h-4 w-4 self-center tall:h-5 tall:w-5" />}
            <span className="text-[11px] font-bold tracking-wider text-white/85 tall:text-sm">TOUR</span>
            <span className="font-display text-outline text-xl leading-none italic tall:text-3xl">
              <span className="text-cyanx-400">{lap}</span>
              <span className="text-white/90">/{hud.laps}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-night-950/75 px-2.5 py-1 shadow-xl backdrop-blur-sm tall:px-3.5 tall:py-1.5">
            <StopwatchIcon className="h-4 w-4 text-gold-400 tall:h-6 tall:w-6" />
            <span className="font-display text-lg leading-none tabular-nums tall:text-2xl" data-testid="hud-time">
              {formatRaceTime(hud.raceTime)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <MiniMap session={session} />
          {hud.bestLap != null && (
            <div className="rounded-lg bg-night-950/70 px-2 py-0.5 text-[11px] font-semibold text-gold-300 tall:text-xs">Meilleur {formatRaceTime(hud.bestLap)}</div>
          )}
          {(showFps || hud.offline) && (
            <div className="rounded-lg bg-night-950/60 px-2 py-0.5 text-[11px] text-white/70">
              {hud.offline && <span className={showFps ? 'mr-2 text-gold-300' : 'text-gold-300'}>HORS LIGNE</span>}
              {showFps && <span data-testid="hud-fps">{hud.fps} FPS</span>}
            </div>
          )}
        </div>
      </div>

      {/* Bottom-center: speed + segmented boost gauge */}
      <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ bottom: 'calc(10px + var(--safe-b))' }}>
        <div className="flex items-baseline gap-1">
          <span className="font-display text-outline text-2xl tabular-nums tall:text-4xl" data-testid="hud-speed">
            {hud.speedKmh}
          </span>
          <span className="text-xs font-bold text-white/75 tall:text-sm">km/h</span>
        </div>
        <div className="mt-1">
          <BoostGauge boost={hud.boost} boosting={hud.boosting} />
        </div>
        <div className={`mt-0.5 text-[10px] font-bold tracking-[0.3em] tall:text-[11px] ${hud.boosting || hud.drifting ? 'text-cyanx-400' : 'text-white/55'}`}>
          {hud.boosting ? 'BOOST !' : hud.drifting ? 'DRIFT' : 'BOOST'}
        </div>
      </div>

      {/* Countdown: start lights + yellow digits, green GO! */}
      {hud.countdown !== null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" data-testid="countdown">
          <StartLights countdown={hud.countdown} />
          <div key={String(hud.countdown)} className="animate-pop">
            <div className={`countdown-digit font-display text-[24vmin] leading-none italic ${hud.countdown === 'GO' ? 'countdown-go' : ''}`}>
              {hud.countdown === 'GO' ? 'GO!' : hud.countdown}
            </div>
          </div>
        </div>
      )}

      {hud.phase === 'intro' && (
        <div className="absolute inset-x-0 top-[24%] text-center">
          <div className="font-display text-outline text-3xl text-white/95 italic tall:text-5xl">PRÊTS ?</div>
        </div>
      )}

      {hud.toast && (
        <div key={hud.toast.id} className="absolute inset-x-0 top-[22%] flex justify-center">
          <div
            className={`animate-toast font-display text-outline flex items-center gap-3 rounded-2xl px-5 py-1 text-2xl italic tall:text-4xl ${
              hud.toast.tone === 'good' ? 'text-gold-400' : hud.toast.tone === 'warn' ? 'text-rush-500' : 'text-white'
            }`}
          >
            {hud.toast.text === 'DERNIER TOUR !' && <CheckeredFlagIcon className="h-9 w-9 tall:h-12 tall:w-12" />}
            {hud.toast.text}
          </div>
        </div>
      )}

      {hud.wrongWay && (
        <div className="absolute inset-x-0 top-[36%] flex justify-center">
          <div className="font-display text-outline animate-pulse rounded-2xl bg-rush-500/80 px-6 py-2 text-2xl tall:text-4xl">MAUVAIS SENS ↺</div>
        </div>
      )}

      {hud.phase === 'finished' && (
        <div className="absolute inset-x-0 top-[22%] flex flex-col items-center text-center">
          <CheckeredFlagIcon className="animate-pop h-14 w-14 tall:h-20 tall:w-20" />
          <div className="animate-pop font-display text-outline text-5xl text-gold-400 italic tall:text-7xl">ARRIVÉE !</div>
          <div className="font-display text-outline mt-2 text-2xl tall:text-4xl">{ordinal(hud.position)} place</div>
        </div>
      )}
    </div>
  );
};
