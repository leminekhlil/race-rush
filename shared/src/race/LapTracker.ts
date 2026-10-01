import { wrapDelta } from '../math';
import type { TrackPath } from '../track/TrackPath';

export interface LapTrackerSnapshot {
  lap: number;
  lapsCompleted: number;
  nextCheckpoint: number;
  progress: number;
  finished: boolean;
  finishTime: number | null;
  lapTimes: number[];
  bestLap: number | null;
}

export type LapEvent =
  | { type: 'checkpoint'; index: number; time: number }
  | { type: 'lap'; lap: number; lapTime: number; time: number }
  | { type: 'finish'; time: number }
  | { type: 'skip'; expected: number; time: number };

/**
 * Validates checkpoint order and counts laps.
 *
 * Checkpoint 0 is the start/finish line; checkpoints 1..N-1 are spread evenly along the loop.
 * The continuous `progress` (meters since the start line) is unwrapped relative to the last validated
 * checkpoint, so driving backward over the line or cutting the loop never counts as a lap.
 */
export class LapTracker {
  lapsCompleted = 0;
  nextCheckpoint = 1;
  progress = 0;
  finished = false;
  finishTime: number | null = null;
  lapTimes: number[] = [];
  private lapStart = 0;
  private lastS = 0;

  constructor(
    readonly path: TrackPath,
    readonly laps: number,
    startS = 0,
  ) {
    this.lastS = startS;
    this.progress = startS;
  }

  get lap(): number {
    return Math.min(this.laps, this.lapsCompleted + 1);
  }

  get bestLap(): number | null {
    return this.lapTimes.length ? Math.min(...this.lapTimes) : null;
  }

  private anchorS(): number {
    const n = this.path.def.checkpoints;
    const last = (this.nextCheckpoint - 1 + n) % n;
    return this.path.checkpointS(last);
  }

  private targetProgress(): number {
    const L = this.path.length;
    return this.nextCheckpoint === 0 ? (this.lapsCompleted + 1) * L : this.lapsCompleted * L + this.path.checkpointS(this.nextCheckpoint);
  }

  /**
   * Feeds a new projected position. `lateral` is used to ignore crossings outside the track corridor.
   * Returns emitted events.
   */
  update(s: number, lateral: number, raceTime: number): LapEvent[] {
    const events: LapEvent[] = [];
    if (this.finished) return events;
    const L = this.path.length;
    const n = this.path.def.checkpoints;
    const anchor = this.anchorS();
    const anchorProgress = this.nextCheckpoint === 1 ? this.lapsCompleted * L : this.lapsCompleted * L + anchor;
    const d = wrapDelta(s - anchor, L);
    this.progress = anchorProgress + d;
    this.lastS = s;

    const corridor = this.path.barrierOffset(s) + 2;
    if (Math.abs(lateral) > corridor) return events;

    // At most two checkpoints per update; more means a skipped checkpoint (teleport / cut).
    for (let guard = 0; guard < 2 && this.progress >= this.targetProgress(); guard++) {
      if (this.nextCheckpoint === 0) {
        this.lapsCompleted++;
        const lapTime = raceTime - this.lapStart;
        this.lapTimes.push(lapTime);
        this.lapStart = raceTime;
        events.push({ type: 'lap', lap: this.lapsCompleted, lapTime, time: raceTime });
        if (this.lapsCompleted >= this.laps) {
          this.finished = true;
          this.finishTime = raceTime;
          events.push({ type: 'finish', time: raceTime });
          break;
        }
        this.nextCheckpoint = 1;
      } else {
        events.push({ type: 'checkpoint', index: this.nextCheckpoint, time: raceTime });
        this.nextCheckpoint = (this.nextCheckpoint + 1) % n;
      }
    }
    if (!this.finished && this.progress >= this.targetProgress()) {
      events.push({ type: 'skip', expected: this.nextCheckpoint, time: raceTime });
    }
    return events;
  }

  /** Arc-length of the last validated checkpoint, used as the respawn anchor. */
  lastCheckpointS(): number {
    return this.anchorS();
  }

  snapshot(): LapTrackerSnapshot {
    return {
      lap: this.lap,
      lapsCompleted: this.lapsCompleted,
      nextCheckpoint: this.nextCheckpoint,
      progress: this.progress,
      finished: this.finished,
      finishTime: this.finishTime,
      lapTimes: [...this.lapTimes],
      bestLap: this.bestLap,
    };
  }
}

export interface RankEntry {
  id: string;
  progress: number;
  finished: boolean;
  finishTime: number | null;
}

/** Finished racers by time, then everyone else by distance covered. */
export const rankRacers = <T extends RankEntry>(entries: T[]): T[] =>
  [...entries].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });

export const formatRaceTime = (seconds: number | null | undefined): string => {
  if (seconds == null || !Number.isFinite(seconds)) return '--:--.--';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
};
