const nodemailer = require('nodemailer');
const { settings } = require('./database');

// grabs SMTP config from settings — returns null if it's not set up yet
function getTransporter() {
  const s = settings.get();
  if (!s.smtp_host || !s.smtp_user || !s.smtp_pass) return null;
  return nodemailer.createTransport({
    host: s.smtp_host,
    port: parseInt(s.smtp_port) || 587,
    secure: parseInt(s.smtp_port) === 465,
    auth: { user: s.smtp_user, pass: s.smtp_pass },
  });
}

// fires the email — bails out silently if SMTP isn't configured, no dramas
async function sendMail({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[mailer] SMTP not configured — skipped: ${subject}`);
    return false;
  }
  const s = settings.get();
  const from = `"${s.store_name || 'BIZ Shop'}" <${s.smtp_user}>`;
  await transporter.sendMail({ from, to, subject, html });
  return true;
}

// sends a heads-up email when stock on an item gets too low
async function sendLowStockAlert(item) {
  const s = settings.get();
  const to = s.alert_email || s.contact_email;
  if (!to) return;
  await sendMail({
    to,
    subject: `⚠️ Low stock: ${item.name} (${item.stock} left)`,
    html: `
      <p>Stock for <strong>${item.name}</strong> has dropped to <strong>${item.stock} unit${item.stock !== 1 ? 's' : ''}</strong>,
      which is at or below your alert threshold of ${s.low_stock_threshold}.</p>
      <p>SKU: ${item.sku || '—'}</p>
      <p><a href="${s.website ? 'https://' + s.website : ''}/admin">Go to admin panel →</a></p>
    `,
  });
}

// shared HTML wrapper for all outgoing emails — keeps header, body, footer consistent
function emailLayout(s, { title, preheader, body }) {
  const base   = s.website ? `https://${s.website}` : '';
  const store  = s.store_name || 'BIZ Shop';
  const phone  = s.contact_phone || '';
  const email  = s.contact_email || '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;">
<span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#0f172a;border-radius:8px 8px 0 0;padding:28px 36px;">
        <span style="color:#e11d48;font-weight:700;font-size:13px;letter-spacing:2px;text-transform:uppercase;">${store}</span>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:36px 36px 28px;">
        ${body}
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 8px 8px;padding:20px 36px;text-align:center;">
        <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">${store}${phone ? ' · ' + phone : ''}${email ? ' · ' + email : ''}</p>
        ${base ? `<p style="margin:0;font-size:12px;"><a href="${base}" style="color:#e11d48;text-decoration:none;">${s.website}</a></p>` : ''}
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

// HTML-safe string escaping — always run user content through this before putting it in emails
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// builds the line items table that goes inside order emails
function orderItemsTable(order) {
  const rows = order.items.map(l => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;">${esc(l.name)}${l.sku ? `<br><span style="font-size:11px;color:#94a3b8;">${esc(l.sku)}</span>` : ''}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;text-align:center;">×${l.qty}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;text-align:right;font-weight:600;">A$${(l.price * l.qty).toFixed(2)}</td>
    </tr>`).join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #e2e8f0;">
          <th style="padding:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;text-align:left;font-weight:600;">Item</th>
          <th style="padding:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;text-align:center;font-weight:600;">Qty</th>
          <th style="padding:6px 0;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;text-align:right;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        ${order.gst != null ? `<tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#64748b;text-align:right;">GST (10%)</td><td style="padding:6px 0;font-size:13px;color:#64748b;text-align:right;">A$${Number(order.gst).toFixed(2)}</td></tr>` : ''}
        <tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#64748b;text-align:right;">Shipping</td><td style="padding:6px 0;font-size:13px;color:#64748b;text-align:right;">${order.shipping_cost > 0 ? `A$${Number(order.shipping_cost).toFixed(2)}` : 'Free'}</td></tr>
        <tr style="border-top:2px solid #e2e8f0;"><td colspan="2" style="padding:10px 0 0;font-size:15px;font-weight:700;text-align:right;">Total (inc. GST)</td><td style="padding:10px 0 0;font-size:15px;font-weight:800;text-align:right;">A$${Number(order.total).toFixed(2)}</td></tr>
      </tfoot>
    </table>`;
}

// little "Track Your Order" button for the bottom of emails
function trackBtn(base, order) {
  const url = `${base}/track?order=${encodeURIComponent(order.order_number)}`;
  return `<p style="text-align:center;margin:24px 0 8px;">
    <a href="${url}" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px;">Track Your Order →</a>
  </p>`;
}

// fires off the "cheers for your order" confirmation email as soon as an order is placed
async function sendOrderConfirmation(order) {
  const s    = settings.get();
  const base = s.website ? `https://${s.website}` : '';

  const body = `
    <h2 style="margin:0 0 4px;font-size:22px;color:#0f172a;">Order Confirmed!</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#64748b;">Hi ${esc(order.customer_name.split(' ')[0])}, thanks for your order. We'll get it ready as soon as possible.</p>

    <div style="background:#f8fafc;border-radius:6px;padding:14px 18px;margin-bottom:20px;">
      <p style="margin:0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Order number</p>
      <p style="margin:4px 0 0;font-size:20px;font-weight:800;font-family:monospace;color:#0f172a;">${esc(order.order_number)}</p>
    </div>

    ${orderItemsTable(order)}

    <div style="margin:20px 0;padding:14px 18px;background:#f8fafc;border-radius:6px;font-size:13px;color:#475569;">
      <strong>Shipping to:</strong><br>
      ${esc(order.customer_name)}<br>
      ${esc(order.shipping_address)}<br>
      ${esc(order.shipping_city)}, ${esc(order.shipping_state)} ${esc(order.shipping_zip)}
    </div>

    ${base ? trackBtn(base, order) : ''}
    <p style="text-align:center;font-size:12px;color:#94a3b8;margin:8px 0 0;">Enter your email and order number to track your order at any time.</p>`;

  await sendMail({
    to: order.customer_email,
    subject: `Order confirmed – ${order.order_number}`,
    html: emailLayout(s, {
      title: `Order confirmed – ${order.order_number}`,
      preheader: `Your order ${order.order_number} has been received. Total: A$${Number(order.total).toFixed(2)}.`,
      body,
    }),
  });
}

// what to say for each order status change — subject, message, whether to show items
const STATUS_CONFIG = {
  processing: {
    subject: o => `We're preparing your order – ${o.order_number}`,
    preheader: o => `Good news! Your payment is confirmed and we're packing ${o.order_number} now.`,
    heading: 'Payment Confirmed',
    message: o => `Hi ${esc(o.customer_name.split(' ')[0])}, your payment has been confirmed and we're now picking and packing your order. We'll let you know when it ships.`,
    showItems: true,
    showTracking: false,
  },
  shipped: {
    subject: o => `Your order is on its way – ${o.order_number}`,
    preheader: o => `${o.order_number} has been dispatched and is headed your way.`,
    heading: 'Your Order Has Shipped! 🚚',
    message: o => `Hi ${esc(o.customer_name.split(' ')[0])}, great news — your order has been dispatched and is on its way to you.`,
    showItems: true,
    showTracking: true,
  },
  delivered: {
    subject: o => `Your order has been delivered – ${o.order_number}`,
    preheader: o => `${o.order_number} has been marked as delivered.`,
    heading: 'Order Delivered',
    message: o => `Hi ${esc(o.customer_name.split(' ')[0])}, your order has been delivered. We hope everything arrived in perfect condition. Thanks for shopping with us!`,
    showItems: false,
    showTracking: false,
  },
  cancelled: {
    subject: o => `Your order has been cancelled – ${o.order_number}`,
    preheader: o => `Order ${o.order_number} has been cancelled.`,
    heading: 'Order Cancelled',
    message: o => `Hi ${esc(o.customer_name.split(' ')[0])}, your order has been cancelled. If you made a payment, please contact us and we'll arrange a refund promptly.`,
    showItems: true,
    showTracking: false,
  },
  refunded: {
    subject: o => `Your refund has been processed – ${o.order_number}`,
    preheader: o => `A refund for order ${o.order_number} has been processed.`,
    heading: 'Refund Processed',
    message: o => `Hi ${esc(o.customer_name.split(' ')[0])}, your refund for order ${esc(o.order_number)} has been processed. Please allow 3–5 business days for the funds to appear depending on your bank.`,
    showItems: false,
    showTracking: false,
  },
};

// picks the right email template and fires it when an order status changes
async function sendOrderStatusEmail(order) {
  const cfg = STATUS_CONFIG[order.status];
  if (!cfg) return;

  const s    = settings.get();
  const base = s.website ? `https://${s.website}` : '';

  const trackingBlock = cfg.showTracking && order.tracking_number
    ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:14px 18px;margin:16px 0;">
        <p style="margin:0;font-size:12px;color:#15803d;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Tracking Number</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:800;font-family:monospace;color:#0f172a;">${esc(order.tracking_number)}</p>
      </div>`
    : '';

  const body = `
    <h2 style="margin:0 0 4px;font-size:22px;color:#0f172a;">${cfg.heading}</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">${cfg.message(order)}</p>

    <div style="background:#f8fafc;border-radius:6px;padding:10px 18px;margin-bottom:${cfg.showItems ? '20px' : '0'};">
      <p style="margin:0;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Order</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:800;font-family:monospace;color:#0f172a;">${esc(order.order_number)}</p>
    </div>

    ${cfg.showItems ? orderItemsTable(order) : ''}
    ${trackingBlock}
    ${base ? trackBtn(base, order) : ''}`;

  await sendMail({
    to: order.customer_email,
    subject: cfg.subject(order),
    html: emailLayout(s, {
      title: cfg.subject(order),
      preheader: cfg.preheader(order),
      body,
    }),
  });
}

module.exports = { sendMail, sendLowStockAlert, sendOrderConfirmation, sendOrderStatusEmail };
