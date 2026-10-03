import { tooMany } from './errors';

// Pembatas laju sederhana di memori proses (jendela geser). Cukup untuk satu instance;
// untuk beberapa instance di belakang load balancer, pasang pembatas di reverse proxy juga.
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    throw tooMany();
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
}

export function resetRateLimits() {
  buckets.clear();
}
