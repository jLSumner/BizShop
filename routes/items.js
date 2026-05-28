const express = require('express');
const router = express.Router();
const { items, settings, activity } = require('../database');
const { requireAuth } = require('../auth');
const { sendLowStockAlert } = require('../mailer');
const multer = require('multer');
const path = require('path');

// multer config — timestamps the filename so nothing gets overwritten
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../public/uploads'),
  filename: (req, file, cb) => cb(null, `item-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|gif|webp)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});
const uploadMulti = upload.array('images', 10);

// list products — storefront can filter by category, search term, and active status
router.get('/', (req, res) => {
  const { category, search, active } = req.query;
  res.json(items.all({ categorySlug: category, search, activeOnly: active !== 'all' }));
});

router.get('/:id', (req, res) => {
  const item = items.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

// create a new product — handles multi-image upload via multipart form
router.post('/', uploadMulti, (req, res) => {
  const { category_id, name, description, price, stock, sku, featured } = req.body;
  if (!category_id || !name || price === undefined) {
    return res.status(400).json({ error: 'category_id, name, and price are required' });
  }
  if (isNaN(price) || price < 0) return res.status(400).json({ error: 'Invalid price' });
  const newImgs  = (req.files || []).map(f => `/uploads/${f.filename}`);
  const images   = newImgs.length ? newImgs : (req.body.image_url ? [req.body.image_url] : []);
  const image_url = images[0] || null;
  const featuredVal = featured === 'true' || featured === true;
  try {
    const created = items.create({ category_id, name: name.trim(), description, price, stock, sku, image_url, images, featured: featuredVal });
    activity.log('item', `Item created: "${created.name}"${created.sku ? ` (${created.sku})` : ''} — A$${parseFloat(created.price).toFixed(2)}`);
    res.status(201).json(created);
  } catch (err) {
    res.status(err.code === 'UNIQUE' ? 409 : 500).json({ error: err.message });
  }
});

// update a product — merges kept existing images with any newly uploaded ones
router.put('/:id', uploadMulti, (req, res) => {
  const item = items.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const { category_id, name, description, price, sku, active, featured } = req.body;
  if (price !== undefined && (isNaN(price) || price < 0)) return res.status(400).json({ error: 'Invalid price' });

  const kept    = req.body.existing_images
    ? (Array.isArray(req.body.existing_images) ? req.body.existing_images : [req.body.existing_images]).filter(Boolean)
    : [];
  const newImgs = (req.files || []).map(f => `/uploads/${f.filename}`);
  const images  = [...kept, ...newImgs];
  const image_url   = images[0] || null;
  const activeVal   = active   !== undefined ? (active   === 'true' || active   === true) : item.active;
  const featuredVal = featured !== undefined ? (featured === 'true' || featured === true) : (item.featured || false);

  try {
    const updated = items.update(req.params.id, {
      category_id: category_id ?? item.category_id,
      name: name ? name.trim() : item.name,
      description: description ?? item.description,
      price: price !== undefined ? parseFloat(price) : item.price,
      sku: sku ?? item.sku,
      active: activeVal,
      featured: featuredVal,
      image_url,
      images,
    });
    activity.log('item', `Item updated: "${updated.name}"`);
    res.json(updated);
  } catch (err) {
    res.status(err.code === 'UNIQUE' ? 409 : 500).json({ error: err.message });
  }
});

// stock adjustment — logs the change and fires a low stock alert if needed
router.patch('/:id/inventory', (req, res) => {
  const item = items.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const { change, reason } = req.body;
  if (change === undefined || isNaN(change)) return res.status(400).json({ error: 'change (integer) is required' });
  try {
    const result = items.adjustStock(req.params.id, change, reason);
    activity.log('inventory', `Stock adjusted: "${item.name}" ${parseInt(change) > 0 ? '+' : ''}${change} → ${result.stock} units${reason ? ` (${reason})` : ''}`);
    res.json(result);
    const threshold = parseInt(settings.get().low_stock_threshold) || 5;
    if (result.stock <= threshold) sendLowStockAlert(items.findById(req.params.id)).catch(() => {});
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/inventory', (req, res) => {
  const item = items.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json({ item: { id: item.id, name: item.name, stock: item.stock }, log: items.inventoryLog(req.params.id) });
});

// bulk CSV import — matches on SKU, creates new products or updates existing ones
router.post('/import', requireAuth, (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows array required' });

  const { categories } = require('../database');
  const cats = categories.all();
  const results = { created: 0, updated: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;
    try {
      const name = (r.name || '').trim();
      if (!name) { results.errors.push(`Row ${rowNum}: name is required`); continue; }
      const priceRaw = parseFloat(r.price);
      if (isNaN(priceRaw) || priceRaw < 0) { results.errors.push(`Row ${rowNum}: invalid price "${r.price}"`); continue; }

      const catInput = (r.category || '').trim().toLowerCase();
      const cat = cats.find(c => c.name.toLowerCase() === catInput || c.slug === catInput.replace(/\s+/g, '-'));
      if (!cat) { results.errors.push(`Row ${rowNum}: category "${r.category}" not found`); continue; }

      const sku = (r.sku || '').trim() || null;
      const toBool = v => ['yes','true','1','y'].includes(String(v).toLowerCase().trim());

      const existing = sku ? items.all({ activeOnly: false }).find(it => it.sku === sku) : null;
      if (existing) {
        items.update(existing.id, {
          category_id: cat.id,
          name,
          description: r.description || existing.description,
          price: priceRaw,
          sku,
          active:   r.active   !== undefined ? toBool(r.active)   : existing.active,
          featured: r.featured !== undefined ? toBool(r.featured) : existing.featured,
          image_url: existing.image_url,
        });
        results.updated++;
      } else {
        items.create({
          category_id: cat.id, name,
          description: r.description || null,
          price: priceRaw,
          stock: parseInt(r.stock) || 0,
          sku,
          image_url: null,
          featured: toBool(r.featured),
        });
        results.created++;
      }
    } catch (err) {
      results.errors.push(`Row ${rowNum}: ${err.message}`);
    }
  }

  if (results.created > 0 || results.updated > 0) {
    activity.log('item', `CSV import: ${results.created} created, ${results.updated} updated`);
  }
  res.json(results);
});

// deactivate (soft delete) or permanently nuke a product
router.delete('/:id', (req, res) => {
  const item = items.findById(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (req.query.hard === 'true') {
    items.hardDelete(req.params.id);
    activity.log('item', `Item permanently deleted: "${item.name}"`);
  } else {
    items.softDelete(req.params.id);
    activity.log('item', `Item deactivated (hidden from store): "${item.name}"`);
  }
  res.json({ success: true });
});

module.exports = router;
