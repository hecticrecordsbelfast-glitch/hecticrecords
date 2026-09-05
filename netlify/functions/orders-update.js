/* ------------------------------------------------------------------
   Password-protected. Toggles an order's fulfilled status from the
   /orders.html staff page.
   ------------------------------------------------------------------ */

const { getStore } = require("@netlify/blobs");

function getOrdersStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  if (token && siteID) {
    return getStore({ name: "hectic-orders", siteID, token });
  }
  return getStore("hectic-orders");
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const suppliedPassword = event.headers["x-admin-password"] || event.headers["X-Admin-Password"];
  if (!ADMIN_PASSWORD || suppliedPassword !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Wrong password" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request body" }) };
  }

  if (!payload.orderId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing orderId" }) };
  }

  try {
    const store = getOrdersStore();
    const order = await store.get(payload.orderId, { type: "json" });
    if (!order) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Order not found" }) };
    }
    order.fulfilled = !!payload.fulfilled;
    await store.setJSON(payload.orderId, order);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not update order: " + err.message }) };
  }
};
