export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GROQ_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Groq key not configured' });
  }

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();

    // Forward Groq's rate-limit reset headers so the client can compute exact retry delays
    const resetTokens   = upstream.headers.get('x-ratelimit-reset-tokens');
    const resetRequests = upstream.headers.get('x-ratelimit-reset-requests');
    const retryAfter    = upstream.headers.get('retry-after');
    if (resetTokens)   res.setHeader('x-ratelimit-reset-tokens',   resetTokens);
    if (resetRequests) res.setHeader('x-ratelimit-reset-requests', resetRequests);
    if (retryAfter)    res.setHeader('retry-after', retryAfter);

    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Upstream request failed: ' + err.message });
  }
}
