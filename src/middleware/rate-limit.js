// ─── Lightweight in-memory rate limiter ─────────────────────────────────────
// No external dependency. Fixed-window counter keyed by client IP + a per-route
// bucket name. Good enough to stop bot floods and abusive bursts on public
// endpoints (lead forms, reviews, signups). In-memory means per-process, which
// is fine for the current single-instance deploy; swap for Redis if we scale out.

const BUCKETS = new Map();   // key -> { count, resetAt }

// Best-effort real client IP behind Cloudflare / Render's proxy.
function clientIp(req) {
    return (req.headers['cf-connecting-ip']
        || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || req.socket?.remoteAddress
        || req.ip
        || 'unknown');
}

// Periodic cleanup so the Map can't grow unbounded.
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of BUCKETS) if (v.resetAt <= now) BUCKETS.delete(k);
}, 5 * 60 * 1000).unref?.();

// rateLimit({ windowMs, max, bucket, message }) → express middleware.
// windowMs: window length; max: allowed requests per IP per window.
function rateLimit({ windowMs = 10 * 60 * 1000, max = 10, bucket = 'default', message } = {}) {
    return (req, res, next) => {
        const now = Date.now();
        const key = `${bucket}:${clientIp(req)}`;
        let entry = BUCKETS.get(key);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            BUCKETS.set(key, entry);
        }
        entry.count++;
        const remaining = Math.max(0, max - entry.count);
        res.set('X-RateLimit-Limit', String(max));
        res.set('X-RateLimit-Remaining', String(remaining));
        if (entry.count > max) {
            const retry = Math.ceil((entry.resetAt - now) / 1000);
            res.set('Retry-After', String(retry));
            return res.status(429).json({
                error: message || 'Too many requests. Please wait a moment and try again.',
                retry_after_seconds: retry,
            });
        }
        next();
    };
}

module.exports = { rateLimit, clientIp };
