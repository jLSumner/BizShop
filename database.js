const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'store.json');

// reads and writes the whole store.json — this is the entire database, back it up!
function load() {
  if (!fs.existsSync(DB_PATH)) return null;
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

const SETTINGS_DEFAULTS = {
  store_name:          'BIZ Shop',
  tagline:             'Tools & 3D Printed Parts · Australia',
  abn:                 '',
  contact_email:       '',
  contact_phone:       '',
  address:             '',
  website:             'bizshop.com.au',
  instagram:           '',
  facebook:            '',
  low_stock_threshold: 5,
  alert_email:         '',
  smtp_host:           '',
  smtp_port:           '587',
  smtp_user:           '',
  smtp_pass:           '',
  shipping_mode:            'free',
  shipping_flat_rate:       '9.95',
  shipping_free_threshold:  '0',
  shipping_NSW:  '9.95',
  shipping_VIC:  '9.95',
  shipping_QLD:  '12.95',
  shipping_SA:   '12.95',
  shipping_WA:   '14.95',
  shipping_TAS:  '12.95',
  shipping_ACT:  '9.95',
  shipping_NT:   '14.95',
};

// merges whatever we've got saved with the defaults so nothing goes missing
function getDb() {
  const data = load() || {};
  return {
    categories:    data.categories    || [],
    items:         data.items         || [],
    inventory_log: data.inventory_log || [],
    orders:        data.orders        || [],
    settings:      { ...SETTINGS_DEFAULTS, ...(data.settings || {}) },
    activity_log:  data.activity_log  || [],
  };
}

const settings = {
  get()       { return getDb().settings; },
  update(patch) {
    const raw  = load() || {};
    raw.settings = { ...SETTINGS_DEFAULTS, ...(raw.settings || {}), ...patch };
    save(raw);
    return raw.settings;
  },
};

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function now() { return new Date().toISOString(); }

// chuck in some starter data if this is a fresh install with nothing in it yet
function seed() {
  const db = getDb();
  if (db.categories.length > 0) return;

  const toolsId = uuidv4(), printedId = uuidv4(), hardwareId = uuidv4();
  db.categories = [
    { id: toolsId,    name: 'Hand Tools',  description: 'Everyday hand tools and workshop essentials', slug: 'hand-tools',  created_at: now() },
    { id: printedId,  name: '3D Printed',  description: 'Custom 3D printed parts and accessories',     slug: '3d-printed',  created_at: now() },
    { id: hardwareId, name: 'Hardware',    description: 'Fasteners, brackets, and hardware bits',       slug: 'hardware',    created_at: now() },
  ];
  db.items = [
    { id: uuidv4(), category_id: toolsId,    name: 'Hex Key Set',             description: '9-piece metric hex key set, chrome vanadium', price: 12.99, stock: 24, sku: 'TL-HEX-001',   image_url: null, active: true, featured: true,  created_at: now(), updated_at: now() },
    { id: uuidv4(), category_id: toolsId,    name: 'Precision Screwdriver Kit', description: '32-bit magnetic screwdriver kit',           price: 18.50, stock: 15, sku: 'TL-SCREW-001', image_url: null, active: true, featured: true,  created_at: now(), updated_at: now() },
    { id: uuidv4(), category_id: printedId,  name: 'Cable Organizer Clip',    description: 'Desk cable management clip, pack of 6',        price:  5.99, stock: 50, sku: 'PRT-CABLE-001', image_url: null, active: true, featured: false, created_at: now(), updated_at: now() },
    { id: uuidv4(), category_id: printedId,  name: 'Filament Spool Holder',   description: 'Wall-mount spool holder for 1kg spools',        price:  9.99, stock: 12, sku: 'PRT-SPOOL-001', image_url: null, active: true, featured: false, created_at: now(), updated_at: now() },
    { id: uuidv4(), category_id: hardwareId, name: 'M3 Bolt Assortment',      description: '200-piece M3 bolt, nut and washer kit',         price:  8.99, stock: 30, sku: 'HW-M3-001',    image_url: null, active: true, featured: false, created_at: now(), updated_at: now() },
  ];
  save(db);
}

seed();

// categories — CRUD for the top-level product groupings
const categories = {
  all() {
    const db = getDb();
    return db.categories.map(c => ({
      ...c,
      item_count: db.items.filter(i => i.category_id === c.id && i.active).length
    })).sort((a, b) => a.name.localeCompare(b.name));
  },
  findById(id) { return getDb().categories.find(c => c.id === id) || null; },
  create({ name, description }) {
    const db = getDb();
    const slug = toSlug(name);
    if (db.categories.find(c => c.name === name || c.slug === slug))
      throw Object.assign(new Error('Category name already exists'), { code: 'UNIQUE' });
    const cat = { id: uuidv4(), name, description: description || null, slug, created_at: now() };
    db.categories.push(cat);
    save(db);
    return cat;
  },
  update(id, { name, description }) {
    const db = getDb();
    const idx = db.categories.findIndex(c => c.id === id);
    if (idx === -1) return null;
    const slug = toSlug(name);
    const conflict = db.categories.find(c => c.id !== id && (c.name === name || c.slug === slug));
    if (conflict) throw Object.assign(new Error('Category name already exists'), { code: 'UNIQUE' });
    db.categories[idx] = { ...db.categories[idx], name, description: description ?? db.categories[idx].description, slug };
    save(db);
    return db.categories[idx];
  },
  delete(id) {
    const db = getDb();
    const idx = db.categories.findIndex(c => c.id === id);
    if (idx === -1) return false;
    db.categories.splice(idx, 1);
    save(db);
    return true;
  },
  itemCount(id) { return getDb().items.filter(i => i.category_id === id).length; }
};

// items — the main product catalogue, filters, images, stock, the whole lot
const items = {
  all({ categorySlug, search, activeOnly = true } = {}) {
    const db = getDb();
    let list = db.items.map(i => {
      const cat = db.categories.find(c => c.id === i.category_id);
      const images = i.images?.length ? i.images : (i.image_url ? [i.image_url] : []);
      return { ...i, images, category_name: cat?.name || 'Unknown', category_slug: cat?.slug || '' };
    });
    if (activeOnly) list = list.filter(i => i.active);
    if (categorySlug) list = list.filter(i => i.category_slug === categorySlug);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  },
  findById(id) {
    const db = getDb();
    const item = db.items.find(i => i.id === id);
    if (!item) return null;
    const cat = db.categories.find(c => c.id === item.category_id);
    const images = item.images?.length ? item.images : (item.image_url ? [item.image_url] : []);
    return { ...item, images, category_name: cat?.name || 'Unknown', category_slug: cat?.slug || '' };
  },
  create({ category_id, name, description, price, stock, sku, image_url, images, featured }) {
    const db = getDb();
    if (sku && db.items.find(i => i.sku === sku))
      throw Object.assign(new Error('SKU already exists'), { code: 'UNIQUE' });
    const initStock = parseInt(stock) || 0;
    const imgs = images?.length ? images : (image_url ? [image_url] : []);
    const item = {
      id: uuidv4(), category_id, name, description: description || null,
      price: parseFloat(price), stock: initStock, sku: sku || null,
      image_url: imgs[0] || null, images: imgs,
      active: true, featured: !!featured, created_at: now(), updated_at: now()
    };
    db.items.push(item);
    if (initStock > 0) {
      db.inventory_log.push({ id: uuidv4(), item_id: item.id, change: initStock, reason: 'Initial stock', stock_after: initStock, created_at: now() });
    }
    save(db);
    return item;
  },
  update(id, fields) {
    const db = getDb();
    const idx = db.items.findIndex(i => i.id === id);
    if (idx === -1) return null;
    if (fields.sku && fields.sku !== db.items[idx].sku && db.items.find(i => i.sku === fields.sku))
      throw Object.assign(new Error('SKU already exists'), { code: 'UNIQUE' });
    db.items[idx] = { ...db.items[idx], ...fields, updated_at: now() };
    save(db);
    return db.items[idx];
  },
  adjustStock(id, change, reason) {
    const db = getDb();
    const idx = db.items.findIndex(i => i.id === id);
    if (idx === -1) return null;
    const newStock = db.items[idx].stock + parseInt(change);
    if (newStock < 0) throw new Error(`Cannot reduce below 0 (current: ${db.items[idx].stock})`);
    db.items[idx].stock = newStock;
    db.items[idx].updated_at = now();
    db.inventory_log.push({ id: uuidv4(), item_id: id, change: parseInt(change), reason: reason || null, stock_after: newStock, created_at: now() });
    save(db);
    return { id, stock: newStock, change: parseInt(change) };
  },
  inventoryLog(id) {
    return getDb().inventory_log
      .filter(l => l.item_id === id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 50);
  },
  softDelete(id) { return this.update(id, { active: false }); },
  hardDelete(id) {
    const db = getDb();
    db.items = db.items.filter(i => i.id !== id);
    db.inventory_log = db.inventory_log.filter(l => l.item_id !== id);
    save(db);
  }
};

// orders — generates order numbers, handles the full customer lifecycle
function genOrderNumber(db) {
  const existing = new Set(db.orders.map(o => o.order_number));
  let num;
  do { num = 'BIZ-' + String(Math.floor(100000 + Math.random() * 900000)); } while (existing.has(num));
  return num;
}

const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'return_requested', 'refunded'];

