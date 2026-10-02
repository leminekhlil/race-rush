import { describe, expect, it, vi } from 'vitest';
import { openMicrophone } from '../../client/src/net/voice/microphone';

describe('phone microphone capture', () => {
  it('requests default audio input without requiring a headset or a fixed device', async () => {
    const stream = {} as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    expect(await openMicrophone({ getUserMedia })).toBe(stream);
    const request = getUserMedia.mock.calls[0][0];
    expect(request.video).toBe(false);
    expect(request.audio.deviceId).toBeUndefined();
    expect(request.audio.echoCancellation).toEqual({ ideal: true });
  });
  it('falls back to ordinary audio capture when mobile processing constraints fail', async () => {
    const stream = {} as MediaStream;
    const getUserMedia = vi.fn().mockRejectedValueOnce({ name: 'OverconstrainedError' }).mockResolvedValueOnce(stream);
    expect(await openMicrophone({ getUserMedia })).toBe(stream);
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: true, video: false });
  });
  it('preserves permission refusal without retrying', async () => {
    const error = { name: 'NotAllowedError' };
    const getUserMedia = vi.fn().mockRejectedValue(error);
    await expect(openMicrophone({ getUserMedia })).rejects.toBe(error);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
