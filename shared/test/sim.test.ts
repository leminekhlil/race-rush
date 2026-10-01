import { describe, expect, it } from 'vitest';
import { ArcadeVehicle, AutoPilot, LapTracker, getTrackPath, gridSlot, tunedVehicle, VEHICLE_IDS, TRACK_IDS } from '../src';

const DT = 1 / 60;

const runRace = (trackId: string, vehicleId: (typeof VEHICLE_IDS)[number], laps = 3, skill = 1, pace = 1) => {
  const path = getTrackPath(trackId);
  const car = new ArcadeVehicle(path, tunedVehicle(vehicleId), gridSlot(path, 0).s, 0);
  const pilot = new AutoPilot(car, { skill, lane: 0, seed: 7, useBoost: true });
  pilot.pace = pace;
  const tracker = new LapTracker(path, laps, car.state.s);
  let t = 0;
  let wallHits = 0;
  let respawns = 0;
  let airborne = 0;
  let maxSpeed = 0;
  while (!tracker.finished && t < 400) {
    car.step(DT, pilot.update(DT));
    t += DT;
    for (const e of car.events) {
      if (e.type === 'impact') wallHits++;
      if (e.type === 'respawn') respawns++;
      if (e.type === 'takeoff') airborne++;
    }
    car.events.length = 0;
    maxSpeed = Math.max(maxSpeed, car.planarSpeed);
    for (const ev of tracker.update(car.state.s, car.state.lateral, t)) {
      if (ev.type === 'skip') throw new Error('checkpoint skipped');
    }
  }
  return { tracker, t, wallHits, respawns, airborne, maxSpeed };
};

describe('arcade simulation', () => {
  for (const trackId of TRACK_IDS) {
    for (const vid of VEHICLE_IDS) {
      it(`${vid} completes 3 laps of ${trackId} on autopilot`, () => {
        const r = runRace(trackId, vid);
        console.log(trackId, vid, 'time', r.t.toFixed(1), 'laps', r.tracker.lapTimes.map((l) => l.toFixed(1)).join('/'), 'walls', r.wallHits, 'respawns', r.respawns, 'jumps', r.airborne, 'vmax', (r.maxSpeed * 3.6).toFixed(0), 'km/h');
        expect(r.tracker.finished).toBe(true);
        expect(r.respawns).toBe(0);
        expect(r.tracker.lapTimes).toHaveLength(3);
        // Arcade pacing: a lap should take between 20 and 60 seconds.
        for (const lap of r.tracker.lapTimes) {
          expect(lap).toBeGreaterThan(20);
          expect(lap).toBeLessThan(60);
        }
      });
    }
  }

  for (const trackId of TRACK_IDS) {
    it(`leading bots (skill 0.66, pace 0.85) still finish ${trackId} cleanly but slower`, () => {
      const fast = runRace(trackId, 'buggy', 1);
      const easy = runRace(trackId, 'buggy', 1, 0.66, 0.85);
      console.log(trackId, 'bot lap', easy.t.toFixed(1), 'vs autopilot', fast.t.toFixed(1));
      expect(easy.tracker.finished).toBe(true);
      expect(easy.respawns).toBe(0);
      expect(easy.t).toBeGreaterThan(fast.t * 1.05);
    });
  }
});
