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

  try {
    const stripe = new Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      customer_email: email,
      client_reference_id: userId,
      success_url: `${CORS_ORIGIN}/?upgraded=true`,
      cancel_url:  `${CORS_ORIGIN}/?checkout=cancelled`,
      metadata: {
        supabase_user_id: userId,
        price_id: priceId,
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
