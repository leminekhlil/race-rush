import { randomUUID } from 'node:crypto';
import {
  ArcadeVehicle,
  AutoPilot,
  checkMovement,
  COUNTDOWN_MS,
  FINISH_GRACE_MS,
  FLAG_AIR,
  FLAG_BOOST,
  FLAG_DRIFT,
  getTrackPath,
  gridSlot,
  isFiniteNumber,
  LapTracker,
  LOAD_TIMEOUT_MS,
  minimumLapTime,
  NET_SNAPSHOT_HZ,
  NET_STANDINGS_HZ,
  rankRacers,
  tunedVehicle,
  type Anomaly,
  type GridEntry,
  type Obstacle,
  type RacerStateDTO,
  type ResultDTO,
  type RewardDTO,
  type ServerMessage,
  type TrackPath,
} from '@race-rush/shared';
import type { Client } from './Client';
import { internalCall } from './api';
import { config } from './config';
import { log } from './logger';

interface Racer {
  entry: GridEntry;
  client: Client | null;
  bot: { vehicle: ArcadeVehicle; pilot: AutoPilot } | null;
  tracker: LapTracker;
  state: { x: number; y: number; z: number; h: number; v: number; f: number; t: number };
  hint: number;
  loaded: boolean;
  finishedAt: number | null;
  dnf: boolean;
  anomalies: Anomaly[];
  flagged: boolean;
  speedStrikes: number;
  respawnPending: boolean;
  stateCount: number;
}

export type RoomPhase = 'loading' | 'countdown' | 'racing' | 'settling' | 'done';

export interface RaceRoomOptions {
  trackId: string;
  laps: number;
  grid: GridEntry[];
  clients: Map<string, Client>;
  lobbyCode: string;
  onDone: (results: ResultDTO[]) => void;
}

/**
 * Authoritative race state. Humans simulate locally and stream positions; the room validates them,
 * runs checkpoint/lap tracking itself, simulates bots, ranks racers and settles results with the API.
 */
export class RaceRoom {
  readonly id = randomUUID();
  readonly path: TrackPath;
  phase: RoomPhase = 'loading';
  private racers: Racer[] = [];
  private startAt = 0;
  private firstFinishAt: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private loadDeadline = Date.now() + LOAD_TIMEOUT_MS;
  private registered: Promise<boolean>;
  private readonly obstacles: Obstacle[] = [];

  constructor(private readonly opts: RaceRoomOptions) {
    this.path = getTrackPath(opts.trackId);
    for (const entry of opts.grid) {
      const slot = gridSlot(this.path, entry.slot);
      const p = this.path.pointAt(slot.s, slot.lateral);
      const client = entry.isBot ? null : (opts.clients.get(entry.id) ?? null);
      let bot: Racer['bot'] = null;
      if (entry.isBot) {
        const vehicle = new ArcadeVehicle(this.path, tunedVehicle(entry.vehicle, entry.upgrades), slot.s, slot.lateral);
        vehicle.ownerId = entry.id;
        bot = { vehicle, pilot: new AutoPilot(vehicle, { skill: 0.84 + (entry.slot % 3) * 0.04, lane: slot.lateral * 0.5, seed: entry.slot * 131 + 7, useBoost: true }) };
      }
      this.racers.push({
        entry,
        client,
        bot,
        tracker: new LapTracker(this.path, opts.laps, slot.s),
        state: { x: p.x, y: p.y, z: p.z, h: p.heading, v: 0, f: 0, t: Date.now() },
        hint: -1,
        loaded: entry.isBot,
        finishedAt: null,
        dnf: false,
        anomalies: [],
        flagged: false,
        speedStrikes: 0,
        respawnPending: false,
        stateCount: 0,
      });
    }
    this.registered = this.register();
    this.broadcast({ t: 'race.load', raceId: this.id, trackId: opts.trackId, laps: opts.laps, grid: opts.grid });
    this.timer = setInterval(() => this.tick(), 1000 / config.tickHz);
    log('info', 'race.created', { race: this.id, lobby: opts.lobbyCode, track: opts.trackId, humans: this.humans().length, bots: this.racers.length - this.humans().length });
  }

  private humans(): Racer[] {
    return this.racers.filter((r) => !r.entry.isBot);
  }

