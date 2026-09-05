/* ------------------------------------------------------------------
   Pulls the current stock list from /api/products (which reads
   whatever the admin has saved). If that's not reachable — e.g. you're
   previewing index.html directly as a local file, with no server
   running — it quietly falls back to the bundled data already loaded
   from products.js, so the site still works.
   ------------------------------------------------------------------ */

(function () {
  async function loadProducts() {
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.products)) {
          window.PRODUCTS = data.products;
          if (data.genres && Object.keys(data.genres).length) {
            window.GENRE_LABELS = data.genres;
          }
        }
      }
    } catch (err) {
      // Offline or local file preview — bundled products.js data stays in place.
    }
    document.dispatchEvent(new Event("products-ready"));
  }
  loadProducts();
})();
