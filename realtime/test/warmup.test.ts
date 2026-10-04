import { afterEach, describe, expect, it, vi } from 'vitest';
import { warmRealtime } from '../../client/src/net/warmup';
afterEach(() => vi.useRealTimers());
describe('user initiated cloud warm-up', () => {
  it('waits through a sleeping-service page before starting an online session', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new Error('loading HTML'); } })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    const ready = warmRealtime('wss://example.onrender.com/ws', fetcher);
    await vi.runAllTimersAsync(); await ready;
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0][0]).toBe('https://example.onrender.com/health');
  });
  it('fails after a bounded timeout rather than polling indefinitely', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue({ ok: false });
    const expectation = expect(warmRealtime('wss://example.onrender.com/ws', fetcher, 3000)).rejects.toThrow('wake-up timeout');
    await vi.runAllTimersAsync(); await expectation;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
