import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function supabaseUpdate(path, body) {
  const url    = process.env.SUPABASE_URL;
  const key    = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res    = await fetch(`${url}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase PATCH failed: ${res.status} ${text}`);
  }
}

async function supabaseSelect(filter) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/profiles?${filter}&select=id`, {
    headers: {
      'apikey':        key,
      'Authorization': `Bearer ${key}`,
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.id || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey    = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    return res.status(500).json({ error: 'Stripe env vars not configured' });
  }

  const stripe = new Stripe(stripeKey);

  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Could not read request body' });
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session   = event.data.object;
        const userId    = session.metadata?.supabase_user_id;
        const priceId   = session.metadata?.price_id;
        const customerId = session.customer;
        const subId      = session.subscription;

        if (!userId) { console.warn('checkout.session.completed: no supabase_user_id'); break; }

        const plan = priceId === process.env.STRIPE_PRICE_ID_ANNUAL ? 'annual' : 'pro';

        await supabaseUpdate(`profiles?id=eq.${userId}`, {
          plan,
          stripe_customer_id:      customerId || null,
          stripe_subscription_id:  subId      || null,
        });
        console.log(`checkout.session.completed: userId=${userId} plan=${plan}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub        = event.data.object;
        const customerId = sub.customer;

        const userId = await supabaseSelect(`stripe_customer_id=eq.${customerId}`);
        if (!userId) { console.warn('subscription.deleted: no profile found for customer', customerId); break; }

        await supabaseUpdate(`profiles?id=eq.${userId}`, {
          plan:                   'free',
          stripe_subscription_id: null,
        });
        console.log(`subscription.deleted: userId=${userId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub        = event.data.object;
        const customerId = sub.customer;
        const status     = sub.status;

        if (status === 'active' || status === 'trialing') break; // no change needed

        if (status === 'past_due' || status === 'unpaid' || status === 'canceled') {
          const userId = await supabaseSelect(`stripe_customer_id=eq.${customerId}`);
          if (!userId) { console.warn('subscription.updated: no profile found for customer', customerId); break; }
          await supabaseUpdate(`profiles?id=eq.${userId}`, { plan: 'free' });
          console.log(`subscription.updated: userId=${userId} status=${status} → plan=free`);
        }
        break;
      }

      default:
        // Unhandled event type — acknowledged but ignored
        break;
    }
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    // Return 200 anyway so Stripe doesn't retry — log the error for investigation
  }

  return res.status(200).json({ received: true });
}
