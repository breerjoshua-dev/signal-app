import Stripe from 'stripe';

const PRIMARY_ORIGIN = 'https://signaldaily.app';
const ALLOWED_ORIGINS = [
  'https://signaldaily.app',
  'https://www.signaldaily.app',
  'https://signal-app-gray-ten.vercel.app',
];

function corsHeaders(req, res) {
  const origin  = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : PRIMARY_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin',  allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  corsHeaders(req, res);

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
      return_url: `${PRIMARY_ORIGIN}/profile`,
    });

    return res.status(200).json({ url: portalSession.url });
  } catch (err) {
    console.error('Stripe portal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
