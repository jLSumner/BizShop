const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { ADMIN_PASSWORD, createSession, destroySession, parseCookies, requireAuth } = require('./auth');
const { activity } = require('./database');

const DB_PATH = path.join(__dirname, 'store.json');
const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) cb(null, true);
    else cb(new Error('Only JSON files are accepted'));
  },
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// admin login and logout — cookie-based, nothing too flash
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    const token = createSession();
    res.setHeader('Set-Cookie', `admin_session=${token}; HttpOnly; Path=/; Max-Age=${8 * 3600}`);
    activity.log('auth', 'Admin signed in');
    return res.redirect('/admin');
  }
  res.redirect('/admin/login?error=1');
});

app.post('/admin/logout', (req, res) => {
  const cookies = parseCookies(req);
  destroySession(cookies.admin_session);
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/admin/login');
});

// gotta be logged in to get past this one
app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// backup and restore — download or upload the whole store.json, sorted
app.get('/api/admin/backup', requireAuth, (req, res) => {
  if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: 'No data found' });
  const date = new Date().toISOString().slice(0, 10);
  res.download(DB_PATH, `bizshop-backup-${date}.json`);
});

app.post('/api/admin/restore', requireAuth, restoreUpload.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const data = JSON.parse(req.file.buffer.toString('utf8'));
    if (!Array.isArray(data.items) || !Array.isArray(data.categories)) {
      return res.status(400).json({ error: 'Invalid backup: missing items or categories arrays' });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    activity.log('settings', 'Database restored from backup file');
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Invalid or corrupt JSON file' });
  }
});

// API routes — reads are open to everyone, writes need a login
app.use('/api/categories', (req, res, next) => {
  if (req.method === 'GET') return next();
  requireAuth(req, res, next);
}, require('./routes/categories'));

app.use('/api/items', (req, res, next) => {
  if (req.method === 'GET') return next();
  requireAuth(req, res, next);
}, require('./routes/items'));

app.use('/api/orders', require('./routes/orders'));

app.use('/api/settings', require('./routes/settings'));

app.use('/api/activity', requireAuth, require('./routes/activity'));

// robots.txt — keeps bots out of the admin panel and API endpoints
app.get('/robots.txt', (req, res) => {
  const { settings } = require('./database');
  const s = settings.get();
  const base = s.website ? `https://${s.website}` : `http://localhost:${PORT}`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${base}/sitemap.xml\n`
  );
});

// sitemap — dynamically built fresh from your live catalogue, Google loves this
app.get('/sitemap.xml', (req, res) => {
  const { categories, items, settings } = require('./database');
  const s    = settings.get();
  const base = s.website ? `https://${s.website}` : `http://localhost:${PORT}`;
  const esc  = v => String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const today = new Date().toISOString().slice(0, 10);

  const cats     = categories.all();
  const products = items.all({ activeOnly: true });

  const urls = [
    { loc: `${base}/`,        changefreq: 'daily',   priority: '1.0', lastmod: today },
    { loc: `${base}/shop`,    changefreq: 'daily',   priority: '0.9', lastmod: today },
    { loc: `${base}/about`,   changefreq: 'monthly', priority: '0.5', lastmod: today },
    { loc: `${base}/contact`, changefreq: 'monthly', priority: '0.5', lastmod: today },
    { loc: `${base}/track`,   changefreq: 'yearly',  priority: '0.3', lastmod: today },
    ...cats.map(c => ({
      loc: `${base}/shop?category=${esc(c.slug)}`,
      changefreq: 'weekly', priority: '0.7', lastmod: today,
    })),
    ...products.map(p => ({
      loc: `${base}/product/${esc(p.id)}`,
      changefreq: 'weekly', priority: '0.6',
      lastmod: p.updated_at ? p.updated_at.slice(0, 10) : today,
    })),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(u =>
      `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    ),
    '</urlset>',
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});

// everything else is the SPA's problem — let the frontend router sort it out
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Store running at http://localhost:${PORT}`);
  console.log(`Admin panel at  http://localhost:${PORT}/admin`);
});
