# BIZShop

Self-hosted ecommerce for Australian small businesses selling tools, 3D printed parts, electronics, and hardware. No SaaS subscription, no per-order fees — just run it on your own machine.

---

## What it does

- Product catalogue with categories, images, stock tracking, and SKUs
- Shopping cart and multi-step checkout with Australian GST (10%) calculated automatically
- Flexible shipping: always free, flat rate, or individual rates per state/territory
- Customer order tracking by email + order number — no account required
- Admin panel: dashboard, products, orders, inventory, customers, activity log, settings
- Low stock alerts via email when stock hits your configured threshold
- Packing slips and ATO-compliant tax invoices (with ABN)
- CSV export for orders (Xero/MYOB compatible) and bulk product import
- Backup and restore via the admin panel
- Auto-generated sitemap.xml and robots.txt

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v18+ |
| Framework | Express.js |
| Database | JSON flat-file (`store.json`) |
| File uploads | Multer |
| Email | Nodemailer (SMTP) |
| Frontend | Vanilla JS SPA (History API routing) |
| Charts | Chart.js v4 (CDN) |
| Auth | Session tokens + HttpOnly cookie |

No external database. All data lives in `store.json`.

---

## Getting started

**Requirements:** Node.js v18 or later. Port 3000 free (or set `PORT` env var).

```bash
npm install
node server.js
```

The terminal will show:

```
Store running at http://localhost:3000
Admin panel at  http://localhost:3000/admin
```

**Admin login:** go to `/admin`, enter the password from `auth.js` line 3.

> **Before going live** — change the admin password in `auth.js`, then restart the server.

---

## First-time setup

After logging in, head to **Settings** and fill in:

- Store Name, Tagline, ABN (required on tax invoices)
- Contact Email and Phone
- Street Address
- Shipping mode: Free / Flat Rate / By State
- Low Stock Threshold (default: 5)
- SMTP credentials if you want email alerts

Place a test order end-to-end to confirm everything works before pointing customers at it.

---

## File structure

```
BIZ/
├── server.js               App entry point — routes, middleware, sitemap
├── auth.js                 Session management and admin password
├── database.js             All data read/write — categories, items, orders, settings
├── mailer.js               Outgoing emails via Nodemailer
├── store.json              The database — back this up regularly!
├── package.json
├── generate-financial.js   Generates BIZShop-Financial-Evaluation.pdf
├── generate-manual.js      Generates BIZShop-Field-Manual.pdf
├── routes/
│   ├── items.js            Product API (incl. multi-image upload)
│   ├── categories.js       Category API
│   ├── orders.js           Order API (checkout, status, tracking)
│   ├── settings.js         Store settings API
│   └── activity.js         Activity log API
└── public/
    ├── index.html          Storefront SPA shell
    ├── admin.html          Admin panel shell
    ├── login.html          Admin login page
    ├── css/style.css       All styles — storefront and admin
    ├── js/app.js           Storefront SPA
    ├── js/admin.js         Admin panel logic
    └── uploads/            Uploaded product images
```

---

## API reference

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/categories` | No | List categories |
| POST | `/api/categories` | Yes | Create category |
| PUT | `/api/categories/:id` | Yes | Update category |
| DELETE | `/api/categories/:id` | Yes | Delete category (only if empty) |
| GET | `/api/items` | No | List products (filterable) |
| POST | `/api/items` | Yes | Create product (multipart) |
| PUT | `/api/items/:id` | Yes | Update product |
| DELETE | `/api/items/:id` | Yes | Deactivate or permanently delete |
| PATCH | `/api/items/:id/inventory` | Yes | Adjust stock |
| POST | `/api/orders` | No | Place an order (checkout) |
| GET | `/api/orders` | Yes | List all orders |
| GET | `/api/orders/lookup` | No | Customer order lookup |
| GET | `/api/orders/stats` | Yes | Dashboard stats |
| PATCH | `/api/orders/:id/status` | Yes | Update order status |
| PATCH | `/api/orders/:id/tracking` | Yes | Save tracking number |
| PATCH | `/api/orders/:id/admin-notes` | Yes | Save internal notes |
| GET | `/api/settings` | No | Get store settings |
| PUT | `/api/settings` | Yes | Save settings |
| GET | `/api/activity` | Yes | Activity log |
| GET | `/api/admin/backup` | Yes | Download store.json |
| POST | `/api/admin/restore` | Yes | Restore from backup file |

---

## Changing the admin password

Open `auth.js` and update line 3:

```js
const ADMIN_PASSWORD = 'YourNewPassword!';
```

Restart the server. Existing sessions stay alive until their 8-hour TTL expires — restart the server to clear them immediately.

---

## Keeping the server running

Use PM2 to run BIZShop as a background service that survives reboots:

```bash
npm install -g pm2
pm2 start server.js --name bizshop
pm2 save
pm2 startup   # follow the printed instruction to enable boot auto-start
```

Useful PM2 commands:

```bash
pm2 status
pm2 restart bizshop
pm2 logs bizshop
```

---

## Backups

The entire database is `store.json`. Back it up along with `public/uploads/`.

**Windows PowerShell:**
```powershell
$date = Get-Date -Format "yyyyMMdd"
Copy-Item store.json "store-backup-$date.json"
```

**Mac / Linux:**
```bash
cp store.json store-$(date +%Y%m%d).json
```

You can also download a backup anytime from **Admin → Settings → Backup & Restore**.

---

## Hosting options

| Option | Cost | Notes |
|---|---|---|
| Existing Windows PC | ~A$5/mo electricity | Good for getting started |
| VPS (Vultr / DigitalOcean) | A$12–18/mo | Recommended for always-on production |
| Shared hosting (Node.js) | A$8–20/mo | Budget option |

---

## GST and tax invoices

All product prices are entered **ex-GST**. BIZShop adds 10% GST at checkout and shows it as a separate line. Tax invoices include your ABN, itemised lines, GST total, and grand total — ATO compliant for registered businesses.

You must register for GST once your annual turnover hits A$75,000. Use the CSV export to get G1 and 1A figures for your BAS lodgement.

---

## PDF documents

Two reference documents can be generated with Node:

```bash
node generate-manual.js      # BIZShop-Field-Manual.pdf
node generate-financial.js   # BIZShop-Financial-Evaluation.pdf
```

These require `pdfkit` (`npm install pdfkit`).
