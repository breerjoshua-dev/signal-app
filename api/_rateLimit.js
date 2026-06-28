// Shared in-memory rate limiter and security headers helper.
// Files prefixed with _ are not deployed as Vercel API endpoints.

const windows = new Map();

// Prune stale entries every 5 minutes to prevent unbounded growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) {
    if (now > entry.resetAt) windows.delete(key);
  }
}, 300_000);

/**
 * Returns true and sends a 429 if the IP has exceeded maxPerMinute.
 * Returns false if the request is allowed.
 */
export function rateLimit(req, res, maxPerMinute) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';
  const now = Date.now();

  let entry = windows.get(ip);
  if (!entry || now > entry.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  entry.count++;
  if (entry.count > maxPerMinute) {
    res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
    res.status(429).json({ error: 'Too many requests' });
    return true;
  }

  return false;
}

export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}