  private async register(): Promise<boolean> {
    const authed = this.humans().filter((r) => r.client?.userId);
    if (!config.secret || authed.length === 0) return false;
    try {
      await internalCall('POST', '/api/internal/races', {
        uuid: this.id,
        lobby_code: this.opts.lobbyCode,
        track: this.opts.trackId,
        laps: this.opts.laps,
        players: this.racers.map((r) => ({
          slot: r.entry.slot,
          user_id: r.client?.userId ?? null,
          bot_name: r.client?.userId ? null : r.entry.isBot ? r.entry.name : `guest:${r.entry.name}`.slice(0, 24),
          vehicle: r.entry.vehicle,
          color: r.entry.color,
        })),
      });
      return true;
    } catch {
      return false;
    }
  }

  broadcast(msg: ServerMessage): void {
    for (const r of this.racers) r.client?.send(msg);
  }

  private racerFor(client: Client): Racer | undefined {
    return this.racers.find((r) => r.client === client);
  }

  onLoaded(client: Client): void {
    const r = this.racerFor(client);
    if (r) r.loaded = true;
  }

  onRespawn(client: Client): void {
    const r = this.racerFor(client);
    if (r) r.respawnPending = true;
  }

  onDisconnect(client: Client): void {
    const r = this.racerFor(client);
    if (!r) return;
    r.loaded = true;
    if (r.finishedAt === null) r.dnf = true;
    log('info', 'race.player_disconnected', { race: this.id, player: client.id });
  }

  private anomaly(r: Racer, a: Anomaly, severe: boolean): void {
    if (r.anomalies.length < 20) r.anomalies.push(a);
    if (severe) r.flagged = true;
    log('warn', 'anticheat.anomaly', { race: this.id, player: r.entry.id, kind: a.kind, detail: a.detail, severe });
  }

  /** Inbound position from a human. Validated before being trusted. */
  onState(client: Client, m: { x: unknown; y: unknown; z: unknown; h: unknown; v: unknown; f: unknown }): void {
    const r = this.racerFor(client);
    if (!r || r.dnf || this.phase !== 'racing') return;
    if (![m.x, m.y, m.z, m.h, m.v, m.f].every(isFiniteNumber) || Math.abs(m.x as number) > 1e4 || Math.abs(m.z as number) > 1e4 || Math.abs(m.y as number) > 500) {
      this.anomaly(r, { kind: 'payload', detail: 'invalid state payload', at: Date.now() }, false);
      return;
    }
    const now = Date.now();
    const next = { x: m.x as number, y: m.y as number, z: m.z as number, h: m.h as number, v: m.v as number, f: (m.f as number) | 0, t: now };
    r.stateCount++;

    if (r.respawnPending) {
      // A declared respawn may jump back to the last validated checkpoint area only.
      r.respawnPending = false;
      const anchor = this.path.pointAt(r.tracker.lastCheckpointS() + 6, 0);
      if (Math.hypot(anchor.x - next.x, anchor.z - next.z) > 30) this.anomaly(r, { kind: 'teleport', detail: 'respawn far from checkpoint', at: now }, true);
    } else {
      const a = checkMovement(r.entry.vehicle, r.state, next);
      if (a) {
        if (a.kind === 'teleport') this.anomaly(r, a, true);
        else if (++r.speedStrikes >= 5) this.anomaly(r, a, true);
        else this.anomaly(r, a, false);
      }
    }
    r.state = next;
    const proj = this.path.project(next.x, next.z, r.hint);
    r.hint = proj.index;
    if (Math.abs(proj.lateral) > this.path.barrierOffset(proj.s) + 8) {
      this.anomaly(r, { kind: 'off_track', detail: `lateral ${proj.lateral.toFixed(1)}`, at: now }, false);
    }
    this.trackProgress(r, proj.s, proj.lateral, now);
  }

  private raceTime(now: number): number {
    return (now - this.startAt) / 1000;
  }

  private trackProgress(r: Racer, s: number, lateral: number, now: number): void {
    for (const e of r.tracker.update(s, lateral, this.raceTime(now))) {
      if (e.type === 'skip') this.anomaly(r, { kind: 'checkpoint_skip', detail: `expected cp ${e.expected}`, at: now }, true);
      if (e.type === 'finish') {
        r.finishedAt = e.time;
        if (this.firstFinishAt === null && !r.entry.isBot) this.firstFinishAt = now;
        const position = rankRacers(this.rankEntries()).findIndex((x) => x.id === r.entry.id) + 1;
        this.broadcast({ t: 'race.finish', id: r.entry.id, position, time: e.time });
      }
    }
  }

