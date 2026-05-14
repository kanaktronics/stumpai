/**
 * RATE LIMITER — IP-based sliding window
 *
 * Prevents API quota drain from bots/spam.
 * Uses in-memory store per Vercel instance (good enough for hackathon).
 * For production: swap the Map for Upstash Redis.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

// In-memory store: IP → { count, resetAt }
const store = new Map<string, WindowEntry>();

const WINDOW_MS   = 60_000; // 1 minute window
const MAX_REQUESTS = 20;    // max 20 oracle calls per IP per minute

// Periodically evict stale entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}, WINDOW_MS * 2);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  let entry = store.get(ip);

  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    store.set(ip, entry);
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt: entry.resetAt };
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: MAX_REQUESTS - entry.count, resetAt: entry.resetAt };
}
