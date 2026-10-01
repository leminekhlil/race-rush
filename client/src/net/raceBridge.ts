import type { RaceSession } from '../game/race/RaceSession';

/**
 * Routes realtime race messages to the active RaceSession (filled in by the realtime client).
 */
class RaceBridge {
  session: RaceSession | null = null;
  quitHandler: (() => void) | null = null;

  attachSession(s: RaceSession | null): void {
    this.session = s;
  }

  quitRace(): void {
    this.quitHandler?.();
  }
}

export const netBridge = new RaceBridge();
