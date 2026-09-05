/* ------------------------------------------------------------------
   Creates a Square-hosted checkout (Payment Link) from the cart sent
   by the browser, and returns its URL for the site to redirect to.

   Looks up current price AND stock from the live product data (not
   whatever the browser sends) so a tampered request can't change
   what's charged, and so a nearly-sold-out item can't be oversold.

   Needs these environment variables set in your hosting dashboard
   (never commit real keys into this file):

     SQUARE_ACCESS_TOKEN   — from your Square Developer app
     SQUARE_LOCATION_ID    — the shop location the sale belongs to
     SQUARE_ENVIRONMENT    — "sandbox" while testing, "production" when live
     NETLIFY_BLOBS_TOKEN / SITE_ID — only needed if your site requires
       manual Blobs configuration (see README)

   See README.md for where to get these.
   ------------------------------------------------------------------ */

const { getStore } = require("@netlify/blobs");
const seed = require("./seed-products.json");

function getProductsStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  if (token && siteID) {
    return getStore({ name: "hectic-store", siteID, token });
  }
  return getStore("hectic-store");
}

async function getLiveProducts() {
  try {
    const store = getProductsStore();
    const saved = await store.get("products", { type: "json" });
    if (saved && Array.isArray(saved.products)) return saved.products;
  } catch (err) {
    // fall through to seed data
  }
  return seed.products;
}

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

  let requestedItems;
  try {
    const parsed = JSON.parse(event.body || "{}");
    requestedItems = parsed.items;
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request body" }) };
  }

  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Cart is empty" }) };
  }

  const liveProducts = await getLiveProducts();

  const lineItems = [];
  for (const requested of requestedItems) {
    const product = liveProducts.find((p) => p.id === requested.id);
    if (!product) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: `One item in your bag is no longer available. Please refresh your bag and try again.` }) };
    }
    const quantity = Math.max(1, parseInt(requested.quantity, 10) || 1);
    if (typeof product.stock === "number" && product.stock < quantity) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          error: product.stock <= 0
            ? `Sorry, "${product.artist} — ${product.title}" just sold out.`
            : `Only ${product.stock} left of "${product.artist} — ${product.title}" — please lower the quantity in your bag.`,
        }),
      };
    }
    lineItems.push({
      name: `${product.artist} — ${product.title}`.slice(0, 255),
      quantity: String(quantity),
      base_price_money: {
        amount: Math.round(product.price * 100),
        currency: "GBP",
      },
      note: product.id,
    });
  }

  const siteUrl = `https://${event.headers.host}`;

  const payload = {
    idempotency_key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    order: {
      location_id: LOCATION_ID,
      line_items: lineItems,
    },
    checkout_options: {
      redirect_url: `${siteUrl}/order-confirmed.html`,
      ask_for_shipping_address: true,
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