  private rankEntries() {
    return this.racers.map((r) => ({ id: r.entry.id, progress: r.tracker.progress, finished: r.finishedAt !== null, finishTime: r.finishedAt, r }));
  }

  private tick(): void {
    const now = Date.now();
    this.tickCount++;
    if (this.phase === 'loading') {
      const allLoaded = this.racers.every((r) => r.loaded);
      if (allLoaded || now > this.loadDeadline) {
        this.phase = 'countdown';
        this.startAt = now + COUNTDOWN_MS + 500;
        this.broadcast({ t: 'race.countdown', startAt: this.startAt, serverTime: now });
      }
      return;
    }
    if (this.phase === 'countdown') {
      if (now >= this.startAt) this.phase = 'racing';
      return;
    }
    if (this.phase !== 'racing') return;

    this.simulateBots(now);
    if (this.tickCount % Math.round(config.tickHz / NET_SNAPSHOT_HZ) === 0 || NET_SNAPSHOT_HZ >= config.tickHz) this.sendSnapshot(now);
    if (this.tickCount % Math.round(config.tickHz / NET_STANDINGS_HZ) === 0) this.sendStandings(now);
    this.checkEnd(now);
  }

  private simulateBots(now: number): void {
    const dt = 1 / (config.tickHz * config.simSubsteps);
    this.obstacles.length = 0;
    for (const r of this.racers) {
      const radius = tunedVehicle(r.entry.vehicle).radius;
      const mass = tunedVehicle(r.entry.vehicle).mass;
      const vx = Math.sin(r.state.h) * r.state.v;
      const vz = Math.cos(r.state.h) * r.state.v;
      this.obstacles.push({ id: r.entry.id, x: r.state.x, y: r.state.y, z: r.state.z, vx, vz, radius, mass });
    }
    // Simple rubber band: bots slow slightly when far ahead of the best human, push when behind.
    const bestHuman = Math.max(0, ...this.humans().filter((h) => !h.dnf).map((h) => h.tracker.progress));
    for (const r of this.racers) {
      if (!r.bot) continue;
      const gap = r.tracker.progress - bestHuman;
      r.bot.pilot.pace = r.finishedAt !== null ? 0.75 : gap > 120 ? 0.93 : gap < -150 ? 1.06 : 1;
      for (let i = 0; i < config.simSubsteps; i++) {
        r.bot.vehicle.step(dt, r.bot.pilot.update(dt), this.obstacles);
        r.bot.vehicle.events.length = 0;
      }
      const st = r.bot.vehicle.state;
      let f = 0;
      if (st.boosting) f |= FLAG_BOOST;
      if (st.drifting) f |= FLAG_DRIFT;
      if (!st.grounded) f |= FLAG_AIR;
      r.state = { x: st.x, y: st.y, z: st.z, h: st.heading, v: st.speed, f, t: now };
      this.trackProgress(r, st.s, st.lateral, now);
    }
  }

  private sendSnapshot(now: number): void {
    const r: RacerStateDTO[] = this.racers.map((x) => ({
      id: x.entry.id,
      x: Math.round(x.state.x * 100) / 100,
      y: Math.round(x.state.y * 100) / 100,
      z: Math.round(x.state.z * 100) / 100,
      h: Math.round(x.state.h * 1000) / 1000,
      v: Math.round(x.state.v * 10) / 10,
      f: x.state.f,
    }));
    this.broadcast({ t: 'race.snapshot', s: now, r });
  }

  private sendStandings(now: number): void {
    const ranked = rankRacers(this.rankEntries());
    this.broadcast({
      t: 'race.standings',
      s: now,
      rows: ranked.map((x, i) => ({ id: x.id, position: i + 1, lap: x.r.tracker.lap, progress: Math.round(x.progress), finished: x.finished, time: x.finishTime })),
    });
  }

