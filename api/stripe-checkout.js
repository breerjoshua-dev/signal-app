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

  const { priceId, userId, email, trial } = req.body || {};

  if (!priceId || !userId || !email) {
    return res.status(400).json({ error: 'Missing required fields: priceId, userId, email' });
  }

  // Resolve client-side placeholders to real Stripe price IDs from env vars
  const priceMap = {
    PRICE_MONTHLY: process.env.STRIPE_PRICE_ID_MONTHLY,
    PRICE_ANNUAL:  process.env.STRIPE_PRICE_ID_ANNUAL,
  };
  const resolvedPriceId = priceMap[priceId] || priceId;

  if (!resolvedPriceId || resolvedPriceId === priceId && priceId.startsWith('PRICE_')) {
    console.error('Stripe checkout: unresolved price placeholder:', priceId);
    return res.status(500).json({ error: 'Price ID env var not configured for: ' + priceId });
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
      success_url: `${CORS_ORIGIN}/?upgraded=true`,
      cancel_url:  `${CORS_ORIGIN}/?checkout=cancelled`,
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
