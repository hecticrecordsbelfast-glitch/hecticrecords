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

The cart page has a **Pay with Square** button — it's the only way to
check out now (an earlier "Order by Email" fallback has been removed).
It sends your bag's contents to a small serverless function
(`netlify/functions/create-checkout.js`), which asks Square to create
a secure, Square-hosted checkout page and sends the customer there to
pay by card. Nobody's card details ever touch this site — that's
handled entirely on Square's side, which is what keeps you out of
PCI-compliance headaches. It also asks the customer for a shipping
address during checkout, and double-checks stock is actually still
available before creating the payment link.

## Stock quantities & sell-out

Every record now has a quantity in the Stock admin page. Set it to
however many copies you actually have — 1 for a one-off used copy,
more for new stock you hold multiples of. When it hits 0, the record
automatically shows "Sold Out" everywhere on the site and can't be
added to anyone's bag.

Stock only goes down when a payment actually completes (see "Orders
& fulfillment" below) — not the moment someone adds it to their bag,
and not if they abandon checkout. So two people can have the same
last copy in their bag at once; whoever actually pays first gets it,
and the second person will see a clear "just sold out" message if they
try to check out after.

## Orders & fulfillment

There's a second staff page at `/orders.html` (linked from the Stock
page) showing every completed sale: date, total, buyer name, email,
phone, shipping address, and exactly what they bought. Tick "Mark as
shipped" once you've sent an order out — it filters into "Shipped" vs
"Needs shipping" so nothing gets missed.

This uses the same staff password as the Stock page — logging into
either one logs you into both.

### Setting this up: the Square webhook

This is the one part of setup that's a bit more involved, because it's
what makes stock and orders actually reliable. Here's why it's needed:
when a customer pays, the browser gets redirected back to your site —
but browsers can be closed, connections can drop, and a redirect alone
can be faked by anyone who knows the URL. So instead, Square itself
calls a private endpoint on your site directly, from their servers,
the moment a payment is confirmed — that's the only signal this site
actually trusts for "a sale happened."

1. In the Square Developer Dashboard, open your application, and find
   **Webhooks** in the left-hand menu.
2. Click **Add Endpoint**. For the URL, use:
   `https://yoursite.com/api/square-webhook` (swap in your real
   domain, or your temporary `*.netlify.app` address while testing).
3. Under event types, subscribe to **payment.updated**.
4. Save it. Square will show you a **Signature Key** for this
   endpoint — copy it.
5. In Netlify, add one more environment variable:
   `SQUARE_WEBHOOK_SIGNATURE_KEY` with that key as the value.
6. Redeploy (Deploys > Trigger deploy > Deploy project without
   cache).

Do this once for your sandbox setup while testing, and again for a
second webhook endpoint once you've switched to production (sandbox
and production each need their own webhook subscription with their
own signature key — swap `SQUARE_WEBHOOK_SIGNATURE_KEY` over at the
same time you switch `SQUARE_ACCESS_TOKEN` to production).

Until this is set up, checkout still works, but stock won't
automatically go down and orders won't show up in `/orders.html` —
so it's worth doing before you start taking real orders.

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

## Shipping — collection or postage, calculated by Square

**Collecting in store is always free and always offered** — nothing
to set up for that.

Postal delivery ("Post to me") is handled entirely by **Square**, not
by this site's own code. When a customer chooses to post, the site
asks Square to collect a shipping address, and Square applies
whichever shipping rate you've configured for that destination in
your own Square Dashboard. This site itself doesn't calculate or add
a shipping charge — Square does, based on its own settings.

### One-time setup in Square (not code)

1. In your **Square Dashboard** (your regular business dashboard, not
   the Developer portal), go to **Settings > Account & Settings >
   Fulfillment methods > Shipment**, and turn it on.
2. Under **Shipping rate profiles**, click **Add profile**. Give it
   an internal name (customers won't see it).
3. **Add countries** — every destination you're willing to post to.
4. **Add rate** — give it a customer-facing name (e.g. "Standard
   Shipping") and a price. You can add more than one rate/profile to
   charge differently by country group (e.g. one profile for the UK,
   another for the rest of the world).
5. Save.

**Important:** you need at least one rate configured before turning
on postal delivery for customers, or Square's checkout page will get
stuck asking for a "valid shipping method" that never appears. Test a
full checkout with "Post to me" before relying on this live.

Since Square calculates the actual rate, changing prices later is
just editing that profile in Square's dashboard — no site changes or
redeploys needed. The trade-off is that (unlike a fully custom setup)
Square's rates are per-destination, not automatically scaled by how
many records are in the order — if you need rates that also change
with order size, that would need a custom shipping calculator built
into this site instead, which is a bigger undertaking; ask if that
becomes worth doing later.

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

### If you see "Netlify Blobs isn't configured"

On some sites, Netlify Blobs doesn't auto-detect its own credentials,
and saving in `/admin.html` fails with a message like *"The
environment has not been configured to use Netlify Blobs."* If that
happens, add one more environment variable:

1. In Netlify, click your account avatar (top right) > **User
   settings**, then **Applications** in the left menu, then **New
   access token** under Personal access tokens. Name it something
   like "Hectic Records Blobs" and generate it — copy the token shown
   (you only get to see it once).
2. Back in your site's Environment variables, add
   `NETLIFY_BLOBS_TOKEN` with that token as the value.
3. Redeploy (Deploys > Trigger deploy > **Deploy project without
   cache**).

This token just gives the site permission to read and write its own
stock data — it doesn't grant access to anything else in your Netlify
account.



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
- `stock` — how many copies you have. Set to 0 to mark something sold
  out manually; normally this counts down automatically as orders come
  in (see "Stock quantities & sell-out" below).
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

## Legal pages, item descriptions, and contact

Three new pages are live: `/terms.html`, `/privacy.html`, and
`/pre-orders-info.html` (all linked from every page's footer under
"Information"). These were written fresh for Hectic specifically —
not copied from another shop's site — and cover UK consumer rights
(the 14-day right to cancel, with the standard exemption for sealed
records/CDs once unsealed), returns, pre-order fulfilment, and a
plain-English privacy policy covering Square, Netlify, and the
shopping bag.

**Important:** these are a solid starting point, not a substitute for
a solicitor. It's worth having them properly reviewed before relying
on them, especially once you're trading for real and particularly if
you ever start a mailing list or collect more customer data than
order fulfilment requires.

Every phone number has been removed from the site — contact is now
email only (`hecticrecordsbelfast@gmail.com`), on the footer, contact
page, and homepage. If you'd like a phone number back on there later,
just say.

There's also a new **Description** field per record in the Stock
admin page — a line or two about a specific pressing, condition
notes for used stock, etc. It's optional; leave it blank and the
product page just won't show a description section.

## Editing text and details

Store address, phone, email, hours and Instagram handle appear in the
header strip, footer, homepage visit section, and contact page — all in
plain HTML, so it's a find-and-replace across the `.html` files if any
of these change.
