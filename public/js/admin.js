// shared state for the whole admin panel
let categories = [];
let items = [];
let adminOrders = [];
let currentSection = 'dashboard';
let activeOrderStatus = '';
let currentOrderId = null;
let itemsPage = 1, itemsPerPage = 25;
let ordersPage = 1, ordersPerPage = 25;
let selectedImageFile = null;
let existingImageUrl = null;
let clearImageFlag = false;
let chartRevenue = null, chartStatus = null, chartTopProducts = null;
let storeSettings = {};

// drag-and-drop image upload zone — supports multiple files up to 10
let existingImages = [];
let newImageFiles  = [];

function initImageUpload() {
  const zone  = document.getElementById('imageUploadZone');
  const input = document.getElementById('imageFileInput');
  const drop  = document.getElementById('imgDropArea');
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    [...input.files].forEach(addImageFile);
    input.value = '';
  });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    [...e.dataTransfer.files].forEach(addImageFile);
  });
}

function addImageFile(file) {
  if (!file.type.startsWith('image/')) { showToast('Please select an image file', 'error'); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Image must be 5 MB or smaller', 'error'); return; }
  if (existingImages.length + newImageFiles.length >= 10) { showToast('Maximum 10 images per product', 'error'); return; }
  newImageFiles.push(file);
  renderImageGallery();
}

function removeExistingImage(idx) {
  existingImages.splice(idx, 1);
  renderImageGallery();
}

function removeNewImage(idx) {
  newImageFiles.splice(idx, 1);
  renderImageGallery();
}

let _blobUrls = [];
function renderImageGallery() {
  _blobUrls.forEach(u => URL.revokeObjectURL(u));
  _blobUrls = [];
  const gallery = document.getElementById('imageGallery');
  const total = existingImages.length + newImageFiles.length;
  if (!total) { gallery.innerHTML = ''; return; }

  const thumbs = [
    ...existingImages.map((url, i) => ({ src: url,                        remove: `removeExistingImage(${i})`, primary: i === 0 && !newImageFiles.length ? false : i === 0 })),
    ...newImageFiles.map((file, i)  => {
      const src = URL.createObjectURL(file);
      _blobUrls.push(src);
      const isPrimary = existingImages.length === 0 && i === 0;
      return { src, remove: `removeNewImage(${i})`, primary: isPrimary };
    }),
  ];
  if (thumbs.length) thumbs[0].primary = true;

  gallery.innerHTML = thumbs.map(t => `
    <div class="img-gallery-thumb${t.primary ? ' img-primary' : ''}">
      <img src="${t.src}" alt="" loading="lazy">
      ${t.primary ? '<div class="img-primary-badge">Primary</div>' : ''}
      <button type="button" class="img-thumb-remove" onclick="${t.remove}">✕</button>
    </div>`).join('');
}

// startup — wires up image upload, loads data, kicks off the dashboard
async function init() {
  initImageUpload();
  await Promise.all([loadCategories(), loadItems(), loadOrders(), loadSettings()]);
  loadDashboard();
  loadInventorySelect();
}

// store settings — reads from the API and populates the form, or saves it back
async function loadSettings() {
  storeSettings = await api('GET', '/api/settings');
}

function updateShippingModeUI() {
  const mode = document.getElementById('set-shipping_mode')?.value;
  const showFlat    = mode === 'flat' || mode === 'by_state';
  const showByState = mode === 'by_state';
  document.getElementById('shippingFlatField').style.display    = showFlat    ? '' : 'none';
  document.getElementById('shippingByStateFields').style.display = showByState ? '' : 'none';
}

function renderSettingsForm() {
  const fields = [
    'store_name','tagline','abn','contact_email','contact_phone','address','website','instagram','facebook',
    'low_stock_threshold','alert_email','smtp_host','smtp_port','smtp_user','smtp_pass',
    'shipping_mode','shipping_flat_rate','shipping_free_threshold',
    'shipping_NSW','shipping_VIC','shipping_QLD','shipping_SA','shipping_WA','shipping_TAS','shipping_ACT','shipping_NT',
  ];
  fields.forEach(f => {
    const el = document.getElementById(`set-${f}`);
    if (el) el.value = storeSettings[f] || '';
  });
  updateShippingModeUI();
}

async function saveSettings() {
  const fields = [
    'store_name','tagline','abn','contact_email','contact_phone','address','website','instagram','facebook',
    'low_stock_threshold','alert_email','smtp_host','smtp_port','smtp_user','smtp_pass',
    'shipping_mode','shipping_flat_rate','shipping_free_threshold',
    'shipping_NSW','shipping_VIC','shipping_QLD','shipping_SA','shipping_WA','shipping_TAS','shipping_ACT','shipping_NT',
  ];
  const body = {};
  fields.forEach(f => { body[f] = document.getElementById(`set-${f}`)?.value || ''; });
  try {
    storeSettings = await api('PUT', '/api/settings', body);
    showToast('Settings saved', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

async function handleRestoreFile(input) {
  const file = input.files[0];
  if (!file) return;
  if (!confirm(`Restore from "${file.name}"?\n\nThis will permanently replace ALL current data (products, orders, settings). This cannot be undone.`)) {
    input.value = '';
    return;
  }
  const fd = new FormData();
  fd.append('backup', file);
  try {
    const res = await fetch('/api/admin/restore', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Restore failed');
    showToast('Restore complete — reloading…', 'success');
    setTimeout(() => location.reload(), 1500);
  } catch (err) {
    showToast(err.message, 'error');
  }
  input.value = '';
}

// navigation — switches between sections and updates the sidebar active state
const sectionTitles = { dashboard: 'Dashboard', categories: 'Categories', items: 'Items', inventory: 'Inventory', orders: 'Orders', customers: 'Customers', activity: 'Activity Log', settings: 'Settings' };

function showSection(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-nav a[id^="nav-"]').forEach(a => a.classList.remove('active'));
  document.getElementById(`section-${name}`).classList.add('active');
  document.getElementById(`nav-${name}`).classList.add('active');
  const el = document.getElementById('topbarTitle');
  if (el) el.textContent = sectionTitles[name] || name;
  currentSection = name;
  if (name === 'dashboard') loadDashboard();
  if (name === 'categories') renderCatTable();
  if (name === 'items') renderItemTable();
  if (name === 'inventory') loadInventorySelect();
  if (name === 'orders') renderOrderTable();
  if (name === 'customers') renderCustomerList();
  if (name === 'settings') renderSettingsForm();
  if (name === 'activity') loadActivity();
  return false;
}

// activity log — fetches, filters by type, and paginates the event history
let activityData = [];
let activityFilter = '';
let activityPage = 1;
let activityPerPage = 25;

function adminPageRange(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4)         return [1, 2, 3, 4, 5, '...', total];
  if (cur >= total - 3) return [1, '...', total-4, total-3, total-2, total-1, total];
  return [1, '...', cur-1, cur, cur+1, '...', total];
}

function renderAdminPagination(page, pages, total, setFn) {
  if (pages <= 1) return '';
  const start = (page - 1) * activityPerPage;
  const end   = Math.min(start + activityPerPage, total);
  const range = adminPageRange(page, pages);
  const btns  = [`<span class="pg-info">${start+1}–${end} of ${total}</span>`];
  btns.push(`<button class="pg-btn" ${page===1?'disabled':''} onclick="${setFn}(${page-1})">&#8249;</button>`);
  range.forEach(p => {
    if (p === '...') btns.push('<span class="pg-ellipsis">…</span>');
    else btns.push(`<button class="pg-btn${p===page?' active':''}" onclick="${setFn}(${p})">${p}</button>`);
  });
  btns.push(`<button class="pg-btn" ${page===pages?'disabled':''} onclick="${setFn}(${page+1})">&#8250;</button>`);
  return `<div class="pagination">${btns.join('')}</div>`;
}

function setActivityPage(n) { activityPage = n; renderActivity(); }
function setActivityPerPage(n) { activityPerPage = parseInt(n); activityPage = 1; renderActivity(); }
function setItemsPage(n) { itemsPage = n; renderItemTable(); }
function setItemsPerPage(n) { itemsPerPage = parseInt(n); itemsPage = 1; renderItemTable(); }
function setOrdersPage(n) { ordersPage = n; renderOrderTable(); }
function setOrdersPerPage(n) { ordersPerPage = parseInt(n); ordersPage = 1; renderOrderTable(); }

async function loadActivity() {
  try {
    activityData = await api('GET', '/api/activity');
    renderActivity();
  } catch (e) {
    const tl = document.getElementById('activityTimeline');
    if (tl) tl.innerHTML = '<div class="activity-empty">Failed to load activity log.</div>';
  }
}

function setActivityFilter(type) {
  activityFilter = type;
  activityPage = 1;
  document.querySelectorAll('#activityFilterTabs .act-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  renderActivity();
}

function renderActivity() {
  const tl = document.getElementById('activityTimeline');
  const pgEl = document.getElementById('activityPagination');
  if (!tl) return;
  const filtered = activityFilter ? activityData.filter(e => e.type === activityFilter) : activityData;
  if (filtered.length === 0) {
    tl.innerHTML = '<div class="activity-empty">No activity recorded yet.</div>';
    if (pgEl) pgEl.innerHTML = '';
    return;
  }
  const total  = filtered.length;
  const pages  = Math.max(1, Math.ceil(total / activityPerPage));
  if (activityPage > pages) activityPage = pages;
  const start  = (activityPage - 1) * activityPerPage;
  const paged  = filtered.slice(start, start + activityPerPage);
  const icons  = { order: '🛒', item: '📦', category: '🗂️', inventory: '🔢', settings: '⚙️', auth: '🔐' };
  tl.innerHTML = paged.map(e => `
    <div class="activity-entry act-type-${e.type}">
      <div class="act-dot"><span class="act-icon">${icons[e.type] || '📋'}</span></div>
      <div class="act-body">
        <div class="act-message">${e.message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <div class="act-time">${fmtActivityTime(e.created_at)}</div>
      </div>
    </div>
  `).join('');
  if (pgEl) pgEl.innerHTML = renderAdminPagination(activityPage, pages, total, 'setActivityPage');
}

function fmtActivityTime(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// thin JSON fetch wrappers — throws on non-OK responses so callers can catch
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function fmt(n) { return parseFloat(n).toFixed(2); }
function fmtDate(d) { return new Date(d).toLocaleString(); }
function fmtStatus(s) { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

// dashboard charts — revenue trend, order status doughnut, and top products bar
function loadCharts() {
  buildRevenueChart();
  buildStatusChart();
  buildTopProductsChart();
}

function buildRevenueChart() {
  const labels = [], data = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }));
    const rev = adminOrders
      .filter(o => o.status !== 'cancelled' && o.created_at.slice(0, 10) === key)
      .reduce((s, o) => s + o.total, 0);
    data.push(Math.round(rev * 100) / 100);
  }
  if (chartRevenue) chartRevenue.destroy();
  const ctx = document.getElementById('chartRevenue')?.getContext('2d');
  if (!ctx) return;
  chartRevenue = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data,
        borderColor: '#e11d48',
        backgroundColor: 'rgba(225,29,72,.07)',
        borderWidth: 2,
        pointRadius: data.some(v => v > 0) ? 3 : 0,
        pointBackgroundColor: '#e11d48',
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' A$' + ctx.parsed.y.toFixed(2) } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { callback: v => 'A$' + v, font: { size: 11 } }, grid: { color: '#f1f5f9' } }
      }
    }
  });
}

