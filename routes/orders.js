const express = require('express');
const router = express.Router();
const { orders, items, settings, activity } = require('../database');
const { requireAuth } = require('../auth');
const { sendLowStockAlert, sendOrderConfirmation, sendOrderStatusEmail } = require('../mailer');

// public checkout endpoint — validates the cart, creates the order, fires the confirmation email
router.post('/', (req, res) => {
  const { customer_name, customer_email, customer_phone,
          shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country,
          lines, notes, shipping_cost } = req.body;

  if (!customer_name || !customer_email || !shipping_address || !shipping_city || !shipping_state || !shipping_zip) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item' });
  }
  for (const l of lines) {
    if (!l.item_id || !l.qty || l.qty < 1) return res.status(400).json({ error: 'Invalid line item' });
  }

  try {
    const order = orders.create({ customer_name, customer_email, customer_phone,
      shipping_address, shipping_city, shipping_state, shipping_zip, shipping_country, lines, notes, shipping_cost });
    activity.log('order', `Order ${order.order_number} placed by ${order.customer_name} — A$${order.total.toFixed(2)}`);
    res.status(201).json(order);
    sendOrderConfirmation(order).catch(() => {});
    const threshold = parseInt(settings.get().low_stock_threshold) || 5;
    for (const l of order.items) {
      const item = items.findById(l.item_id);
      if (item && item.stock <= threshold) sendLowStockAlert(item).catch(() => {});
    }
  } catch (err) {
    const status = { NOT_FOUND: 404, UNAVAILABLE: 409, STOCK: 409 }[err.code] || 500;
    res.status(status).json({ error: err.message });
  }
});

// dashboard order counts and revenue — must be defined before /:id or it gets swallowed
router.get('/stats', requireAuth, (req, res) => {
  res.json(orders.stats());
});

// customer self-lookup by email + order number — public, also before /:id
router.get('/lookup', (req, res) => {
  const { email, order_number } = req.query;
  if (!email || !order_number) return res.status(400).json({ error: 'email and order_number are required' });
  const order = orders.all().find(
    o => o.customer_email.toLowerCase() === email.trim().toLowerCase() &&
         o.order_number.toUpperCase() === order_number.trim().toUpperCase()
  );
  if (!order) return res.status(404).json({ error: 'No order found with those details' });
  res.json(order);
});

// list all orders — admin only, can filter by status
router.get('/', requireAuth, (req, res) => {
  res.json(orders.all({ status: req.query.status }));
});

// fetch a single order by UUID — the UUID itself acts as the access token
router.get('/:id', (req, res) => {
  const order = orders.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// admin changes the order status and the right email fires automatically
router.patch('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status is required' });
  try {
    const order = orders.updateStatus(req.params.id, status);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    activity.log('order', `Order ${order.order_number} status → ${status.replace(/_/g, ' ')}`);
    res.json(order);
    sendOrderStatusEmail(order).catch(() => {});
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// save a tracking number against the order
router.patch('/:id/tracking', requireAuth, (req, res) => {
  const order = orders.updateTracking(req.params.id, req.body.tracking_number);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.tracking_number) activity.log('order', `Tracking number set for ${order.order_number}: ${order.tracking_number}`);
  res.json(order);
});

// internal admin notes — not visible to the customer, just for your own records
router.patch('/:id/admin-notes', requireAuth, (req, res) => {
  const order = orders.updateAdminNotes(req.params.id, req.body.admin_notes);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

module.exports = router;
