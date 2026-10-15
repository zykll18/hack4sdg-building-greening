import { createHash, timingSafeEqual } from 'node:crypto';

// One atomic reservation shared by all Function instances. Failed AI calls also
// consume a reservation: upstream failure does not prove that no tokens were billed.
export const RESERVE_QUOTA = `
local time = redis.call('TIME')
local now = tonumber(time[1])
local minute = math.floor(now / 60)
local day = math.floor(now / 86400)
local mk = KEYS[1] .. ':minute:' .. minute
local dk = KEYS[1] .. ':day:' .. day
if tonumber(redis.call('GET', dk) or '0') >= tonumber(ARGV[2]) then return {0, 86400 - now % 86400} end
if tonumber(redis.call('GET', mk) or '0') >= tonumber(ARGV[1]) then return {0, 60 - now % 60} end
redis.call('INCR', mk)
redis.call('EXPIRE', mk, 120)
redis.call('INCR', dk)
redis.call('EXPIRE', dk, 172800)
return {1, 0}
`;
const digest = value => createHash('sha256').update(value).digest();
const limit = (value, fallback, max) => value === undefined || value === '' ? fallback : /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= max ? Number(value) : null;

/** Shared demo access code, not individual user accounts. No browser provider key. */
export function createProductionAssistantAccess({ env = process.env, fetcher = fetch } = {}) {
  const code = env.AI_DEMO_ACCESS_CODE;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const minuteLimit = limit(env.AI_REQUESTS_PER_MINUTE, 3, 20);
  const dailyLimit = limit(env.AI_REQUESTS_PER_DAY, 20, 1000);
  let endpoint;
  try {
    endpoint = new URL(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL);
    if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.upstash.io') || endpoint.username || endpoint.password || endpoint.port || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) return null;
  } catch { return null; }
  if (typeof code !== 'string' || code.length < 24 || code.length > 256 || !token || !minuteLimit || !dailyLimit) return null;
  const expected = digest(code);
  return async req => {
    const provided = req.headers?.['x-ai-access-code'];
    if (typeof provided !== 'string' || provided.length > 256 || !timingSafeEqual(expected, digest(provided))) return { allowed: false, status: 403 };
    try {
      const response = await fetcher(endpoint.origin, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(4000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['EVAL', RESERVE_QUOTA, 1, 'building-greening:assistant:v1', minuteLimit, dailyLimit]),
      });
      if (!response.ok) return { allowed: false, status: 503 };
      const data = await response.json();
      if (data.error || !Array.isArray(data.result) || data.result.length !== 2) return { allowed: false, status: 503 };
      const [allowed, retryAfter] = data.result;
      if (allowed === 1 && retryAfter === 0) return { allowed: true };
      if (allowed === 0 && Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 86400) return { allowed: false, status: 429, retryAfter };
    } catch { /* Storage failures never permit provider calls or expose credentials. */ }
    return { allowed: false, status: 503 };
  };
}
