export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminToken = process.env.ADMIN_TOKEN;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = 'https://nvipamvkqkrgakvzvxwp.supabase.co';

  if (!adminToken || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const provided = req.headers['x-admin-token'];
  if (!provided || provided !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const upstream = await fetch(`${supabaseUrl}/rest/v1/profiles?select=*&order=created_at.desc`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
      },
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      return res.status(upstream.status).json({ error: 'Supabase error: ' + err });
    }

    const profiles = await upstream.json();

    // Also fetch auth users to get emails (service role only)
    const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, {
      headers: {
        'apikey': serviceKey,
        'Authorization': 'Bearer ' + serviceKey,
      },
    });

    let emailMap = {};
    if (authRes.ok) {
      const authData = await authRes.json();
      const users = authData.users || [];
      users.forEach(u => { emailMap[u.id] = u.email; });
    }

    const enriched = profiles.map(p => ({
      ...p,
      email: emailMap[p.id] || null,
    }));

    return res.status(200).json({ profiles: enriched });
  } catch (err) {
    return res.status(502).json({ error: 'Failed: ' + err.message });
  }
}
