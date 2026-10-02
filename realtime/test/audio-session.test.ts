import { describe, expect, it, vi } from 'vitest';
import { AudioSessionCoordinator } from '../../client/src/game/audio/AudioSession';
import { openMicrophone } from '../../client/src/net/voice/microphone';

describe('iOS playback and microphone session', () => {
  it('allows native capture from a playback session and keeps it compatible across audio unlocks', async () => {
    const session = { type: 'playback' };
    const audio = new AudioSessionCoordinator(() => session);
    const stream = { getAudioTracks: () => [] } as unknown as MediaStream;
    // Model WebKit rejecting capture before even asking permission if playback is forced.
    const getUserMedia = vi.fn(() => session.type === 'playback'
      ? Promise.reject({ name: 'InvalidStateError' }) : Promise.resolve(stream));
    await expect(openMicrophone({ getUserMedia })).rejects.toMatchObject({ name: 'InvalidStateError' });
    const release = audio.acquireCapture();
    audio.refresh(); // A subsequent gesture/audio unlock cannot revert the session.
    expect(session.type).toBe('play-and-record');
    expect(await openMicrophone({ getUserMedia })).toBe(stream);
    audio.refresh();
    expect(session.type).toBe('play-and-record');
    release();
    expect(session.type).toBe('playback');
  });

  it('does not let a cancelled permission request reset a newer active capture', () => {
    const session = { type: 'playback' };
    const audio = new AudioSessionCoordinator(() => session);
    const oldRequest = audio.acquireCapture();
    oldRequest();
    const newRequest = audio.acquireCapture();
    oldRequest(); // Late rejection/resolution cleanup must be idempotent.
    expect(session.type).toBe('play-and-record');
    newRequest();
    expect(session.type).toBe('playback');
  });

  it('keeps capture mode until every capture lease is released', () => {
    const session = { type: 'playback' };
    const audio = new AudioSessionCoordinator(() => session);
    const first = audio.acquireCapture();
    const second = audio.acquireCapture();
    first();
    expect(session.type).toBe('play-and-record');
    second();
    expect(session.type).toBe('playback');
  });

  it('works when the optional browser API is missing or refuses configuration', () => {
    for (const session of [() => undefined, () => { throw new Error('unsupported'); }]) {
      const audio = new AudioSessionCoordinator(session);
      expect(() => { const release = audio.acquireCapture(); audio.refresh(); release(); }).not.toThrow();
    }
  });
});
