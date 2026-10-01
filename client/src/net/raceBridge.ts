import type { RaceSession } from '../game/race/RaceSession';

/**
 * Routes realtime race messages to the active RaceSession. Buffers the countdown if it arrives
 * before the session finished mounting.
 */
class RaceBridge {
  session: RaceSession | null = null;
  quitHandler: (() => void) | null = null;
  private pendingCountdown: number | null = null;

  attachSession(s: RaceSession | null): void {
    this.session = s;
  }

  /** Called by the session once its scene is ready. */
  sessionReady(s: RaceSession): void {
    if (this.session === s && this.pendingCountdown !== null) {
      s.onCountdown(this.pendingCountdown);
      this.pendingCountdown = null;
    }
  }

  countdown(startAt: number): void {
    if (this.session?.isLoaded) this.session.onCountdown(startAt);
    else this.pendingCountdown = startAt;
  }

  reset(): void {
    this.pendingCountdown = null;
  }

  quitRace(): void {
    this.quitHandler?.();
  }
}

export const netBridge = new RaceBridge();