  private checkEnd(now: number): void {
    const humans = this.humans();
    const activeHumans = humans.filter((h) => !h.dnf && h.client?.connected);
    const allHumansDone = activeHumans.every((h) => h.finishedAt !== null);
    const graceOver = this.firstFinishAt !== null && now - this.firstFinishAt > FINISH_GRACE_MS;
    // Safety: hard cap on race duration.
    const tooLong = now - this.startAt > Math.max(600_000, this.opts.laps * 240_000);
    if (allHumansDone || graceOver || tooLong) {
      // Give bots a short moment to cross the line after the last human (natural ordering).
      if (allHumansDone && !graceOver && !tooLong && this.racers.some((r) => r.bot && r.finishedAt === null)) {
        if (!this.endHold) this.endHold = now;
        if (now - this.endHold < 4000) return;
      }
      void this.settle();
    }
  }

  private endHold: number | null = null;

  private async settle(): Promise<void> {
    if (this.phase !== 'racing') return;
    this.phase = 'settling';
    this.sendStandings(Date.now());
    let ranked = rankRacers(this.rankEntries());
    // Server-side plausibility on top of streaming checks.
    for (const x of ranked) {
      const r = x.r;
      const minLap = minimumLapTime(this.path, r.entry.vehicle);
      if (r.finishedAt !== null && r.tracker.lapTimes.some((l) => l < minLap)) this.anomaly(r, { kind: 'lap_time', detail: `lap < ${minLap.toFixed(1)}s`, at: Date.now() }, true);
      if (!r.entry.isBot && r.finishedAt !== null && r.stateCount < this.opts.laps * 40) this.anomaly(r, { kind: 'race_time', detail: `only ${r.stateCount} state updates`, at: Date.now() }, true);
    }
    // Disqualified (flagged) racers are classified after everyone else.
    ranked = [...ranked.filter((x) => !x.r.flagged), ...ranked.filter((x) => x.r.flagged)];
    const results: ResultDTO[] = ranked.map((x, i) => ({
      id: x.r.entry.id,
      name: x.r.entry.name,
      vehicle: x.r.entry.vehicle,
      color: x.r.entry.color,
      position: i + 1,
      time: x.r.finishedAt,
      bestLap: x.r.tracker.bestLap,
      finished: x.r.finishedAt !== null,
      isBot: x.r.entry.isBot,
      flagged: x.r.flagged,
      reward: null,
    }));

    let rewardsStatus: 'granted' | 'unavailable' | 'none' = 'none';
    const registered = await this.registered;
    if (registered) {
      try {
        const res = await internalCall<{ rewards: Record<string, RewardDTO & { flagged: boolean }> }>('POST', `/api/internal/races/${this.id}/finish`, {
          results: ranked.map((x, i) => ({
            slot: x.r.entry.slot,
            position: i + 1,
            finished: x.r.finishedAt !== null,
            time_ms: x.r.finishedAt !== null ? Math.round(x.r.finishedAt * 1000) : null,
            best_lap_ms: x.r.tracker.bestLap !== null ? Math.round(x.r.tracker.bestLap * 1000) : null,
            flagged: x.r.flagged,
            anomalies: x.r.anomalies.slice(0, 10).map((a) => ({ kind: a.kind, detail: a.detail.slice(0, 250) })),
          })),
        });
        for (const res0 of results) {
          const racer = this.racers.find((r) => r.entry.id === res0.id);
          const uid = racer?.client?.userId;
          if (uid && res.rewards[uid]) {
            const rw = res.rewards[uid];
            res0.reward = { xp: rw.xp, vmru: rw.vmru, levelBefore: rw.levelBefore, levelAfter: rw.levelAfter, xpTotal: rw.xpTotal, balance: rw.balance };
            res0.flagged = res0.flagged || rw.flagged;
          }
        }
        rewardsStatus = 'granted';
      } catch {
        rewardsStatus = 'unavailable';
      }
    } else if (this.humans().some((h) => h.client?.userId)) {
      rewardsStatus = 'unavailable';
    }
    this.broadcast({ t: 'race.results', raceId: this.id, results, rewards: rewardsStatus });
    log('info', 'race.settled', { race: this.id, rewards: rewardsStatus, winner: results[0]?.name });
    this.phase = 'done';
    this.dispose();
    this.opts.onDone(results);
  }

  /** Aborts when every human left. */
  abortIfEmpty(): boolean {
    if (this.humans().every((h) => !h.client?.connected || h.dnf)) {
      log('info', 'race.aborted', { race: this.id });
      this.phase = 'done';
      this.dispose();
      return true;
    }
    return false;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
