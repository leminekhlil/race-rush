import { describe, expect, it } from 'vitest';
import { MovementWindow, checkMovement, getTrackPath, LapTracker, minimumLapTime, rankRacers } from '../src';

const path = getTrackPath('city');
const L = path.length;

/** Feeds a tracker positions along the centerline from s0 to s1 (step meters). */
const drive = (t: LapTracker, s0: number, s1: number, step = 4, time = { v: 0 }) => {
  const events = [];
  const dir = Math.sign(s1 - s0);
  for (let s = s0; dir > 0 ? s <= s1 : s >= s1; s += step * dir) {
    time.v += 0.1;
    events.push(...t.update(path.wrap(s), 0, time.v));
  }
  return events;
};

describe('lap tracker', () => {
  it('counts laps only after every checkpoint in order', () => {
    const t = new LapTracker(path, 3, 20);
    const ev = drive(t, 20, L * 3 + 10);
    expect(ev.filter((e) => e.type === 'checkpoint')).toHaveLength((path.def.checkpoints - 1) * 3);
    expect(ev.filter((e) => e.type === 'lap')).toHaveLength(3);
    expect(t.finished).toBe(true);
    expect(ev.some((e) => e.type === 'skip')).toBe(false);
  });

  it('never counts a lap when reversing across the start line and back', () => {
    const t = new LapTracker(path, 3, 20);
    drive(t, 20, -60);
    const ev = drive(t, -60, 40);
    expect(ev.filter((e) => e.type === 'lap')).toHaveLength(0);
    expect(t.lapsCompleted).toBe(0);
    for (let i = 0; i < 10; i++) {
      drive(t, 40, -40);
      drive(t, -40, 40);
    }
    expect(t.lapsCompleted).toBe(0);
  });

  it('flags a teleport that skips checkpoints', () => {
    const t = new LapTracker(path, 3, 20);
    drive(t, 20, 100);
    const ev = t.update(path.wrap(100 + L * 0.35), 0, 50);
    expect(ev.some((e) => e.type === 'skip')).toBe(true);
  });

  it('a jump beyond half a lap reads as behind: no lap credit (movement check flags the jump)', () => {
    const t = new LapTracker(path, 3, 20);
    drive(t, 20, 100);
    const ev = t.update(path.wrap(100 + L * 0.6), 0, 50);
    expect(ev.filter((e) => e.type === 'lap' || e.type === 'checkpoint')).toHaveLength(0);
    expect(t.lapsCompleted).toBe(0);
    expect(checkMovement('sport', { x: path.xs[50], z: path.zs[50], t: 0 }, { ...path.pointAt(100 + L * 0.6, 0), t: 66 })?.kind).toBe('teleport');
  });

  it('starts behind the line with negative progress and crossing the line is not a lap', () => {
    const start = path.wrap(-20);
    const t = new LapTracker(path, 3, start);
    expect(t.progress).toBeCloseTo(-20, 0);
    const ev = drive(t, -20, 40);
    expect(ev.filter((e) => e.type === 'lap')).toHaveLength(0);
    expect(t.progress).toBeGreaterThan(30);
  });

  it('ranks finished racers by time, others by progress', () => {
    const r = rankRacers([
      { id: 'a', progress: 3000, finished: false, finishTime: null },
      { id: 'b', progress: 4000, finished: true, finishTime: 95 },
      { id: 'c', progress: 4000, finished: true, finishTime: 90 },
      { id: 'd', progress: 3500, finished: false, finishTime: null },
    ]);
    expect(r.map((x) => x.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('anti-cheat movement checks', () => {
  it('accepts legit motion and rejects speed hacks and teleports', () => {
    expect(checkMovement('sport', { x: 0, z: 0, t: 0 }, { x: 5, z: 0, t: 66 })).toBeNull();
    expect(checkMovement('sport', { x: 0, z: 0, t: 0 }, { x: 12, z: 0, t: 66 })?.kind).toBe('speed');
    expect(checkMovement('sport', { x: 0, z: 0, t: 0 }, { x: 300, z: 0, t: 66 })?.kind).toBe('teleport');
  });

  it('computes a physically plausible minimum lap time', () => {
    const min = minimumLapTime(path, 'sport');
    expect(min).toBeGreaterThan(14);
    expect(min).toBeLessThan(25);
  });
});


describe('mobile network movement windows', () => {
  it('accepts legal speed when packets arrive in compressed bursts', () => {
    const window = new MovementWindow();
    let prev = { x: 0, z: 0, t: 0 };
    let instantSpeedAlerts = 0;
    for (let i = 1; i <= 90; i++) {
      const next = { x: i * 5.94, z: 0, t: prev.t + [194, 2, 2][(i - 1) % 3] };
      if (checkMovement('sport', prev, next)?.kind === 'speed') instantSpeedAlerts++;
      expect(window.check('sport', prev, next)).toBeNull();
      prev = next;
    }
    expect(instantSpeedAlerts).toBeGreaterThan(5);
  });

  it('still rejects sustained excessive speed and immediate teleports', () => {
    const window = new MovementWindow();
    let prev = { x: 0, z: 0, t: 0 };
    let alerts = 0;
    for (let i = 1; i <= 100; i++) {
      const next = { x: i * 10, z: 0, t: i * 33 };
      if (window.check('sport', prev, next)?.kind === 'speed') alerts++;
      prev = next;
    }
    expect(alerts).toBeGreaterThan(0);
    expect(window.check('sport', prev, { x: prev.x + 300, z: 0, t: prev.t + 66 })?.kind).toBe('teleport');
  });
});
