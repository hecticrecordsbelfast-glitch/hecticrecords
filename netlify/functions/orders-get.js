/* ------------------------------------------------------------------
   Password-protected. Returns the list of recorded orders (newest
   first) for the /orders.html staff page.
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  const suppliedPassword = event.headers["x-admin-password"] || event.headers["X-Admin-Password"];
  if (!ADMIN_PASSWORD || suppliedPassword !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Wrong password" }) };
  }

  try {
    const store = getOrdersStore();
    const index = (await store.get("_index", { type: "json" }).catch(() => null)) || { orderIds: [] };
    const orders = [];
    for (const id of index.orderIds) {
      const order = await store.get(id, { type: "json" }).catch(() => null);
      if (order) orders.push(order);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ orders }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not load orders: " + err.message }) };
  }
};
