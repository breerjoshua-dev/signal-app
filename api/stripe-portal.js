import Stripe from 'stripe';

const CORS_ORIGIN = 'https://signal-app-gray-ten.vercel.app';

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe key not configured' });
  }

  const { customerId } = req.body || {};
  if (!customerId) {
    return res.status(400).json({ error: 'Missing customerId' });
  }

  try {
    const stripe = new Stripe(stripeKey);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${CORS_ORIGIN}/profile`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('Stripe portal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
