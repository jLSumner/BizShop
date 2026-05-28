const express = require('express');
const router  = express.Router();
const { settings, activity } = require('../database');
const { requireAuth } = require('../auth');

// storefront reads these publicly — store name, shipping mode, etc
router.get('/', (req, res) => res.json(settings.get()));

// saving settings requires a login, only touches fields in the allowed list
router.put('/', requireAuth, (req, res) => {
  const allowed = [
    'store_name','tagline','abn','contact_email','contact_phone','address','website','instagram','facebook',
    'low_stock_threshold','alert_email','smtp_host','smtp_port','smtp_user','smtp_pass',
    'shipping_mode','shipping_flat_rate','shipping_free_threshold',
    'shipping_NSW','shipping_VIC','shipping_QLD','shipping_SA','shipping_WA','shipping_TAS','shipping_ACT','shipping_NT',
  ];
  const patch = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) patch[key] = String(req.body[key]).trim();
  }
  const updated = settings.update(patch);
  const changed = Object.keys(patch).join(', ');
  activity.log('settings', `Settings updated: ${changed}`);
  res.json(updated);
});

module.exports = router;
