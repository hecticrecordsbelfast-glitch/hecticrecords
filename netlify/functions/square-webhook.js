/* ------------------------------------------------------------------
   Square calls this automatically when a payment completes. This is
   the ONLY reliable place to decrement stock and record a sale — a
   redirect back to order-confirmed.html can be closed, interrupted,
   or faked, but this webhook only fires when Square itself confirms
   money actually moved.

   Set up in Square: Developer Dashboard > your app > Webhooks >
   Add Endpoint. URL: https://yoursite.com/api/square-webhook
   Subscribe to: payment.updated
   Copy the "Signature Key" it gives you into SQUARE_WEBHOOK_SIGNATURE_KEY.

   Needs: SQUARE_ACCESS_TOKEN, SQUARE_ENVIRONMENT,
   SQUARE_WEBHOOK_SIGNATURE_KEY, and (if your site needs it)
   NETLIFY_BLOBS_TOKEN — see README.

   Also sends an order notification email (see README for full setup):
   GMAIL_USER, GMAIL_APP_PASSWORD, ORDER_NOTIFICATION_EMAIL.

   IMPORTANT: this webhook receives events for every sale on your whole
   Square account (your till, any other shops), not just this site —
   it filters to only act on sales matching SQUARE_LOCATION_ID.
   ------------------------------------------------------------------ */

const crypto = require("crypto");
const { getStore } = require("@netlify/blobs");
const nodemailer = require("nodemailer");

function getStoreFor(name) {
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  if (token && siteID) {
    return getStore({ name, siteID, token });
  }
  return getStore(name);
}

function money(n) {
  return n === null || n === undefined ? "—" : "£" + Number(n).toFixed(2);
}

