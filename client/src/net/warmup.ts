/** Wake an idle cloud service only when the player explicitly starts an online session. */
export async function warmRealtime(wsUrl: string, fetcher: typeof fetch = fetch, timeoutMs = 120000): Promise<void> {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/health';
  url.search = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetcher(url.href, { cache: 'no-store', signal: AbortSignal.timeout(Math.min(12000, deadline - Date.now())) });
      if (response.ok && (await response.json()).ok === true) return;
    } catch { /* Sleeping services can initially return a loading page or a network error. */ }
    if (Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, Math.min(1000, deadline - Date.now())));
  }
  throw new Error('realtime wake-up timeout');
}