function buildStatusChart() {
  const statuses = ['pending','processing','shipped','delivered','cancelled'];
  const colors   = ['#d97706','#2563eb','#7c3aed','#16a34a','#94a3b8'];
  const counts   = statuses.map(s => adminOrders.filter(o => o.status === s).length);
  if (chartStatus) chartStatus.destroy();
  const ctx = document.getElementById('chartStatus')?.getContext('2d');
  if (!ctx) return;
  chartStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: statuses.map(s => s[0].toUpperCase() + s.slice(1)),
      datasets: [{ data: counts, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true,
      cutout: '62%',
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 11, padding: 10 } } }
    }
  });
}

function buildTopProductsChart() {
  const rev = {};
  adminOrders.filter(o => o.status !== 'cancelled').forEach(o => {
    (o.items || []).forEach(l => { rev[l.name] = (rev[l.name] || 0) + l.price * l.qty; });
  });
  const sorted = Object.entries(rev).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (chartTopProducts) chartTopProducts.destroy();
  const ctx = document.getElementById('chartTopProducts')?.getContext('2d');
  if (!ctx) return;
  if (!sorted.length) {
    ctx.canvas.parentElement.innerHTML = '<p style="text-align:center;color:var(--muted);padding:2rem;font-size:.82rem">No sales data yet</p>';
    return;
  }
  chartTopProducts = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(([n]) => n),
      datasets: [{ label: 'Revenue', data: sorted.map(([, v]) => Math.round(v * 100) / 100), backgroundColor: '#e11d48', borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' A$' + ctx.parsed.x.toFixed(2) } } },
      scales: {
        x: { beginAtZero: true, ticks: { callback: v => 'A$' + v, font: { size: 11 } }, grid: { color: '#f1f5f9' } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

// dashboard — summary stats, low stock table, and kicks off the charts
function loadDashboard() {
  const active = items.filter(i => i.active);
  document.getElementById('statItems').textContent = active.length;
  document.getElementById('statCats').textContent = categories.length;
  document.getElementById('statOrders').textContent = adminOrders.length;
  const pending = adminOrders.filter(o => o.status === 'pending').length;
  document.getElementById('statPending').textContent = pending;
  const revenue = adminOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  document.getElementById('statRevenue').textContent = 'A$' + revenue.toFixed(2);

  const badge = document.getElementById('pendingBadge');
  if (badge) { badge.textContent = pending; badge.style.display = pending > 0 ? '' : 'none'; }

  const low = items.filter(i => i.active && i.stock <= 5).sort((a, b) => a.stock - b.stock);
  document.getElementById('lowStockTable').innerHTML = low.length
    ? low.map(i => `
        <tr>
          <td>${i.name}</td>
          <td>${i.category_name}</td>
          <td class="${i.stock <= 0 ? 'stock-out' : 'stock-low'}">${i.stock}</td>
          <td>${i.sku || '—'}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" style="color:#777;text-align:center;padding:1.5rem">All items have sufficient stock ✓</td></tr>';

  loadCharts();
}

// categories — load, render the table, and manage create/edit modals
async function loadCategories() {
  categories = await api('GET', '/api/categories');
  renderCatTable();
  populateCatDropdowns();
}

function renderCatTable() {
  document.getElementById('catTable').innerHTML = categories.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td><code style="font-size:.8rem;color:#555">${c.slug}</code></td>
      <td>${c.description || '<span style="color:#aaa">—</span>'}</td>
      <td>${c.item_count}</td>
      <td class="actions">
        <button class="btn btn-sm btn-secondary" onclick="openCatModal('${c.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteCat('${c.id}', '${c.name.replace(/'/g, "\\'")}', ${c.item_count})">Delete</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" style="color:#aaa;text-align:center;padding:1.5rem">No categories yet</td></tr>';
}

function populateCatDropdowns() {
  const opts = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('itemCatId').innerHTML = opts;
  const filter = document.getElementById('itemFilterCat');
  filter.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option value="${c.slug}">${c.name}</option>`).join('');
}

function openCatModal(id) {
  document.getElementById('catModalTitle').textContent = id ? 'Edit Category' : 'New Category';
  document.getElementById('catId').value = id || '';
  if (id) {
    const cat = categories.find(c => c.id === id);
    document.getElementById('catName').value = cat.name;
    document.getElementById('catDesc').value = cat.description || '';
  } else {
    document.getElementById('catName').value = '';
    document.getElementById('catDesc').value = '';
  }
  document.getElementById('catModalOverlay').classList.add('open');
  document.getElementById('catName').focus();
}

function closeCatModal() { document.getElementById('catModalOverlay').classList.remove('open'); }

async function saveCat() {
  const id = document.getElementById('catId').value;
  const body = { name: document.getElementById('catName').value, description: document.getElementById('catDesc').value };
  try {
    if (id) { await api('PUT', `/api/categories/${id}`, body); showToast('Category updated', 'success'); }
    else     { await api('POST', '/api/categories', body); showToast('Category created', 'success'); }
    closeCatModal();
    await loadCategories();
    loadDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteCat(id, name, count) {
  if (count > 0) { showToast(`"${name}" has ${count} item(s) — reassign or delete them first`, 'error'); return; }
  if (!confirm(`Delete category "${name}"?`)) return;
  try {
    await api('DELETE', `/api/categories/${id}`);
    showToast('Category deleted', 'success');
    await loadCategories();
    loadDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

// items/products — table, search/filter, create and edit modals
async function loadItems() {
  itemsPage = 1;
  const searchEl = document.getElementById('itemSearch');
  if (searchEl) searchEl.value = '';
  const catSlug = document.getElementById('itemFilterCat')?.value || '';
  const activeFilter = document.getElementById('itemFilterActive')?.value || '';
  let url = '/api/items';
  const params = [];
  if (catSlug) params.push(`category=${catSlug}`);
  if (activeFilter === 'all') params.push('active=all');
  if (params.length) url += '?' + params.join('&');
  items = await api('GET', url);
  renderItemTable();
  loadInventorySelect();
}

function renderItemTable() {
  const q = (document.getElementById('itemSearch')?.value || '').toLowerCase().trim();
  const filtered = q
    ? items.filter(i => i.name.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q))
    : items;
  const total  = filtered.length;
  const pages  = Math.max(1, Math.ceil(total / itemsPerPage));
  if (itemsPage > pages) itemsPage = pages;
  const start  = (itemsPage - 1) * itemsPerPage;
  const paged  = filtered.slice(start, start + itemsPerPage);

  document.getElementById('itemTable').innerHTML = paged.map(i => `
    <tr>
      <td>
        ${i.image_url ? `<img class="item-thumb" src="${i.image_url}" alt="">` : ''}
        <strong>${i.name}</strong>
        ${i.featured ? ' <span title="Featured on homepage" style="font-size:.78rem">⭐</span>' : ''}
      </td>
      <td>${i.category_name}</td>
      <td>A$${fmt(i.price)}</td>
      <td class="${i.stock <= 0 ? 'stock-out' : i.stock <= 5 ? 'stock-low' : 'stock-ok'}">${i.stock}</td>
      <td>${i.sku || '<span style="color:#aaa">—</span>'}</td>
      <td><span class="badge-${i.active ? 'active' : 'inactive'}">${i.active ? 'Active' : 'Hidden'}</span></td>
      <td class="actions">
        <button class="btn btn-sm btn-secondary" onclick="openItemModal('${i.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteItem('${i.id}', '${i.name.replace(/'/g, "\\'")}', ${i.active})">
          ${i.active ? 'Hide' : 'Delete'}
        </button>
      </td>
    </tr>`).join('') || '<tr><td colspan="7" style="color:#aaa;text-align:center;padding:1.5rem">No items found</td></tr>';

  const pgEl = document.getElementById('itemsPagination');
  if (pgEl) pgEl.innerHTML = renderAdminPagination(itemsPage, pages, total, 'setItemsPage');
}

function openItemModal(id) {
  selectedImageFile = null;
  clearImageFlag = false;
  existingImageUrl = null;

  document.getElementById('itemModalTitle').textContent = id ? 'Edit Item' : 'New Item';
  document.getElementById('itemId').value = id || '';
  document.getElementById('itemActiveGroup').style.display = id ? 'block' : 'none';

  if (id) {
    const item = items.find(i => i.id === id);
    document.getElementById('itemCatId').value = item.category_id;
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemDesc').value = item.description || '';
    document.getElementById('itemPrice').value = item.price;
    document.getElementById('itemStock').value = item.stock;
    document.getElementById('itemSku').value = item.sku || '';
    document.getElementById('itemActive').checked = !!item.active;
    document.getElementById('itemFeatured').checked = !!item.featured;
    existingImages = item.images?.length ? [...item.images] : (item.image_url ? [item.image_url] : []);
    newImageFiles  = [];
    renderImageGallery();
  } else {
    document.getElementById('itemCatId').selectedIndex = 0;
    document.getElementById('itemName').value = '';
    document.getElementById('itemDesc').value = '';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemStock').value = '';
    document.getElementById('itemSku').value = '';
    existingImages = []; newImageFiles = []; renderImageGallery();
    document.getElementById('itemActive').checked = true;
    document.getElementById('itemFeatured').checked = false;
  }
  document.getElementById('itemModalOverlay').classList.add('open');
  document.getElementById('itemName').focus();
}

function closeItemModal() { document.getElementById('itemModalOverlay').classList.remove('open'); }

async function saveItem() {
  const id = document.getElementById('itemId').value;
  const name = document.getElementById('itemName').value;
  const price = document.getElementById('itemPrice').value;
  if (!name || !price) { showToast('Name and price are required', 'error'); return; }

  const fd = new FormData();
  fd.append('category_id', document.getElementById('itemCatId').value);
  fd.append('name', name);
  fd.append('description', document.getElementById('itemDesc').value);
  fd.append('price', price);
  fd.append('stock', document.getElementById('itemStock').value || 0);
  fd.append('sku', document.getElementById('itemSku').value);
  fd.append('active',   document.getElementById('itemActive').checked   ? 'true' : 'false');
  fd.append('featured', document.getElementById('itemFeatured').checked ? 'true' : 'false');
  existingImages.forEach(url => fd.append('existing_images', url));
  newImageFiles.forEach(file => fd.append('images', file));

  try {
    const res = await fetch(id ? `/api/items/${id}` : '/api/items', {
      method: id ? 'PUT' : 'POST',
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    showToast(id ? 'Item updated' : 'Item created', 'success');
    closeItemModal();
    await loadItems();
    loadDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

async function deleteItem(id, name, active) {
  if (active) {
    if (!confirm(`Hide "${name}" from the store? (soft delete)`)) return;
    await api('DELETE', `/api/items/${id}`);
    showToast(`"${name}" is now hidden`, 'success');
  } else {
    if (!confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    await api('DELETE', `/api/items/${id}?hard=true`);
    showToast(`"${name}" deleted`, 'success');
  }
  await loadItems();
  loadDashboard();
}

// inventory — stock adjustments and adjustment history per product
function loadInventorySelect() {
  const sel = document.getElementById('invItemSelect');
  const prev = sel.value;
  sel.innerHTML = '<option value="">Select an item…</option>' +
    items.filter(i => i.active).map(i => `<option value="${i.id}">${i.name} (stock: ${i.stock})</option>`).join('');
  if (prev) sel.value = prev;
}

document.getElementById('invItemSelect').addEventListener('change', async function() {
  const id = this.value;
  const panel = document.getElementById('invPanel');
  if (!id) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  await refreshInvPanel(id);
});

async function refreshInvPanel(id) {
  const data = await api('GET', `/api/items/${id}/inventory`);
  document.getElementById('invCurrentStock').textContent = data.item.stock;
  document.getElementById('invChange').value = '';
  document.getElementById('invReason').value = '';
  document.getElementById('invLogTable').innerHTML = data.log.length
    ? data.log.map(l => `
        <tr>
          <td>${fmtDate(l.created_at)}</td>
          <td class="${l.change > 0 ? 'change-pos' : 'change-neg'}">${l.change > 0 ? '+' : ''}${l.change}</td>
          <td>${l.stock_after}</td>
          <td>${l.reason || '—'}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" style="color:#aaa;text-align:center;padding:1rem">No log entries</td></tr>';
}

async function applyInventory() {
  const id = document.getElementById('invItemSelect').value;
  const change = document.getElementById('invChange').value;
  const reason = document.getElementById('invReason').value;
  if (!id) { showToast('Select an item first', 'error'); return; }
  if (!change || isNaN(change) || parseInt(change) === 0) { showToast('Enter a non-zero adjustment', 'error'); return; }
  try {
    await api('PATCH', `/api/items/${id}/inventory`, { change: parseInt(change), reason });
    showToast(`Stock updated`, 'success');
    await loadItems();
    loadInventorySelect();
    await refreshInvPanel(id);
    loadDashboard();
  } catch (err) { showToast(err.message, 'error'); }
}

// packing slip — opens a print-ready HTML page in a new tab, built from the order
function printPackingSlip() {
  if (!currentOrderId) return;
  const o = adminOrders.find(o => o.id === currentOrderId);
  if (!o) return;

  const slipSubtotal  = o.subtotal ?? o.total;
  const slipGst       = o.gst ?? null;
  const slipShipping  = o.shipping_cost || 0;

  const rows = (o.items || []).map(l => `
    <tr>
      <td>${l.name}${l.sku ? `<br><span class="sku">${l.sku}</span>` : ''}</td>
      <td class="center">${l.qty}</td>
      <td class="right">A$${l.price.toFixed(2)}</td>
      <td class="right">A$${(l.price * l.qty).toFixed(2)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Packing Slip — ${o.order_number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #111; padding: 32px; max-width: 720px; margin: 0 auto; }
  .slip-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 20px; }
  .store-name { font-size: 22px; font-weight: 800; letter-spacing: -.5px; }
  .store-tag { font-size: 11px; color: #555; margin-top: 2px; }
  .order-meta { text-align: right; }
  .order-num { font-size: 16px; font-weight: 700; }
  .order-date { font-size: 11px; color: #555; margin-top: 3px; }
  .status-pill { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; background: #f1f5f9; border: 1px solid #cbd5e1; }
  .address-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .address-box h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #777; margin-bottom: 6px; }
  .address-box p { line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { border-bottom: 2px solid #111; }
  thead th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #555; padding: 6px 8px; text-align: left; }
  tbody tr { border-bottom: 1px solid #e2e8f0; }
  tbody td { padding: 9px 8px; vertical-align: top; }
  .sku { font-size: 10px; color: #888; font-family: monospace; }
  .center { text-align: center; }
  .right { text-align: right; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  .totals-box { min-width: 220px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .totals-row.total { border-top: 2px solid #111; margin-top: 4px; padding-top: 8px; font-weight: 700; font-size: 15px; }
  .notes-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 24px; font-size: 12px; color: #444; }
  .notes-box h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #777; margin-bottom: 5px; }
  .slip-footer { border-top: 1px solid #e2e8f0; padding-top: 14px; text-align: center; font-size: 11px; color: #888; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>

<div class="slip-header">
  <div>
    <div class="store-name">${storeSettings.store_name || 'BIZ Shop'}</div>
    <div class="store-tag">${storeSettings.tagline || 'Tools &amp; 3D Printed Parts · Australia'}</div>
  </div>
  <div class="order-meta">
    <div class="order-num">${o.order_number}</div>
    <div class="order-date">${new Date(o.created_at).toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' })}</div>
    <span class="status-pill">${o.status.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
  </div>
</div>

<div class="address-grid">
  <div class="address-box">
    <h3>Bill / Ship To</h3>
    <p>
      <strong>${o.customer_name}</strong><br>
      ${o.shipping_address}<br>
      ${o.shipping_city} ${o.shipping_state} ${o.shipping_zip}<br>
      ${o.shipping_country}
    </p>
  </div>
  <div class="address-box">
    <h3>Contact</h3>
    <p>
      ${o.customer_email}<br>
      ${o.customer_phone || '—'}
    </p>
  </div>
</div>

<table>
  <thead>
    <tr><th>Item</th><th class="center">Qty</th><th class="right">Unit Price</th><th class="right">Subtotal</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="totals">
  <div class="totals-box">
    <div class="totals-row"><span>Subtotal${slipGst != null ? ' (ex. GST)' : ''}</span><span>A$${slipSubtotal.toFixed(2)}</span></div>
    ${slipGst != null ? `<div class="totals-row"><span>GST (10%)</span><span>A$${slipGst.toFixed(2)}</span></div>` : ''}
    <div class="totals-row"><span>Shipping</span><span>${slipShipping > 0 ? `A$${slipShipping.toFixed(2)}` : 'Free'}</span></div>
    <div class="totals-row total"><span>Total${slipGst != null ? ' (inc. GST)' : ''}</span><span>A$${o.total.toFixed(2)}</span></div>
  </div>
</div>

${o.notes ? `<div class="notes-box"><h3>Order Notes</h3>${o.notes}</div>` : ''}

<div class="slip-footer">Thank you for your order! · ${storeSettings.website || 'bizshop.com.au'}</div>

</body>
</html>`;

  const w = window.open('', '_blank', 'width=780,height=900');
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

// ATO-compliant tax invoice — includes ABN, GST breakdown, all the bits the taxman wants
function printInvoice() {
  if (!currentOrderId) return;
  const o = adminOrders.find(o => o.id === currentOrderId);
  if (!o) return;

  const invSubtotal  = o.subtotal ?? o.total;
  const invGst       = o.gst ?? null;
  const invShipping  = o.shipping_cost || 0;

  const rows = (o.items || []).map(l => `
    <tr>
      <td>${l.name}${l.sku ? `<br><span class="sku">${l.sku}</span>` : ''}</td>
      <td class="center">${l.qty}</td>
      <td class="right">A$${l.price.toFixed(2)}</td>
      <td class="right">A$${(l.price * l.qty).toFixed(2)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Tax Invoice — ${o.order_number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #111; padding: 36px; max-width: 720px; margin: 0 auto; }
  .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
  .store-block { display: flex; flex-direction: column; gap: 4px; }
  .store-name { font-size: 24px; font-weight: 800; letter-spacing: -.5px; }
  .store-detail { font-size: 11px; color: #555; line-height: 1.7; }
  .inv-title-block { text-align: right; }
  .inv-title { font-size: 20px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #111; }
  .inv-meta { font-size: 11px; color: #555; margin-top: 5px; line-height: 1.8; }
  .inv-meta strong { color: #111; }
  .status-pill { display: inline-block; margin-top: 6px; padding: 2px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; background: #f1f5f9; border: 1px solid #cbd5e1; }
  hr { border: none; border-top: 2px solid #111; margin: 0 0 22px; }
  .bill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .bill-box h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 7px; }
  .bill-box p { line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { border-bottom: 2px solid #111; }
  thead th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #555; padding: 6px 8px; text-align: left; }
  tbody tr { border-bottom: 1px solid #e2e8f0; }
  tbody td { padding: 9px 8px; vertical-align: top; line-height: 1.4; }
  .sku { font-size: 10px; color: #999; font-family: monospace; }
  .center { text-align: center; }
  .right { text-align: right; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totals-box { min-width: 240px; border-top: 1px solid #e2e8f0; }
  .totals-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
  .totals-row.total { border-top: 2px solid #111; border-bottom: none; margin-top: 4px; padding-top: 9px; font-weight: 800; font-size: 15px; }
  .totals-row.gst-note { font-size: 11px; color: #888; border-bottom: none; padding-top: 8px; }
  .notes-box { background: #f8fafc; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 12px; color: #444; }
  .notes-box h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 5px; }
  .inv-footer { border-top: 1px solid #e2e8f0; padding-top: 14px; display: flex; justify-content: space-between; font-size: 11px; color: #888; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>

<div class="inv-header">
  <div class="store-block">
    <div class="store-name">${storeSettings.store_name || 'BIZ Shop'}</div>
    <div class="store-detail">
      ${storeSettings.tagline || 'Tools &amp; 3D Printed Parts · Australia'}
      ${storeSettings.address ? `<br>${storeSettings.address}` : ''}
      ${storeSettings.abn ? `<br>ABN: ${storeSettings.abn}` : ''}
    </div>
  </div>
  <div class="inv-title-block">
    <div class="inv-title">Tax Invoice</div>
    <div class="inv-meta">
      <strong>Invoice #</strong> ${o.order_number}<br>
      <strong>Date</strong> ${new Date(o.created_at).toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' })}<br>
      <strong>Due</strong> Paid
    </div>
    <span class="status-pill">${o.status.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
  </div>
</div>

<hr>

<div class="bill-grid">
  <div class="bill-box">
    <h3>Bill To</h3>
    <p>
      <strong>${o.customer_name}</strong><br>
      ${o.shipping_address}<br>
      ${o.shipping_city} ${o.shipping_state} ${o.shipping_zip}<br>
      ${o.shipping_country}
    </p>
  </div>
  <div class="bill-box">
    <h3>Contact</h3>
    <p>
      ${o.customer_email}<br>
      ${o.customer_phone || '—'}
    </p>
  </div>
</div>

<table>
  <thead>
    <tr><th>Description</th><th class="center">Qty</th><th class="right">Unit Price</th><th class="right">Amount</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="totals">
  <div class="totals-box">
    <div class="totals-row"><span>Subtotal${invGst != null ? ' (ex. GST)' : ''}</span><span>A$${invSubtotal.toFixed(2)}</span></div>
    ${invGst != null ? `<div class="totals-row"><span>GST (10%)</span><span>A$${invGst.toFixed(2)}</span></div>` : ''}
    <div class="totals-row"><span>Shipping</span><span>${invShipping > 0 ? `A$${invShipping.toFixed(2)}` : 'Free'}</span></div>
    <div class="totals-row total"><span>Total${invGst != null ? ' (inc. GST)' : ''}</span><span>A$${o.total.toFixed(2)}</span></div>
    ${invGst != null ? `<div class="totals-row gst-note"><span colspan="2">GST included: A$${invGst.toFixed(2)}</span></div>` : ''}
  </div>
</div>

${o.notes ? `<div class="notes-box"><h3>Notes</h3>${o.notes}</div>` : ''}

<div class="inv-footer">
  <span>Thank you for your business!</span>
  <span>${storeSettings.website || 'bizshop.com.au'}</span>
</div>

</body>
</html>`;

  const w = window.open('', '_blank', 'width=780,height=900');
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

// exports orders to CSV — respects the active status filter tab, Xero-friendly format
function exportOrdersCSV() {
  let rows = activeOrderStatus
    ? adminOrders.filter(o => o.status === activeOrderStatus)
    : adminOrders;

  const fromVal = document.getElementById('exportDateFrom')?.value;
  const toVal   = document.getElementById('exportDateTo')?.value;
  if (fromVal) {
    const from = new Date(fromVal + 'T00:00:00');
    rows = rows.filter(o => new Date(o.created_at) >= from);
  }
  if (toVal) {
    const to = new Date(toVal + 'T23:59:59');
    rows = rows.filter(o => new Date(o.created_at) <= to);
  }

  if (!rows.length) { showToast('No orders in selected range', 'error'); return; }

  const csvCell = v => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[,"\n]/.test(s) ? `"${s}"` : s;
  };

  const headers = [
    'Order #','Date','Status',
    'Customer Name','Email','Phone',
    'Street','Suburb','State','Postcode','Country',
    'Items','Subtotal (ex-GST)','GST','Shipping','Total (AUD)','Tracking #'
  ];

  const lines = rows.map(o => [
    o.order_number,
    new Date(o.created_at).toLocaleDateString('en-AU'),
    o.status,
    o.customer_name,
    o.customer_email,
    o.customer_phone || '',
    o.shipping_address,
    o.shipping_city,
    o.shipping_state,
    o.shipping_zip,
    o.shipping_country,
    (o.items || []).map(l => `${l.name} x${l.qty}`).join('; '),
    (o.subtotal ?? '').toString(),
    (o.gst ?? '').toString(),
    (o.shipping_cost ?? 0).toFixed(2),
    o.total.toFixed(2),
    o.tracking_number || '',
  ].map(csvCell).join(','));

  const csv = [headers.join(','), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  const label = activeOrderStatus || 'all';
  a.href = url;
  a.download = `orders-${label}-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${rows.length} order${rows.length !== 1 ? 's' : ''}`, 'success');
}


// bulk product import via CSV — matches by SKU, creates new or updates existing
let importParsed = [];

function openImportModal() {
  importParsed = [];
  document.getElementById('importCsvFile').value = '';
  document.getElementById('importPreview').style.display = 'none';
  document.getElementById('importResult').innerHTML = '';
  document.getElementById('importSubmitBtn').style.display = 'none';
  document.getElementById('importModalOverlay').classList.add('open');
}

function closeImportModal() {
  document.getElementById('importModalOverlay').classList.remove('open');
}

function downloadImportTemplate() {
  const headers = 'name,category,description,price,stock,sku,featured,active';
  const ex = '"Hex Key Set","Hand Tools","9-piece metric chrome vanadium",12.99,24,"TL-HEX-001",no,yes';
  const csv = headers + '\r\n' + ex;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'import-template.csv'; a.click();
  URL.revokeObjectURL(url);
}

function handleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const rows = parseCSVText(e.target.result);
    if (rows.length < 2) { showToast('CSV appears empty or has no data rows', 'error'); return; }
    const headers = rows[0].map(h => h.trim().toLowerCase());
    importParsed = rows.slice(1)
      .filter(r => r.some(c => c.trim()))
      .map(row => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = (row[i] || '').trim());
        return obj;
      });
    showImportPreview(headers, importParsed);
  };
  reader.readAsText(file);
}

function parseCSVText(text) {
  const rows = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { cells.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

function showImportPreview(headers, rows) {
  const previewHeaders = ['name','category','price','stock','sku'];
  document.getElementById('importPreviewTable').innerHTML = `
    <table>
      <thead><tr>${previewHeaders.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.slice(0, 5).map(r =>
        `<tr>${previewHeaders.map(h => `<td>${r[h] || ''}</td>`).join('')}</tr>`
      ).join('')}</tbody>
    </table>`;
  document.getElementById('importPreviewCount').textContent =
    `${rows.length} row${rows.length !== 1 ? 's' : ''} ready to import${rows.length > 5 ? ' (showing first 5)' : ''}.`;
  document.getElementById('importPreview').style.display = 'block';
  document.getElementById('importSubmitBtn').style.display = '';
}

async function submitImport() {
  if (!importParsed.length) return;
  const btn = document.getElementById('importSubmitBtn');
  btn.disabled = true; btn.textContent = 'Importing…';
  try {
    const result = await api('POST', '/api/items/import', { rows: importParsed });
    const parts = [];
    if (result.created) parts.push(`<span style="color:var(--success)">✓ ${result.created} created</span>`);
    if (result.updated) parts.push(`<span style="color:var(--accent)">↻ ${result.updated} updated</span>`);
    const errHtml = result.errors.length
      ? `<ul style="margin:.4rem 0 0 1rem;font-size:.78rem;color:#dc2626">${result.errors.map(e => `<li>${e}</li>`).join('')}</ul>`
      : '';
    document.getElementById('importResult').innerHTML = `
      <div style="padding:.75rem;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:.75rem;font-size:.875rem;">
        ${parts.join(' &nbsp;')}
        ${result.errors.length ? `<div style="color:#dc2626;margin-top:.3rem;">✗ ${result.errors.length} error${result.errors.length !== 1 ? 's' : ''}${errHtml}</div>` : ''}
      </div>`;
    if (result.created > 0 || result.updated > 0) {
      await loadItems();
      showToast(`Import done: ${result.created} created, ${result.updated} updated`, 'success');
    }
  } catch (err) { showToast(err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Import Products'; }
}

// orders — list view, detail modal, status changes, and customer-facing emails
const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'return_requested', 'refunded'];

async function loadOrders() {
  adminOrders = await api('GET', '/api/orders').catch(() => []);
  renderOrderTable();
}

function renderOrderTable() {
  const filtered = activeOrderStatus ? adminOrders.filter(o => o.status === activeOrderStatus) : adminOrders;
  const total  = filtered.length;
  const pages  = Math.max(1, Math.ceil(total / ordersPerPage));
  if (ordersPage > pages) ordersPage = pages;
  const start  = (ordersPage - 1) * ordersPerPage;
  const paged  = filtered.slice(start, start + ordersPerPage);

  document.getElementById('orderTable').innerHTML = paged.length
    ? paged.map(o => `
        <tr>
          <td><strong style="font-family:monospace;font-size:.8rem">${o.order_number}</strong></td>
          <td>
            <div style="font-weight:600;font-size:.875rem">${o.customer_name}</div>
            <div style="font-size:.75rem;color:var(--muted)">${o.customer_email}</div>
          </td>
          <td style="font-size:.8rem;color:var(--muted);white-space:nowrap">${new Date(o.created_at).toLocaleDateString()}</td>
          <td style="font-size:.82rem">${o.items.length} item${o.items.length !== 1 ? 's' : ''}</td>
          <td style="font-weight:700">A$${o.total.toFixed(2)}</td>
          <td><span class="order-badge ${o.status}">${fmtStatus(o.status)}</span></td>
          <td class="actions">
            <button class="btn btn-sm btn-secondary" onclick="openOrderModal('${o.id}')">View</button>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="7" style="color:var(--muted);text-align:center;padding:2rem">No orders found</td></tr>`;

  const pgEl = document.getElementById('ordersPagination');
  if (pgEl) pgEl.innerHTML = renderAdminPagination(ordersPage, pages, total, 'setOrdersPage');
}

function openOrderModal(id) {
  currentOrderId = id;
  const o = adminOrders.find(o => o.id === id);
  if (!o) return;

  document.getElementById('orderModalTitle').textContent = `${o.order_number} · ${new Date(o.created_at).toLocaleDateString()}`;

  document.getElementById('orderModalMeta').innerHTML = `
    <div class="order-modal-section">
      <h4>Customer</h4>
      <p><strong>${o.customer_name}</strong><br>${o.customer_email}${o.customer_phone ? `<br>${o.customer_phone}` : ''}</p>
    </div>
    <div class="order-modal-section">
      <h4>Ship To</h4>
      <p>${o.shipping_address}<br>${o.shipping_city}, ${o.shipping_state} ${o.shipping_zip}<br>${o.shipping_country}</p>
    </div>
    ${o.notes ? `<div class="order-modal-section" style="grid-column:1/-1"><h4>Notes</h4><p>${o.notes}</p></div>` : ''}`;

  document.getElementById('orderModalItems').innerHTML = `
    <table>
      <thead><tr><th>Item</th><th>SKU</th><th>Price</th><th>Qty</th><th>Subtotal</th></tr></thead>
      <tbody>
        ${o.items.map(l => `
          <tr>
            <td style="font-weight:600">${l.name}</td>
            <td><span class="sku-code">${l.sku || '—'}</span></td>
            <td>A$${l.price.toFixed(2)}</td>
            <td>${l.qty}</td>
            <td style="font-weight:700">A$${(l.price * l.qty).toFixed(2)}</td>
          </tr>`).join('')}
        ${o.gst != null ? `
        <tr>
          <td colspan="4" style="text-align:right;color:var(--muted);font-size:.82rem;padding-top:.5rem">GST (10%)</td>
          <td style="color:var(--muted);font-size:.82rem;padding-top:.5rem">A$${o.gst.toFixed(2)}</td>
        </tr>` : ''}
        <tr>
          <td colspan="4" style="text-align:right;color:var(--muted);font-size:.82rem">Shipping</td>
          <td style="color:var(--muted);font-size:.82rem">${o.shipping_cost > 0 ? `A$${o.shipping_cost.toFixed(2)}` : 'Free'}</td>
        </tr>
        <tr style="border-top:2px solid var(--border)">
          <td colspan="4" style="font-weight:700;text-align:right;padding-top:.75rem">Total (inc. GST)</td>
          <td style="font-weight:800;font-size:1rem;padding-top:.75rem">A$${o.total.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>`;

  const sel = document.getElementById('orderStatusSelect');
  sel.innerHTML = ORDER_STATUSES.map(s => {
    const label = s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<option value="${s}" ${s === o.status ? 'selected' : ''}>${label}</option>`;
  }).join('');

  const notesEl = document.getElementById('orderAdminNotes');
  if (notesEl) notesEl.value = o.admin_notes || '';

  const trackEl = document.getElementById('orderTrackingNumber');
  if (trackEl) trackEl.value = o.tracking_number || '';

  document.getElementById('orderModalOverlay').classList.add('open');
}

function closeOrderModal() {
  document.getElementById('orderModalOverlay').classList.remove('open');
  currentOrderId = null;
}

async function saveOrderStatus() {
  if (!currentOrderId) return;
  const status = document.getElementById('orderStatusSelect').value;
  try {
    await api('PATCH', `/api/orders/${currentOrderId}/status`, { status });
    showToast(`Status updated to "${status}"`, 'success');
    await loadOrders();
    loadDashboard();
    document.getElementById('orderModalTitle').textContent = document.getElementById('orderModalTitle').textContent.split(' · ')[0] + ` · ${new Date().toLocaleDateString()}`;
  } catch (err) { showToast(err.message, 'error'); }
}

// save a tracking number against the order
async function saveTrackingNumber() {
  if (!currentOrderId) return;
  const tracking = document.getElementById('orderTrackingNumber')?.value.trim() || '';
  try {
    const updated = await api('PATCH', `/api/orders/${currentOrderId}/tracking`, { tracking_number: tracking });
    const o = adminOrders.find(o => o.id === currentOrderId);
    if (o) o.tracking_number = updated.tracking_number;
    showToast(tracking ? 'Tracking number saved' : 'Tracking number cleared', 'success');
  } catch (err) { showToast(err.message, 'error'); }
}

// internal admin notes — auto-saves, not shown to the customer
let _notesSaveTimer = null;

function scheduleAdminNotesSave() {
  clearTimeout(_notesSaveTimer);
  _notesSaveTimer = setTimeout(saveAdminNotes, 1200);
}

async function saveAdminNotes() {
  clearTimeout(_notesSaveTimer);
  if (!currentOrderId) return;
  const notes = document.getElementById('orderAdminNotes')?.value || '';
  try {
    const updated = await api('PATCH', `/api/orders/${currentOrderId}/admin-notes`, { admin_notes: notes });
    const o = adminOrders.find(o => o.id === currentOrderId);
    if (o) o.admin_notes = updated.admin_notes;
  } catch (err) { showToast(err.message, 'error'); }
}

document.getElementById('orderStatusTabs').addEventListener('click', e => {
  const tab = e.target.closest('.status-tab');
  if (!tab) return;
  document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  activeOrderStatus = tab.dataset.status;
  ordersPage = 1;
  renderOrderTable();
});

// customers — read-only list built from order history, searchable by name or email
function buildCustomerList() {
  const map = {};
  for (const o of adminOrders) {
    const key = o.customer_email.toLowerCase();
    if (!map[key]) {
      map[key] = {
        name: o.customer_name, email: o.customer_email,
        phone: o.customer_phone || '—', state: o.shipping_state,
        orders: 0, spent: 0, lastOrder: o.created_at,
      };
    }
    map[key].orders++;
    if (o.status !== 'cancelled' && o.status !== 'refunded') map[key].spent += o.total;
    if (o.created_at > map[key].lastOrder) {
      map[key].lastOrder = o.created_at;
      map[key].name = o.customer_name;
    }
  }
  return Object.values(map).sort((a, b) => new Date(b.lastOrder) - new Date(a.lastOrder));
}

function renderCustomerList() {
  const q = (document.getElementById('custSearch')?.value || '').toLowerCase();
  let list = buildCustomerList();
  if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  const count = document.getElementById('custCount');
  if (count) count.textContent = `${list.length} customer${list.length !== 1 ? 's' : ''}`;
  document.getElementById('custTable').innerHTML = list.length
    ? list.map(c => `
        <tr style="cursor:pointer" onclick="openCustomerModal(${JSON.stringify(c.email)})">
          <td>
            <div style="font-weight:600;font-size:.875rem">${c.name}</div>
            <div style="font-size:.75rem;color:var(--muted)">${c.email}</div>
          </td>
          <td style="font-size:.82rem">${c.phone}</td>
          <td style="font-size:.82rem">${c.state}</td>
          <td style="text-align:center;font-weight:600">${c.orders}</td>
          <td style="font-weight:700">A$${c.spent.toFixed(2)}</td>
          <td style="font-size:.78rem;color:var(--muted);white-space:nowrap">${new Date(c.lastOrder).toLocaleDateString('en-AU')}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" style="color:var(--muted);text-align:center;padding:2rem">No customers yet</td></tr>';
}

function openCustomerModal(email) {
  const c    = buildCustomerList().find(x => x.email.toLowerCase() === email.toLowerCase());
  const ords = adminOrders.filter(o => o.customer_email.toLowerCase() === email.toLowerCase())
                           .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!c) return;

  document.getElementById('custModalName').textContent = c.name;
  document.getElementById('custModalMeta').textContent = `${c.email}${c.phone !== '—' ? ' · ' + c.phone : ''}${c.state ? ' · ' + c.state : ''}`;

  document.getElementById('custModalSummary').innerHTML = [
    { label: 'Orders', value: c.orders },
    { label: 'Total Spent', value: `A$${c.spent.toFixed(2)}` },
    { label: 'First Order', value: new Date(ords[ords.length - 1]?.created_at).toLocaleDateString('en-AU') },
    { label: 'Last Order',  value: new Date(c.lastOrder).toLocaleDateString('en-AU') },
  ].map(s => `<div style="background:var(--bg);border-radius:var(--radius-sm);padding:.6rem 1rem;min-width:110px"><div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:.2rem">${s.label}</div><div style="font-weight:700;font-size:1rem">${s.value}</div></div>`).join('');

  document.getElementById('custModalOrders').innerHTML = ords.map(o => `
    <tr style="cursor:pointer" onclick="closeCustomerModal();openOrderModal('${o.id}')">
      <td><strong style="font-family:monospace;font-size:.8rem">${o.order_number}</strong></td>
      <td style="font-size:.78rem;color:var(--muted)">${new Date(o.created_at).toLocaleDateString('en-AU')}</td>
      <td><span class="order-badge ${o.status}">${fmtStatus(o.status)}</span></td>
      <td style="font-weight:700">A$${o.total.toFixed(2)}</td>
    </tr>`).join('');

  document.getElementById('custModalOverlay').classList.add('open');
}

function closeCustomerModal() {
  document.getElementById('custModalOverlay').classList.remove('open');
}

// close modals on overlay click or Escape key — standard UX stuff
document.getElementById('importModalOverlay').addEventListener('click', function(e) { if (e.target === this) closeImportModal(); });
document.getElementById('catModalOverlay').addEventListener('click', function(e) { if (e.target === this) closeCatModal(); });
document.getElementById('itemModalOverlay').addEventListener('click', function(e) { if (e.target === this) closeItemModal(); });
document.getElementById('orderModalOverlay').addEventListener('click', function(e) { if (e.target === this) closeOrderModal(); });
document.getElementById('custModalOverlay').addEventListener('click', function(e) { if (e.target === this) closeCustomerModal(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeCatModal(); closeItemModal(); closeOrderModal(); closeCustomerModal(); }
});

init();
