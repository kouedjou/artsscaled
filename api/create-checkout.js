// /api/create-checkout.js - Vercel Serverless Function for Arts Scaled donations
// No npm install needed. Uses Stripe API directly via fetch.
// REQUIRED: Set STRIPE_SECRET_KEY in Vercel -> Project -> Settings -> Environment Variables
// Use sk_test_... to test, sk_live_... when you go live. Redeploy after adding it.

const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP']);

module.exports = async (req, res) => {
  // CORS - allow your site to call it
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const amount = parseInt(body.amount, 10);
    const currency = String(body.currency || 'EUR').toUpperCase();

    // Validation - matches the frontend: minimum 10, no conversion
    if (!amount || isNaN(amount) || amount < 10) {
      return res.status(400).json({ error: 'Amount must be at least 10' });
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      return res.status(400).json({ error: 'Invalid currency' });
    }

    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return res.status(500).json({ error: 'STRIPE_SECRET_KEY is not set in Vercel Environment Variables' });
    }

    // Stripe expects amount in smallest unit: cents for EUR/USD/GBP, whole units for JPY/KRW
    const unitAmount = ZERO_DECIMAL.has(currency) ? amount : amount * 100;

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', origin + '/?donation=success');
    params.append('cancel_url', origin + '/?donation=cancelled');
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', currency.toLowerCase());
    params.append('line_items[0][price_data][unit_amount]', String(unitAmount));
    params.append('line_items[0][price_data][product_data][name]', 'Donation to Arts Scaled - Keep the Calculator Alive');
    params.append('line_items[0][price_data][product_data][description]', 'One-time donation to keep the Arts Scaled calculator free for artists.');
    params.append('metadata[amount]', String(amount));
    params.append('metadata[currency]', currency);
    params.append('metadata[source]', 'artsscaled.com donation slider');

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secret,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error('Stripe error:', data);
      return res.status(400).json({ error: data.error?.message || 'Stripe error' });
    }

    return res.status(200).json({ url: data.url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error creating checkout' });
  }
};
