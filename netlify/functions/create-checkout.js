/* ------------------------------------------------------------------
   Creates a Square-hosted checkout (Payment Link) from the cart sent
   by the browser, and returns its URL for the site to redirect to.

   Needs these environment variables set in your hosting dashboard
   (never commit real keys into this file):

     SQUARE_ACCESS_TOKEN   — from your Square Developer app
     SQUARE_LOCATION_ID    — the shop location the sale belongs to
     SQUARE_ENVIRONMENT    — "sandbox" while testing, "production" when live

   See README.md for where to get these.
   ------------------------------------------------------------------ */

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  const LOCATION_ID = process.env.SQUARE_LOCATION_ID;
  const ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
  const API_BASE = ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

  if (!ACCESS_TOKEN || !LOCATION_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Square isn't configured yet. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in your hosting dashboard.",
      }),
    };
  }

  let items;
  try {
    const parsed = JSON.parse(event.body || "{}");
    items = parsed.items;
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request body" }) };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Cart is empty" }) };
  }

  // Build Square line items. Prices come from the request but are
  // rounded to whole pence — swap this for a server-side price lookup
  // (e.g. re-reading js/products.js) once you're taking real payments,
  // so a tampered request can't change what's actually charged.
  const lineItems = items.map((item) => ({
    name: `${item.artist} — ${item.title}`.slice(0, 255),
    quantity: String(item.quantity),
    base_price_money: {
      amount: Math.round(item.price * 100),
      currency: "GBP",
    },
  }));

  const siteUrl = `https://${event.headers.host}`;

  const payload = {
    idempotency_key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    order: {
      location_id: LOCATION_ID,
      line_items: lineItems,
    },
    checkout_options: {
      redirect_url: `${siteUrl}/order-confirmed.html`,
    },
  };

  try {
    const response = await fetch(`${API_BASE}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Square-Version": "2024-10-17",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: data.errors?.[0]?.detail || "Square declined the request" }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: data.payment_link.url }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not reach Square" }) };
  }
};
