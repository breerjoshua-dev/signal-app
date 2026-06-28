import Stripe from 'stripe';
import { rateLimit, securityHeaders } from './_rateLimit.js';

const PRIMARY_ORIGIN = 'https://signaldaily.app';
const ALLOWED_ORIGINS = [
  'https://signaldaily.app',
  'https://www.signaldaily.app',
  'https://signal-app-gray-ten.vercel.app',
];

const ALLOWED_PRICE_KEYS = ['PRICE_MONTHLY', 'PRICE_ANNUAL'];

function corsHeaders(req, res) {
  const origin  = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : PRIMARY_ORIGIN;
  res.setHeader('Access-Control-Allow-Origin',  allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  securityHeaders(res);
  corsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (rateLimit(req, res, 5)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe key not configured' });
  }

  const { priceId, userId, email, trial } = req.body || {};

  if (!priceId || !userId || !email) {
    return res.status(400).json({ error: 'Missing required fields: priceId, userId, email' });
  }

  // Only accept the two known symbolic price keys — reject anything else
  if (!ALLOWED_PRICE_KEYS.includes(priceId)) {
    return res.status(400).json({ error: 'Invalid priceId' });
  }

  const priceMap = {
    PRICE_MONTHLY: process.env.STRIPE_PRICE_ID_MONTHLY,
    PRICE_ANNUAL:  process.env.STRIPE_PRICE_ID_ANNUAL,
  };
  const resolvedPriceId = priceMap[priceId];

  if (!resolvedPriceId) {
    console.error('Stripe checkout: price env var not set for:', priceId);
    return res.status(500).json({ error: 'Price not configured: ' + priceId });
  }

  try {
    const stripe = new Stripe(stripeKey);

    console.log('Creating Stripe session — priceId:', resolvedPriceId, 'userId:', userId);

    const sessionParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      customer_email: email,
      client_reference_id: userId,
      success_url: `${PRIMARY_ORIGIN}/?upgraded=true`,
      cancel_url:  `${PRIMARY_ORIGIN}/?checkout=cancelled`,
      metadata: {
        supabase_user_id: userId,
        price_id: resolvedPriceId,
      },
    };

    if (trial === true) {
      sessionParams.subscription_data = { trial_period_days: 7 };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error — message:', err.message, '— type:', err.type, '— param:', err.param);
    return res.status(500).json({ error: err.message });
  }
}
