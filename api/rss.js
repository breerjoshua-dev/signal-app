import { rateLimit, securityHeaders } from './_rateLimit.js';

// Block requests to private/loopback IP ranges (SSRF protection)
function isPrivateHost(hostname) {
  return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|0\.0\.0\.0)/.test(hostname);
}

export default async function handler(req, res) {
  securityHeaders(res);

  if (rateLimit(req, res, 60)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let feedUrl;
  try {
    feedUrl = decodeURIComponent(url);
    const parsed = new URL(feedUrl);
    if (parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only HTTPS feed URLs are allowed' });
    }
    if (isPrivateHost(parsed.hostname)) {
      return res.status(400).json({ error: 'Private URLs are not allowed' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const upstream = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Signal/1.0; +https://signaldaily.app)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: `Feed returned ${upstream.status}` });
    }

    const text = await upstream.text();
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return res.status(200).send(text);
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return res.status(502).json({
      error: isTimeout ? 'Feed fetch timed out' : 'Feed fetch failed: ' + err.message,
    });
  } finally {
    clearTimeout(timeout);
  }
}
