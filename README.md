# Hectic Records — Custom Website

A standalone, hand-coded website (no Shopify, no build tools) for Hectic
Records, Belfast. Plain HTML/CSS/JS — open `index.html` in a browser and
it works.

## What's in here

- `index.html` — homepage: hero, New In, Pre-Orders, genre grid, We Buy
  Records, visit info
- `shop.html` — all records, with crate-style filter tabs (All / New In /
  Pre-Orders / each genre) and a live search box
- `product.html` — single record page (reads `?id=` from the URL)
- `cart.html` — your bag: quantities, removal, subtotal, checkout
- `contact.html` — address, hours, phone, email, embedded map
- `css/style.css` — all styling
- `js/products.js` — your product data (see below)
- `js/main.js` — cart logic and card rendering, shared across pages

## Square checkout

The cart page has a **Pay with Square** button. It sends your bag's
contents to a small serverless function (`netlify/functions/create-checkout.js`),
which asks Square to create a secure, Square-hosted checkout page and
sends the customer there to pay by card. Nobody's card details ever
touch this site — that's handled entirely on Square's side, which is
what keeps you out of PCI-compliance headaches.

There's also an **Order by Email** button as a fallback, which just
emails the order to hecticrecordsbelfast@gmail.com for phone/in-store
payment — useful if Square isn't set up yet, or as a backup option.

### Why this needs a "function" and not just static files

A static site can add items to a cart just fine, but it can't safely
talk to Square directly — that would mean putting your secret Square
access token in the website's own code, visible to anyone who looks at
the page source, which someone could then use to create charges on your
account. The function keeps that key on the server side, invisible to
visitors. This is a normal, standard pattern — it's how most "static"
shopping sites handle checkout.

### Setting up your Square account

