const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Development only: local OS access, same-origin requests and bounded process quota.
 * Not a production login or durable spending policy. Never attach to the deployed route.
 */
export function createLocalAssistantAccess({ port = 5173, now = Date.now, windowMs = 600000, windowLimit = 10, sessionLimit = 40, detailed = false } = {}) {
  let started = now(), count = 0, total = 0;
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const denied = (status = 403, retryAfter = null) => detailed ? { allowed: false, status, retryAfter } : false;
  return req => {
    if (!LOOPBACK.has(req.socket?.remoteAddress) || !hosts.has(req.headers?.host)) return denied();
    if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') return denied();
    try {
      const origin = new URL(req.headers.origin);
      if (origin.protocol !== 'http:' || origin.host !== req.headers.host || origin.origin !== req.headers.origin) return denied();
    } catch { return denied(); }
    const time = now();
    if (time - started >= windowMs) { started = time; count = 0; }
    if (total >= sessionLimit) return denied(429);
    if (count >= windowLimit) return denied(429, Math.max(1, Math.ceil((started + windowMs - time) / 1000)));
    count++; total++;
    return true;
  };
}