// Sends a plain-text order notification email from the shop's own Gmail
// account. Needs GMAIL_USER and GMAIL_APP_PASSWORD (a Google "App
// Password", not the normal account password — see README) and
// ORDER_NOTIFICATION_EMAIL (who receives the notification).
// Failing to send an email never stops the order itself from being
// recorded — this is a best-effort side effect, logged but not fatal.
async function sendOrderNotificationEmail(orderRecord) {
  const GMAIL_USER = process.env.GMAIL_USER;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  const NOTIFY_TO = process.env.ORDER_NOTIFICATION_EMAIL;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !NOTIFY_TO) {
    return { sent: false, reason: "Email notifications aren't configured (missing GMAIL_USER, GMAIL_APP_PASSWORD, or ORDER_NOTIFICATION_EMAIL)." };
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  const itemLines = orderRecord.items
    .map((item) => `  ${item.quantity} x ${item.name} — ${money(item.price)} each`)
    .join("\n");

  const addressLines = orderRecord.shippingAddress
    ? [
        orderRecord.shippingAddress.line1,
        orderRecord.shippingAddress.line2,
        orderRecord.shippingAddress.city,
        orderRecord.shippingAddress.postcode,
        orderRecord.shippingAddress.country,
      ].filter(Boolean).join("\n  ")
    : "No shipping address given (in-store collection, or not requested).";

  const bodyText = `New order on Hectic Records — ${money(orderRecord.totalMoney)}

Fulfilment: ${orderRecord.fulfilmentNote || "—"}

Items:
${itemLines}

Buyer:
  Name: ${orderRecord.recipientName || "Not given"}
  Email: ${orderRecord.buyerEmail || "Not given"}
  Phone: ${orderRecord.recipientPhone || "Not given"}

Shipping address:
  ${addressLines}

Order ID: ${orderRecord.orderId}
View full details in the staff orders page: /orders.html
`;

  try {
    await transporter.sendMail({
      from: `"Hectic Records" <${GMAIL_USER}>`,
      to: NOTIFY_TO,
      subject: `New order — ${money(orderRecord.totalMoney)}`,
      text: bodyText,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

function verifySignature(notificationUrl, body, signatureHeader, signatureKey) {
  if (!signatureHeader || !signatureKey) return false;
  const hmac = crypto.createHmac("sha256", signatureKey);
  hmac.update(notificationUrl + body);
  const expected = hmac.digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch (e) {
    return false;
  }
}

exports.handler = async (event) => {
  const SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  const ENVIRONMENT = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";
  const API_BASE = ENVIRONMENT === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!SIGNATURE_KEY || !ACCESS_TOKEN) {
    // Not configured yet — acknowledge so Square doesn't keep retrying,
    // but do nothing. Stock/orders just won't update until this is set up.
    return { statusCode: 200, body: "Webhook not configured yet" };
  }

  const notificationUrl = `https://${event.headers.host}/api/square-webhook`;
  const signatureHeader = event.headers["x-square-hmacsha256-signature"] || event.headers["X-Square-Hmacsha256-Signature"];

  if (!verifySignature(notificationUrl, event.body, signatureHeader, SIGNATURE_KEY)) {
    return { statusCode: 401, body: "Invalid signature" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: "Bad payload" };
  }

  if (payload.type !== "payment.updated" || payload.data?.object?.payment?.status !== "COMPLETED") {
    return { statusCode: 200, body: "Ignored (not a completed payment)" };
  }

  // This webhook fires for every sale across your whole Square account —
  // your till, any other shops, all of it — not just this website. Only
  // act on sales that belong to this site's own configured location.
  const OWN_LOCATION_ID = process.env.SQUARE_LOCATION_ID;
  const paymentLocationId = payload.data.object.payment.location_id;
  if (OWN_LOCATION_ID && paymentLocationId && paymentLocationId !== OWN_LOCATION_ID) {
    return { statusCode: 200, body: "Ignored (different location)" };
  }

  const payment = payload.data.object.payment;
  const orderId = payment.order_id;
  if (!orderId) {
    return { statusCode: 200, body: "No order_id on payment" };
  }

  const ordersStore = getStoreFor("hectic-orders");

  // Idempotency: Square may send the same event more than once.
  const existing = await ordersStore.get(orderId, { type: "json" }).catch(() => null);
  if (existing) {
    return { statusCode: 200, body: "Already processed" };
  }

  // Fetch full order details (line items with our product-id notes, and
  // shipping/recipient info if the buyer entered one).
  let order;
  try {
    const orderRes = await fetch(`${API_BASE}/v2/orders/${orderId}`, {
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`,
        "Square-Version": "2024-10-17",
      },
    });
    const orderData = await orderRes.json();
    order = orderData.order;
  } catch (err) {
    return { statusCode: 500, body: "Could not fetch order details" };
  }

  if (!order) {
    return { statusCode: 200, body: "Order not found" };
  }

  const lineItems = (order.line_items || []).map((li) => ({
    productId: li.note || null,
    name: li.name,
    quantity: parseInt(li.quantity, 10) || 1,
    price: li.base_price_money ? li.base_price_money.amount / 100 : null,
  }));

  const fulfillment = (order.fulfillments || [])[0];
  const recipient = fulfillment?.shipment_details?.recipient;

  const orderRecord = {
    orderId,
    paymentId: payment.id,
    date: new Date().toISOString(),
    totalMoney: order.total_money ? order.total_money.amount / 100 : null,
    currency: order.total_money ? order.total_money.currency : "GBP",
    fulfilmentNote: order.note || null,
    buyerEmail: payment.buyer_email_address || null,
    recipientName: recipient?.display_name || null,
    recipientPhone: recipient?.phone_number || null,
    shippingAddress: recipient?.address
      ? {
          line1: recipient.address.address_line_1 || "",
          line2: recipient.address.address_line_2 || "",
          city: recipient.address.locality || "",
          postcode: recipient.address.postal_code || "",
          country: recipient.address.country || "",
        }
      : null,
    items: lineItems,
    fulfilled: false,
  };

  // Decrement stock for each purchased item.
  try {
    const productsStore = getStoreFor("hectic-store");
    const saved = await productsStore.get("products", { type: "json" }).catch(() => null);
    if (saved && Array.isArray(saved.products)) {
      let changed = false;
      for (const item of lineItems) {
        if (!item.productId) continue;
        const product = saved.products.find((p) => p.id === item.productId);
        if (product && typeof product.stock === "number") {
          product.stock = Math.max(0, product.stock - item.quantity);
          changed = true;
        }
      }
      if (changed) {
        await productsStore.setJSON("products", saved);
      }
    }
  } catch (err) {
    // Stock update failing shouldn't stop the order from being recorded —
    // log it in the order itself so it's visible in the orders view.
    orderRecord.stockUpdateError = err.message;
  }

  await ordersStore.setJSON(orderId, orderRecord);

  // Keep a simple index of order IDs so orders-get.js can list them
  // without having to enumerate the whole store.
  try {
    const index = (await ordersStore.get("_index", { type: "json" }).catch(() => null)) || { orderIds: [] };
    index.orderIds.unshift(orderId);
    await ordersStore.setJSON("_index", index);
  } catch (err) {
    // non-fatal
  }

  // Best-effort — a failed notification email should never make Square
  // think the webhook itself failed (which would cause pointless retries).
  const emailResult = await sendOrderNotificationEmail(orderRecord).catch((err) => ({ sent: false, reason: err.message }));

  return { statusCode: 200, body: emailResult.sent ? "OK" : `OK (email not sent: ${emailResult.reason})` };
};
