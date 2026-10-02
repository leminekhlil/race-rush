import { describe, expect, it, vi } from 'vitest';
import { microphoneError, openMicrophone } from '../../client/src/net/voice/microphone';

const makeStream = (track: object = {}) => ({ getAudioTracks: () => [track] }) as unknown as MediaStream;

describe('native mobile microphone permission', () => {
  it('calls capture synchronously with audio only, before any optional processing', async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const stream = makeStream({ applyConstraints });
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const permission = openMicrophone({ getUserMedia });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(applyConstraints).not.toHaveBeenCalled();
    expect(await permission).toBe(stream);
    expect(applyConstraints).toHaveBeenCalledTimes(1);
  });
  it('keeps capture working if iOS cannot apply optional processing', async () => {
    const stream = makeStream({ applyConstraints: vi.fn().mockRejectedValue({ name: 'OverconstrainedError' }) });
    expect(await openMicrophone({ getUserMedia: vi.fn().mockResolvedValue(stream) })).toBe(stream);
  });
  it('keeps capture working if processing is absent or throws synchronously', async () => {
    for (const track of [{}, { applyConstraints: () => { throw new Error('unsupported'); } }]) {
      const stream = makeStream(track);
      expect(await openMicrophone({ getUserMedia: vi.fn().mockResolvedValue(stream) })).toBe(stream);
    }
  });
  it('preserves permission refusal without retrying', async () => {
    const error = { name: 'NotAllowedError' };
    const getUserMedia = vi.fn().mockRejectedValue(error);
    await expect(openMicrophone({ getUserMedia })).rejects.toBe(error);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(microphoneError(error).message).toContain('Réglages');
  });
  it('shows an identifiable safe error instead of hiding the browser failure', () => {
    expect(microphoneError({ name: 'InvalidStateError' }).message).toContain('premier plan');
    expect(microphoneError({ name: 'TypeError' }).message).toContain('TypeError');
    expect(microphoneError({ name: '<private error text>' }).name).toBe('UnknownError');
  });
});
