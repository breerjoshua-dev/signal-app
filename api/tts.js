import { rateLimit, securityHeaders } from './_rateLimit.js';

export default async function handler(req, res) {
  securityHeaders(res);

  if (rateLimit(req, res, 30)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.OPENAI_KEY;
  if (!key) {
    return res.status(500).json({ error: 'OpenAI key not configured' });
  }

  try {
    const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      return res.status(upstream.status).json({ error: err });
    }

    const buffer = await upstream.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(Buffer.from(buffer));
  } catch (err) {
    return res.status(502).json({ error: 'Upstream request failed: ' + err.message });
  }
}
