/* ------------------------------------------------------------------
   Hectic Records — site logic
   Cart is stored in the browser (localStorage), so it's real and
   working, but this alone can't take payments — see README.
   ------------------------------------------------------------------ */

const CART_KEY = "hectic_cart_v1";

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

function addToCart(id, qty = 1) {
  const cart = getCart();
  cart[id] = (cart[id] || 0) + qty;
  saveCart(cart);
  flashCartIcon();
}

function removeFromCart(id) {
  const cart = getCart();
  delete cart[id];
  saveCart(cart);
}

function setQty(id, qty) {
  const cart = getCart();
  qty = Math.max(0, parseInt(qty, 10) || 0);
  if (qty === 0) {
    delete cart[id];
  } else {
    cart[id] = qty;
  }
  saveCart(cart);
}

function cartCount() {
  const cart = getCart();
  return Object.values(cart).reduce((sum, n) => sum + n, 0);
}

function updateCartCount() {
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = cartCount();
  });
}

function flashCartIcon() {
  document.querySelectorAll("[data-cart-icon]").forEach((el) => {
    el.classList.add("cart-icon--bump");
    setTimeout(() => el.classList.remove("cart-icon--bump"), 350);
  });
}

function findProduct(id) {
  return PRODUCTS.find((p) => p.id === id);
}

function money(n) {
  return "£" + n.toFixed(2);
}

/* ---------- Sleeve card (the record-crate visual signature) ---------- */

function sleeveCardHTML(product) {
  const badge = product.tags.includes("pre-order")
    ? '<span class="badge badge--preorder">Pre-Order</span>'
    : product.tags.includes("new-in")
    ? '<span class="badge badge--new">New In</span>'
    : "";

  return `
    <article class="sleeve-card" data-genre="${product.genre}" data-tags="${product.tags.join(",")}">
      <a href="product.html?id=${product.id}" class="sleeve" data-accent="${product.accent}">
        <span class="sleeve__vinyl" aria-hidden="true"></span>
        <span class="sleeve__face" ${product.image ? `style="background-image:url('${product.image}');"` : ""}>
          ${badge}
          <span class="sleeve__format">${product.format}</span>
        </span>
      </a>
      <div class="sleeve-card__meta">
        <a href="product.html?id=${product.id}" class="sleeve-card__title">
          <strong>${product.artist}</strong>
          <span>${product.title}</span>
        </a>
        <div class="sleeve-card__row">
          <span class="sleeve-card__price">${money(product.price)}</span>
          <button class="btn-add" data-add="${product.id}" aria-label="Add ${product.artist} — ${product.title} to bag">+ Bag</button>
        </div>
      </div>
    </article>
  `;
}

function renderGrid(container, products) {
  if (!container) return;
  if (products.length === 0) {
    container.innerHTML = `<p class="empty-note">No records match that filter yet — try another crate.</p>`;
    return;
  }
  container.innerHTML = products.map(sleeveCardHTML).join("");
  container.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      addToCart(btn.getAttribute("data-add"), 1);
      btn.textContent = "Added ✓";
      setTimeout(() => (btn.textContent = "+ Bag"), 900);
    });
  });
}

/* ---------- Mobile nav ---------- */

document.addEventListener("DOMContentLoaded", () => {
  updateCartCount();

  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav-menu]");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open);
    });
  }
});