const orders = {
  all({ status } = {}) {
    const db = getDb();
    let list = db.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (status) list = list.filter(o => o.status === status);
    return list;
  },

  findById(id) { return getDb().orders.find(o => o.id === id) || null; },

  create({ customer_name, customer_email, customer_phone, shipping_address, shipping_city,
           shipping_state, shipping_zip, shipping_country, lines, notes, shipping_cost = 0 }) {
    const db = getDb();

    // validate stock, lock in prices at purchase time, and deduct inventory
    const orderItems = [];
    for (const line of lines) {
      const idx = db.items.findIndex(i => i.id === line.item_id);
      if (idx === -1) throw Object.assign(new Error(`Item not found: ${line.item_id}`), { code: 'NOT_FOUND' });
      const item = db.items[idx];
      if (!item.active) throw Object.assign(new Error(`"${item.name}" is no longer available`), { code: 'UNAVAILABLE' });
      if (item.stock < line.qty) throw Object.assign(new Error(`Insufficient stock for "${item.name}" (${item.stock} left)`), { code: 'STOCK' });
      db.items[idx].stock -= line.qty;
      db.items[idx].updated_at = now();
      db.inventory_log.push({ id: uuidv4(), item_id: item.id, change: -line.qty, reason: `Order`, stock_after: db.items[idx].stock, created_at: now() });
      orderItems.push({ item_id: item.id, name: item.name, sku: item.sku || null, price: item.price, qty: line.qty });
    }

    const subtotal      = Math.round(orderItems.reduce((s, l) => s + l.price * l.qty, 0) * 100) / 100;
    const gst           = Math.round(subtotal * 0.10 * 100) / 100;
    const shippingCost  = Math.round(parseFloat(shipping_cost || 0) * 100) / 100;
    const total         = Math.round((subtotal + gst + shippingCost) * 100) / 100;
    const order = {
      id: uuidv4(),
      order_number: genOrderNumber(db),
      status: 'pending',
      customer_name, customer_email, customer_phone: customer_phone || null,
      shipping_address, shipping_city, shipping_state, shipping_zip,
      shipping_country: shipping_country || 'AU',
      items: orderItems,
      subtotal,
      gst,
      shipping_cost: shippingCost,
      total,
      notes: notes || null,
      admin_notes: null,
      created_at: now(), updated_at: now(),
    };
    db.orders.push(order);
    save(db);
    return order;
  },

  updateStatus(id, status) {
    if (!ORDER_STATUSES.includes(status)) throw new Error('Invalid status');
    const db = getDb();
    const idx = db.orders.findIndex(o => o.id === id);
    if (idx === -1) return null;
    db.orders[idx].status = status;
    db.orders[idx].updated_at = now();
    save(db);
    return db.orders[idx];
  },

  updateAdminNotes(id, admin_notes) {
    const db = getDb();
    const idx = db.orders.findIndex(o => o.id === id);
    if (idx === -1) return null;
    db.orders[idx].admin_notes = admin_notes || null;
    db.orders[idx].updated_at = now();
    save(db);
    return db.orders[idx];
  },

  updateTracking(id, tracking_number) {
    const db = getDb();
    const idx = db.orders.findIndex(o => o.id === id);
    if (idx === -1) return null;
    db.orders[idx].tracking_number = tracking_number || null;
    db.orders[idx].updated_at = now();
    save(db);
    return db.orders[idx];
  },

  stats() {
    const db = getDb();
    const all = db.orders;
    return {
      total:      all.length,
      pending:    all.filter(o => o.status === 'pending').length,
      processing: all.filter(o => o.status === 'processing').length,
      shipped:    all.filter(o => o.status === 'shipped').length,
      delivered:  all.filter(o => o.status === 'delivered').length,
      cancelled:  all.filter(o => o.status === 'cancelled').length,
      revenue:    Math.round(all.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0) * 100) / 100,
    };
  },
};

// activity log — running tail of what happened and when, capped at 500 entries
const activity = {
  log(type, message) {
    const raw = load() || {};
    if (!raw.activity_log) raw.activity_log = [];
    raw.activity_log.unshift({ id: uuidv4(), type, message, created_at: now() });
    if (raw.activity_log.length > 500) raw.activity_log = raw.activity_log.slice(0, 500);
    save(raw);
  },
  recent(limit = 200) {
    return (load()?.activity_log || []).slice(0, limit);
  },
};

module.exports = { categories, items, orders, settings, activity };
