/* ------------------------------------------------------------------
   Password-protected. Saves the full stock list sent from admin.html
   into Netlify Blobs, so it's live on the site immediately.

   Needs ADMIN_PASSWORD set as an environment variable in your hosting
   dashboard — see README.md.
   ------------------------------------------------------------------ */

const { getStore } = require("@netlify/blobs");

function getProductsStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  if (token && siteID) {
    return getStore({ name: "hectic-store", siteID, token });
  }
  return getStore("hectic-store");
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
  if (!ADMIN_PASSWORD) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Admin editing isn't set up yet — ADMIN_PASSWORD needs to be set in your hosting dashboard." }),
    };
  }

  const suppliedPassword = event.headers["x-admin-password"] || event.headers["X-Admin-Password"];
  if (suppliedPassword !== ADMIN_PASSWORD) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Wrong password" }) };
  }

  if (event.body && event.body.length > 6 * 1024 * 1024) {
    return { statusCode: 413, headers, body: JSON.stringify({ error: "That save is too large (likely too many uploaded photos at once) — try saving in smaller batches." }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Bad request body" }) };
  }

  if (!Array.isArray(payload.products)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing products list" }) };
  }

  // Basic sanity checks so a slip in the form can't corrupt the store.
  for (const p of payload.products) {
    if (!p.id || !p.artist || !p.title || typeof p.price !== "number" || !p.genre) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `Every record needs an ID, artist, title, price and genre. Check "${p.title || p.id || "an unnamed record"}".` }) };
    }
  }

  const dataToSave = {
    genres: payload.genres || {},
    products: payload.products,
  };

  try {
    const store = getProductsStore();
    await store.setJSON("products", dataToSave);
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not save to storage: " + err.message }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
