import { rateLimit, securityHeaders } from './_rateLimit.js';

export default async function handler(req, res) {
  securityHeaders(res);

  if (rateLimit(req, res, 10)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = process.env.GROQ_KEY;
  if (!key) {
    return res.status(500).json({ error: 'Groq key not configured' });
  }

  try {
    // Inject JSON-only instruction into the system message
    const body = { ...req.body };
    // Strip any response_format the client may have sent — rely on system prompt instead
    delete body.response_format;
    if (Array.isArray(body.messages)) {
      body.messages = body.messages.map(m =>
        m.role === 'system'
          ? { ...m, content: m.content + '\n\nYou must respond with only a valid JSON object. No markdown, no backticks, no explanation text before or after. Start your response with { and end with }.' }
          : m
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let upstream;
    try {
      upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await upstream.json();

    // Strip markdown fences then extract first { … last } from content
    const rawContent = data?.choices?.[0]?.message?.content;
    if (typeof rawContent === 'string') {
      let cleaned = rawContent.trim()
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      const first = cleaned.indexOf('{');
      const last  = cleaned.lastIndexOf('}');
      if (first !== -1 && last > first) {
        data.choices[0].message.content = cleaned.slice(first, last + 1);
      }
    }

    // Forward Groq rate-limit headers so client can compute exact retry delays
    const resetTokens   = upstream.headers.get('x-ratelimit-reset-tokens');
    const resetRequests = upstream.headers.get('x-ratelimit-reset-requests');
    const retryAfter    = upstream.headers.get('retry-after');
    if (resetTokens)   res.setHeader('x-ratelimit-reset-tokens',   resetTokens);
    if (resetRequests) res.setHeader('x-ratelimit-reset-requests', resetRequests);
    if (retryAfter)    res.setHeader('retry-after', retryAfter);

    return res.status(upstream.status).json(data);
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    return res.status(502).json({ error: isTimeout ? 'Groq request timed out after 30s' : 'Upstream request failed: ' + err.message });
  }
}