1. Go to [developer.squareup.com](https://developer.squareup.com) and
   sign in with your Square account (or create one — it's the same
   login as the Square POS app if you use that in store).
2. Click **+ New Application**, name it something like "Hectic Records
   Website".
3. Open the app, and on the **Credentials** page you'll see a
   **Sandbox** access token (for testing) and, once you request
   production access, a **Production** access token (for real
   payments). Copy whichever you're using.
4. Go to the **Locations** page (or your Square Dashboard's location
   settings) and copy your **Location ID** — this ties sales to your
   actual shop.

### Adding those to the website

These go in your hosting provider's dashboard as environment
variables — never paste them directly into the code:

| Variable | Value |
|---|---|
| `SQUARE_ACCESS_TOKEN` | The access token from step 3 |
| `SQUARE_LOCATION_ID` | The location ID from step 4 |
| `SQUARE_ENVIRONMENT` | `sandbox` while testing, `production` when live |

On Netlify: **Site configuration > Environment variables > Add a
variable**, one at a time.

### Testing before going live

Keep `SQUARE_ENVIRONMENT` set to `sandbox` first. Square gives you test
card numbers (e.g. `4111 1111 1111 1111`, any future expiry, any CVV)
on their [sandbox testing docs](https://developer.squareup.com/docs/testing/test-values)
so you can run through a full purchase without touching real money.
Once you're happy, request production access in the Square Developer
Dashboard, swap in your production access token, and flip
`SQUARE_ENVIRONMENT` to `production`.

### Other payment options

If you'd rather use something else instead of (or alongside) Square —
Stripe and PayPal both work in a similar way — just say and I can add
either.

## Staff login — editing stock & uploading cover art

There's a staff-only page at `/admin.html` — no more hand-editing
JavaScript. It's password-protected and, once set up, changes go live
on the site immediately (no re-uploading files).

### Setting the staff password

Add one more environment variable in your Netlify dashboard (Site
configuration > Environment variables), alongside the Square ones:

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | Whatever password staff will use to log in and edit stock |

Pick something you wouldn't mind a staff member knowing, since anyone
with it can add, remove, or edit stock — it doesn't need to be your
Square or email password. It's one shared password rather than
individual staff accounts, which keeps things simple for a shop this
size — let me know if you'd rather have separate logins per staff
member later.

### Using it

1. Go to `yoursite.com/admin.html` (bookmark it — it's not linked from
   the site's main menu on purpose, so customers don't stumble onto
   it).
2. Log in with the staff password.
3. Each row is one record. Click **Upload** under the cover thumbnail
   to add a photo of the sleeve — it's resized and compressed
   automatically, so there's no need to shrink photos yourself first.
   Edit any other field directly: price, genre, format, tick New In
   and/or Pre-Order, pick a release date if it's a pre-order, and (if
   there's no photo yet) pick one of the five fallback colours, which
   is what shows until a photo's added.
4. **+ Add Record** adds a blank row at the bottom. **🗑** removes one.
5. The **Genres** panel at the top lets you add a new genre (type a
   name, e.g. "Reggae", and it's ready to assign to records) or remove
   one that's no longer needed.
6. Click **Save Changes**. That's it — the homepage, shop, genre
   filters and product pages all update immediately for every visitor.

If you're uploading a lot of photos in one sitting and see a "too
large" message on save, split it into a couple of smaller batches —
save the first chunk of new records, then add the rest.

### How this actually works

Stock is stored using **Netlify Blobs**, a small built-in data store
that comes with your Netlify site — you don't need to set up a
database yourself. The site's pages fetch the current stock list from
it on every visit, so edits in the admin page show up straight away.
If you ever remove Netlify Blobs or it's briefly unavailable, the site
quietly falls back to the starter placeholder records bundled in
`js/products.js`, rather than breaking.

**A note on security:** anyone who finds `/admin.html` can *see* the
editing screen, but can't actually save changes without the correct
password (the server checks it, not just the page) — so it's low-risk
for a shop this size, but don't share the password beyond whoever
needs it, and treat it like any other shop system login.



## Editing the starter/fallback data directly (optional)

Once Netlify and the admin password are set up, use `/admin.html` for
day-to-day stock changes (see above) — it's much easier than editing
code. This section is just for reference, or for editing the
placeholder data before you've deployed anywhere.

`js/products.js` is the starter data, and also the fallback used if
the live store is ever unreachable. Every record is one entry in the
`PRODUCTS` list:

```js
{ id: "p21", artist: "Real Artist", title: "Real Album", price: 24.99,
  genre: "rock", tags: ["new-in"], format: "LP", accent: 2 }
```

- `id` — unique, no spaces (e.g. `p21`)
- `genre` — must match one of the keys in `GENRE_LABELS` at the top of
  the same file (add a new genre there first if needed)
- `tags` — `["new-in"]`, `["pre-order"]`, both, or `[]` for neither
- `format` — whatever you like: `LP`, `7"`, `2LP`, `Cassette`...
- `accent` — a number 1–5, just picks which of the 5 sleeve colours is
  used on the card (cycle through them for variety)
- `releaseDate` — optional, only used for pre-orders (format:
  `"2026-11-14"`)
- `image` — optional, a photo of the sleeve. Leave it out to use the
  generated colour graphic instead (the normal way to add one is via
  the Upload button in `/admin.html`, not by hand-editing this file).

The 20 records currently in the file are placeholders so the site has
something to show — swap them all out for your real stock whenever
you're ready. There's no limit on how many you add.

Product photos aren't wired in — cards currently show a generated
"sleeve" graphic instead. If you'd like real cover art, that's a
straightforward addition (an `image` field per product + a small CSS
tweak) — just say the word.

## Previewing locally

**Just looking at the design and pages:** unzip the folder and
double-click `index.html` — it opens directly in your browser, cart
included (browsers allow that for local files). The **Pay with
Square** button won't work this way though, since there's no server
running to talk to Square.

**Testing Square checkout locally too:** you need the [Netlify
CLI](https://docs.netlify.com/cli/get-started/) installed (needs
Node.js — install that from nodejs.org first if you don't have it),
then from inside this folder:

```
npm install -g netlify-cli
netlify dev
```

This runs the whole site, functions included, at `http://localhost:8888`,
using the Square sandbox credentials once you've set them (see below).

## Hosting it

Because Square checkout needs the serverless function to run somewhere,
host with **Netlify** (free tier is plenty for a shop this size) —
either connect the folder to a GitHub repo for automatic deploys, or
use the Netlify CLI:

```
netlify deploy --prod
```

(run from inside this folder, after `netlify login`). Either way,
Netlify picks up `netlify.toml` automatically and runs the function.

Note: Netlify's drag-and-drop upload page ("Netlify Drop") only
publishes static files — it won't run the checkout function, so use
the CLI or a connected Git repo instead if you want Square to work.

If you don't need Square right now and just want the site up quickly,
any static host works for everything except checkout — GitHub Pages,
Vercel, or traditional FTP hosting. You can always add Netlify (and
Square) later without changing any of the other pages.

Once deployed, point your shop's domain at wherever you host it —
your registrar or Netlify's own domain settings will walk you through
that.

## Editing text and details

Store address, phone, email, hours and Instagram handle appear in the
header strip, footer, homepage visit section, and contact page — all in
plain HTML, so it's a find-and-replace across the `.html` files if any
of these change.
