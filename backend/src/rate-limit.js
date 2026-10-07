class RateLimiter {
  constructor(now = Date.now) {
    this.now = now;
    this.buckets = new Map();
  }

  take(key, capacity, perSecond, cost = 1) {
    const now = this.now();
    const bucket = this.buckets.get(key) || { tokens: capacity, at: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.at) * perSecond / 1000);
    bucket.at = now;
    this.buckets.set(key, bucket);
    if (bucket.tokens < cost) return false;
    bucket.tokens -= cost;
    return true;
  }

  prune(ageMs = 600000) {
    const before = this.now() - ageMs;
    for (const [key, bucket] of this.buckets) {
      if (bucket.at < before) this.buckets.delete(key);
    }
  }
}

module.exports = { RateLimiter };
