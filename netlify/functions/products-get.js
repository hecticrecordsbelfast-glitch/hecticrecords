/* ------------------------------------------------------------------
   Public, read-only. Returns the current stock list — either what
   the admin has saved (in Netlify Blobs), or the starter seed data
   if nothing has been saved yet.
   ------------------------------------------------------------------ */

const { getStore } = require("@netlify/blobs");
const seed = require("./seed-products.json");

exports.handler = async () => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };

  try {
    const store = getStore("hectic-store");
    const saved = await store.get("products", { type: "json" });
    if (saved && Array.isArray(saved.products)) {
      return { statusCode: 200, headers, body: JSON.stringify(saved) };
    }
  } catch (err) {
    // Blob store not reachable (e.g. very old CLI) — fall through to seed data.
  }

  return { statusCode: 200, headers, body: JSON.stringify(seed) };
};
