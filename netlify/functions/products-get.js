/* ------------------------------------------------------------------
   Public, read-only. Returns the current stock list — either what
   the admin has saved (in Netlify Blobs), or the starter seed data
   if nothing has been saved yet.
   ------------------------------------------------------------------ */

const { getStore } = require("@netlify/blobs");
const seed = require("./seed-products.json");

// Netlify Blobs normally auto-detects its own credentials, but some
// site setups need them supplied explicitly — NETLIFY_BLOBS_TOKEN is
// a Personal Access Token you create in Netlify (see README), and
// SITE_ID is provided automatically by Netlify at runtime.
function getProductsStore() {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  if (token && siteID) {
    return getStore({ name: "hectic-store", siteID, token });
  }
  return getStore("hectic-store");
}

exports.handler = async () => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  try {
    const store = getProductsStore();
    const saved = await store.get("products", { type: "json" });
    if (saved && Array.isArray(saved.products)) {
      return { statusCode: 200, headers, body: JSON.stringify(saved) };
    }
  } catch (err) {
    // Blob store not reachable (e.g. very old CLI) — fall through to seed data.
  }

  return { statusCode: 200, headers, body: JSON.stringify(seed) };
};
