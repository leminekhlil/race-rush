/** Coordinate iOS audio output with pending and active microphone capture. */
export class AudioSessionCoordinator {
  private captures = 0;

  constructor(private readonly session: () => { type: string } | undefined) {}

  refresh(): void {
    try {
      const session = this.session();
      if (session) session.type = this.captures > 0 ? 'play-and-record' : 'playback';
    } catch { /* The optional Audio Session API must not block audio on other browsers. */ }
  }

  acquireCapture(): () => void {
    this.captures++;
    this.refresh();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.captures--;
      this.refresh();
    };
  }
}
