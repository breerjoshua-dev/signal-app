import { rateLimit, securityHeaders } from './_rateLimit.js';

export default async function handler(req, res) {
  securityHeaders(res);

  if (rateLimit(req, res, 30)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.PEXELS_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Pexels key not configured' });
  }

  const { query, per_page = '3', orientation = 'landscape', page = '1' } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  try {
    const params = new URLSearchParams({ query, per_page, orientation, page });
    const upstream = await fetch(`https://api.pexels.com/v1/search?${params}`, {
      headers: { Authorization: key },
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream request failed: ' + err.message });
  }
}
