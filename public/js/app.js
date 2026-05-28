const S = {
  categories: [],
  items: [],
  cart: JSON.parse(localStorage.getItem('bizCart') || '[]'),
  detailQty: 1,
  siteSettings: {},
};

const shopState = { sort: 'default', inStock: false, minPrice: '', maxPrice: '', page: 1, perPage: 25, _key: '' };

const RECENT_KEY = 'bizRecent';
const RECENT_MAX = 8;

function trackRecentlyViewed(id) {
  try {
    let recent = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    recent = [id, ...recent.filter(i => i !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {}
}

function recentlyViewedHTML(excludeId) {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(i => i !== excludeId);
    const recentItems = ids.map(id => S.items.find(i => i.id === id && i.active)).filter(Boolean).slice(0, 6);
    if (!recentItems.length) return '';
    return `
    <div class="related-section">
      <h2>Recently Viewed</h2>
      <div class="products-grid">${recentItems.map(productCard).join('')}</div>
    </div>`;
  } catch { return ''; }
}

// tiny fetch wrapper — throws if the server sends back an error
async function get(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// shortcuts and formatting helpers used all over the shop
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const money = n => `A$${parseFloat(n).toFixed(2)}`;
const slugIcon = s => ({
  'hand-tools':        '🔧',
  '3d-printed':        '🖨️',
  'hardware':          '🔩',
  'resistors':         '〰️',
  'capacitors':        '⚡',
  'semiconductors':    '💡',
  'passive-components':'🔋',
  'connectors':        '🔌',
  'soldering':         '🔥',
  'measurement':       '📏',
}[s] || '📦');

function setJsonLd(data) {
  let el = document.getElementById('jsonLd');
  if (!data) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'jsonLd';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

function setMeta(title, description, imgUrl = '') {
  document.title = title;
  const setAttr = (id, val) => { const el = document.getElementById(id); if (el) el.setAttribute('content', val); };
  const abs = url => url ? (url.startsWith('http') ? url : location.origin + url) : '';
  setAttr('metaDesc', description);
  setAttr('ogTitle',  title);
  setAttr('ogDesc',   description);
  setAttr('ogUrl',    location.href);
  setAttr('ogImage',  abs(imgUrl));
  setAttr('twTitle',  title);
  setAttr('twDesc',   description);
  setAttr('twImage',  abs(imgUrl));
  const canon = document.getElementById('canonicalTag');
  if (canon) canon.href = location.href;
}

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

function switchGalleryImg(src, thumb) {
  const main = document.getElementById('detailMainImg');
  if (main) { main.classList.remove('img-loaded'); main.src = src; }
  document.querySelectorAll('.gallery-thumb').forEach(t => t.classList.remove('active'));
  if (thumb) thumb.classList.add('active');
}

function openLightbox(src, alt) {
  const lb = document.createElement('div');
  lb.className = 'img-lightbox';
  lb.innerHTML = `<img src="${src}" alt="${alt}">`;
  const close = () => lb.remove();
  lb.addEventListener('click', close);
  const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  document.body.appendChild(lb);
}

// cart — persisted in localStorage, survives page refreshes
function cartSave() { localStorage.setItem('bizCart', JSON.stringify(S.cart)); }

function cartAdd(id, qty = 1) {
  const item = S.items.find(i => i.id === id);
  if (!item) return;
  const ex = S.cart.find(c => c.id === id);
  if (ex) ex.qty += qty; else S.cart.push({ id, qty });
  cartSave(); updateCartBadge();
  showToast(`Added "${item.name}" to cart`, 'success');
}

function cartRemove(id) {
  S.cart = S.cart.filter(c => c.id !== id);
  cartSave(); updateCartBadge();
}

function cartSetQty(id, qty) {
  const line = S.cart.find(c => c.id === id);
  if (!line) return;
  if (qty <= 0) { cartRemove(id); return; }
  line.qty = qty;
  cartSave(); updateCartBadge();
}

function cartTotal() { return S.cart.reduce((s, l) => { const i = S.items.find(x => x.id === l.id); return s + (i ? i.price * l.qty : 0); }, 0); }

function updateCartBadge() {
  const count = S.cart.reduce((s, l) => s + l.qty, 0);
  const badge = $('cartBadge');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('visible', count > 0);
}

// SPA router — pushState navigation, figures out which page to render from the URL
function toggleMobileMenu() {
  const nav = document.getElementById('mainNav');
  const btn = document.getElementById('mobMenuBtn');
  const open = nav.classList.toggle('nav-open');
  btn.textContent = open ? '✕' : '☰';
}

function closeMobileMenu() {
  document.getElementById('mainNav')?.classList.remove('nav-open');
  const btn = document.getElementById('mobMenuBtn');
  if (btn) btn.textContent = '☰';
}

function navigate(path) {
  history.pushState(null, '', path);
  closeMobileMenu();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function render() {
  const path = location.pathname;
  const app = $('app');

  document.querySelectorAll('.store-nav a[data-nav]').forEach(a => {
    const nav = a.dataset.nav;
    a.classList.toggle('active',
      nav === '/' ? path === '/' : path.startsWith(nav));
  });

  const _n = S.siteSettings.store_name || 'BIZShop';
  const _t = S.siteSettings.tagline    || 'Tools & 3D Printed Parts · Australia';
  if      (path === '/')        setMeta(`${_n} — ${_t}`, `Shop quality tools, electronics components, 3D printed parts, and hardware. Australian business, fast dispatch.`);
  else if (path === '/shop')    setMeta(`Shop — ${_n}`, `Browse our full range of tools, electronics, hardware, and 3D printed parts. Filter by category, price, and availability.`);
  else if (path === '/cart')    setMeta(`Cart — ${_n}`, `Review your cart and proceed to checkout.`);
  else if (path === '/checkout') setMeta(`Checkout — ${_n}`, `Complete your ${_n} order.`);
  else if (path === '/about')   setMeta(`About — ${_n}`, `Learn about ${_n} — quality tools and parts for Australian makers and workshops.`);
  else if (path === '/contact') setMeta(`Contact — ${_n}`, `Get in touch with ${_n}. We're happy to help with product questions or orders.`);
  else if (path === '/track')   setMeta(`Track Your Order — ${_n}`, `Track your ${_n} order status using your email address and order number.`);
  else if (!path.startsWith('/product/')) setMeta(_n, _t);

  if (path === '/' || path === '/shop') {
    const org = { '@type': 'Organization', name: _n, url: location.origin };
    if (S.siteSettings.contact_email) org.contactPoint = { '@type': 'ContactPoint', email: S.siteSettings.contact_email, contactType: 'customer service' };
    setJsonLd({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebSite', name: _n, url: location.origin,
        potentialAction: { '@type': 'SearchAction', target: `${location.origin}/shop?search={q}`, 'query-input': 'required name=q' } },
      org,
    ]});
  } else if (!path.startsWith('/product/')) {
    setJsonLd(null);
  }

  let html = '';
  if (path === '/')                    html = pageHome();
  else if (path === '/shop')           html = pageShop();
  else if (path.startsWith('/product/')) html = pageProduct(path.split('/')[2]);
  else if (path === '/cart')           html = pageCart();
  else if (path === '/checkout')       html = pageCheckout();
  else if (path.startsWith('/order/')) html = pageOrderConfirm(path.split('/')[2]);
  else if (path === '/about')          html = pageAbout();
  else if (path === '/contact')        html = pageContact();
  else if (path === '/track')          html = pageTrack();
  else html = page404();

  app.innerHTML = html;
  app.classList.remove('page-fade');
  void app.offsetWidth;
  app.classList.add('page-fade');

  const searchInp = $('globalSearch');
  if (searchInp) searchInp.value = new URLSearchParams(location.search).get('search') || '';

  afterRender(path);
}

window.addEventListener('popstate', render);

// global click handler — intercepts nav links so the browser doesn't do a full reload
document.addEventListener('click', e => {
  const link = e.target.closest('[data-link]');
  if (link) {
    e.preventDefault();
    const href = link.getAttribute('href') || link.dataset.link;
    if (href) navigate(href);
    return;
  }
});

// live search dropdown in the header — debounced, keyboard navigable, proper good
document.addEventListener('DOMContentLoaded', () => {
  const inp = $('globalSearch');
  const btn = $('globalSearchBtn');
  const dd  = $('searchDropdown');
  if (!inp || !dd) return;

  let activeIdx = -1;
  let debounceTimer = null;

  function highlight(text, q) {
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return esc(text);
    return esc(text.slice(0, idx))
      + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>'
      + esc(text.slice(idx + q.length));
  }

  function renderDropdown(q) {
    if (!q || q.length < 2) { closeDropdown(); return; }
    const ql = q.toLowerCase();
    const results = S.items
      .filter(i => i.active && (
        i.name.toLowerCase().includes(ql) ||
        (i.description || '').toLowerCase().includes(ql) ||
        (i.sku || '').toLowerCase().includes(ql)
      ))
      .slice(0, 7);

    if (!results.length) {
      dd.innerHTML = `<div class="sd-empty">No results for "<strong>${esc(q)}</strong>"</div>`;
      dd.classList.add('open');
      return;
    }

    dd.innerHTML = results.map((item, i) => `
      <div class="sd-item" data-idx="${i}" data-id="${item.id}">
        <div class="sd-thumb">
          ${item.image_url ? `<img src="${esc(item.image_url)}" alt="">` : slugIcon(item.category_slug)}
        </div>
        <div class="sd-info">
          <div class="sd-name">${highlight(item.name, q)}</div>
          <div class="sd-cat">${esc(item.category_name)}</div>
        </div>
        <div class="sd-price">${money(item.price)}</div>
      </div>`).join('')
      + (results.length >= 7
        ? `<div class="sd-footer" id="sdViewAll">See all results for "<strong>${esc(q)}</strong>" →</div>`
        : '');

    activeIdx = -1;
    dd.classList.add('open');

    dd.querySelectorAll('.sd-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        closeDropdown();
        inp.value = '';
        navigate(`/product/${el.dataset.id}`);
      });
    });
    const viewAll = $('sdViewAll');
    if (viewAll) viewAll.addEventListener('mousedown', e => { e.preventDefault(); doSearch(); });
  }

  function closeDropdown() { dd.classList.remove('open'); activeIdx = -1; }

  function doSearch() {
    const q = inp.value.trim();
    closeDropdown();
    inp.blur();
    navigate(q ? `/shop?search=${encodeURIComponent(q)}` : '/shop');
  }

  inp.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderDropdown(inp.value.trim()), 150);
  });

  inp.addEventListener('keydown', e => {
    const sdItems = [...dd.querySelectorAll('.sd-item')];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, sdItems.length - 1);
      sdItems.forEach((el, i) => el.classList.toggle('sd-active', i === activeIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, -1);
      sdItems.forEach((el, i) => el.classList.toggle('sd-active', i === activeIdx));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && sdItems[activeIdx]) {
        const id = sdItems[activeIdx].dataset.id;
        closeDropdown(); inp.value = '';
        navigate(`/product/${id}`);
      } else { doSearch(); }
    } else if (e.key === 'Escape') {
      closeDropdown(); inp.blur();
    }
  });

  inp.addEventListener('focus', () => { if (inp.value.trim().length >= 2) renderDropdown(inp.value.trim()); });
  btn.addEventListener('click', doSearch);
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) closeDropdown(); });
});

// home page — hero section, category grid, and featured products
function pageHome() {
  const showcase = S.items.filter(i => i.active).slice(0, 8);
  return `
  <section class="home-hero">
    <div class="home-hero-inner">
      <div class="home-hero-text">
        <div class="home-hero-eyebrow">🔧 Tools &amp; 3D Printed Parts</div>
        <h1>Built for <em>Makers</em><br>&amp; Builders</h1>
        <p>Precision hand tools, custom 3D printed parts, and quality hardware — everything a maker needs, in one place.</p>
        <div class="home-hero-btns">
          <button class="btn-hero" onclick="navigate('/shop')">Shop Now →</button>
          <button class="btn-hero-outline" onclick="navigate('/about')">Our Story</button>
        </div>
      </div>
      <div class="hero-visual">
        ${[
          {icon:'🔧', label:'Hand Tools',   sub:'Wrenches, drivers & more'},
          {icon:'🖨️', label:'3D Printed',   sub:'Custom parts on demand'},
          {icon:'🔩', label:'Hardware',     sub:'Bolts, nuts & fasteners'},
          {icon:'🛠️', label:'Accessories',  sub:'Workshop essentials'},
        ].map(c => `
          <div class="hero-icon-card">
            <div class="card-emoji">${c.icon}</div>
            <div class="card-label">${c.label}</div>
            <div class="card-sub">${c.sub}</div>
          </div>`).join('')}
      </div>
    </div>
  </section>

  <div class="home-wrap">

    <section class="home-section">
      <div class="section-header-row">
        <div>
          <div class="section-eyebrow">Browse</div>
          <h2 class="section-title">Shop by Category</h2>
        </div>
      </div>
      <div class="cat-cards-grid">
        ${S.categories.map(cat => `
          <div class="cat-card" onclick="navigate('/shop?cat=${cat.slug}')">
            <div class="cat-icon">${slugIcon(cat.slug)}</div>
            <h3>${esc(cat.name)}</h3>
            <p>${esc(cat.description || 'Browse our selection.')}</p>
            <div class="cat-count">
              ${cat.item_count} product${cat.item_count !== 1 ? 's' : ''}
              <span class="cat-arrow" style="margin-left:auto">→</span>
            </div>
          </div>`).join('')}
      </div>
    </section>

    <section class="home-section">
      <div class="section-header-row">
        <div>
          <div class="section-eyebrow">Catalog</div>
          <h2 class="section-title">Popular Products</h2>
        </div>
        <span class="view-all-link" onclick="navigate('/shop')">View all products →</span>
      </div>
      <div class="products-grid">
        ${showcase.length ? showcase.map(productCard).join('') : '<p style="color:var(--muted)">No products yet.</p>'}
      </div>
    </section>
  </div>

  <section class="value-props-strip">
    <div class="value-props-inner">
      ${[
        {icon:'✅', title:'Quality Guaranteed',   body:'Every item is handpicked and verified before listing.'},
        {icon:'📦', title:'In Stock & Ready',     body:'Real-time inventory tracking so you know what\'s available.'},
        {icon:'🖨️', title:'Custom 3D Prints',    body:'Unique parts you won\'t find anywhere else.'},
        {icon:'⚡', title:'Fast Dispatch',        body:'Orders processed and shipped the same day.'},
      ].map(v => `
        <div class="vp-item">
          <div class="vp-icon">${v.icon}</div>
          <h3>${v.title}</h3>
          <p>${v.body}</p>
        </div>`).join('')}
    </div>
  </section>`;
}

// shop page — filterable, sortable product grid with pagination
function shopFilteredItems() {
  const params = new URLSearchParams(location.search);
  const activeCat = params.get('cat') || '';
  const search = params.get('search') || '';

  let filtered = S.items.filter(i => i.active);
  if (activeCat) filtered = filtered.filter(i => i.category_slug === activeCat);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(i => i.name.toLowerCase().includes(q) || (i.description||'').toLowerCase().includes(q));
  }
  if (shopState.inStock) filtered = filtered.filter(i => i.stock > 0);
  if (shopState.minPrice !== '') filtered = filtered.filter(i => i.price >= parseFloat(shopState.minPrice));
  if (shopState.maxPrice !== '') filtered = filtered.filter(i => i.price <= parseFloat(shopState.maxPrice));

  if (shopState.sort === 'price-asc')  filtered.sort((a, b) => a.price - b.price);
  else if (shopState.sort === 'price-desc') filtered.sort((a, b) => b.price - a.price);
  else if (shopState.sort === 'name-asc')  filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (shopState.sort === 'name-desc') filtered.sort((a, b) => b.name.localeCompare(a.name));

  return filtered;
}

function pageRange(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4)          return [1, 2, 3, 4, 5, '...', total];
  if (cur >= total - 3)  return [1, '...', total-4, total-3, total-2, total-1, total];
  return [1, '...', cur-1, cur, cur+1, '...', total];
}

function renderPaginationHTML(page, pages, fn) {
  if (pages <= 1) return '';
  const range = pageRange(page, pages);
  const btns = [`<button class="pg-btn" ${page===1?'disabled':''} onclick="${fn}(${page-1})">&#8249;</button>`];
  range.forEach(p => {
    if (p === '...') btns.push('<span class="pg-ellipsis">…</span>');
    else btns.push(`<button class="pg-btn${p===page?' active':''}" onclick="${fn}(${p})">${p}</button>`);
  });
  btns.push(`<button class="pg-btn" ${page===pages?'disabled':''} onclick="${fn}(${page+1})">&#8250;</button>`);
  return `<div class="pagination">${btns.join('')}</div>`;
}

function setShopPage(n) {
  shopState.page = n;
  applyShopFilters();
  document.querySelector('.shop-page')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setShopPerPage(n) { shopState.perPage = parseInt(n); shopState.page = 1; applyShopFilters(); }

function applyShopFilters() {
  const grid = $('shopGrid');
  const count = $('shopCount');
  if (!grid) return;
  const all = shopFilteredItems();
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / shopState.perPage));
  if (shopState.page > pages) shopState.page = pages;
  const start = (shopState.page - 1) * shopState.perPage;
  const paged = all.slice(start, start + shopState.perPage);
  grid.innerHTML = paged.length ? paged.map(productCard).join('') : emptyState('No products found', 'Try adjusting your filters.');
  if (count) count.textContent = total > shopState.perPage
    ? `${start + 1}–${Math.min(start + shopState.perPage, total)} of ${total} items`
    : `${total} item${total !== 1 ? 's' : ''}`;
  const pgEl = $('shopPagination');
  if (pgEl) pgEl.innerHTML = renderPaginationHTML(shopState.page, pages, 'setShopPage');
  $('app').querySelectorAll('[data-product-id]').forEach(card => {
    card.addEventListener('click', e => { if (!e.target.closest('[data-add-cart]')) navigate(`/product/${card.dataset.productId}`); });
  });
  $('app').querySelectorAll('[data-add-cart]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); if (!btn.disabled) cartAdd(btn.dataset.addCart); });
  });
}

function pageShop() {
  const params = new URLSearchParams(location.search);
  const activeCat = params.get('cat') || '';
  const search = params.get('search') || '';

  const key = activeCat + '|' + search;
  if (shopState._key !== key) { shopState.page = 1; shopState._key = key; }

  const all = shopFilteredItems();
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / shopState.perPage));
  if (shopState.page > pages) shopState.page = pages;
  const start = (shopState.page - 1) * shopState.perPage;
  const paged = all.slice(start, start + shopState.perPage);

  const catName = activeCat ? S.categories.find(c => c.slug === activeCat)?.name : '';
  const title = search ? `Results for "${search}"` : (catName || 'All Products');
  const countText = total > shopState.perPage
    ? `${start + 1}–${Math.min(start + shopState.perPage, total)} of ${total} items`
    : `${total} item${total !== 1 ? 's' : ''}`;

  const sortOpts = [
    ['default',    'Sort: Default'],
    ['price-asc',  'Price: Low → High'],
    ['price-desc', 'Price: High → Low'],
    ['name-asc',   'Name: A → Z'],
    ['name-desc',  'Name: Z → A'],
  ].map(([v, l]) => `<option value="${v}"${shopState.sort === v ? ' selected' : ''}>${l}</option>`).join('');

  const perPageOpts = [25, 50, 100].map(n =>
    `<option value="${n}"${shopState.perPage === n ? ' selected' : ''}>${n} per page</option>`).join('');

  return `
  <div class="shop-page">
    <aside class="shop-sidebar">
      <div class="sidebar-widget">
        <div class="sidebar-widget-title">Categories</div>
        <ul class="cat-filter-list">
          <li class="${!activeCat ? 'active' : ''}" onclick="navigate('/shop')">
            All Products <span class="cnt">${S.items.filter(i=>i.active).length}</span>
          </li>
          ${S.categories.map(c => `
            <li class="${activeCat === c.slug ? 'active' : ''}" onclick="navigate('/shop?cat=${c.slug}')">
              ${esc(c.name)} <span class="cnt">${c.item_count}</span>
            </li>`).join('')}
        </ul>
      </div>
      <div class="sidebar-widget">
        <div class="sidebar-widget-title">Filter</div>
        <label class="instock-toggle">
          <input type="checkbox" id="inStockOnly"${shopState.inStock ? ' checked' : ''}> In stock only
        </label>
        <div class="sidebar-widget-title" style="margin-top:1.1rem;margin-bottom:.55rem">Price Range</div>
        <div class="price-range-inputs">
          <div class="price-input-wrap">
            <span class="price-prefix">A$</span>
            <input type="number" id="priceMin" placeholder="Min" min="0" step="0.01" value="${esc(shopState.minPrice)}">
          </div>
          <span class="price-range-sep">—</span>
          <div class="price-input-wrap">
            <span class="price-prefix">A$</span>
            <input type="number" id="priceMax" placeholder="Max" min="0" step="0.01" value="${esc(shopState.maxPrice)}">
          </div>
        </div>
      </div>
    </aside>

    <div class="shop-main">
      <div class="shop-bar">
        <h1>${esc(title)}</h1>
        <div class="shop-bar-right">
          <span class="count-badge" id="shopCount">${countText}</span>
          <select class="sort-select" id="shopSort">${sortOpts}</select>
          <select class="sort-select" id="shopPerPage" onchange="setShopPerPage(this.value)">${perPageOpts}</select>
        </div>
      </div>
      <div class="products-grid" id="shopGrid">
        ${paged.length ? paged.map(productCard).join('') : emptyState('No products found', 'Try a different category or search.')}
      </div>
      <div id="shopPagination">${renderPaginationHTML(shopState.page, pages, 'setShopPage')}</div>
    </div>
  </div>`;
}

// product detail page — gallery, stock badge, qty picker, related products
function pageProduct(id) {
  const item = S.items.find(i => i.id === id);
  if (!item) return page404();
  S.detailQty = 1;
  trackRecentlyViewed(id);

  const _n   = S.siteSettings.store_name || 'BIZShop';
  const _raw = item.description ? item.description.replace(/<[^>]+>/g, '').slice(0, 150) : '';
  const _desc = _raw ? `${_raw} — A$${parseFloat(item.price).toFixed(2)} ex-GST | ${_n}` : `${item.name} — A$${parseFloat(item.price).toFixed(2)} ex-GST | ${_n}`;
  setMeta(`${item.name} — ${_n}`, _desc, item.image_url || '');

  const _images = (item.images?.length ? item.images : (item.image_url ? [item.image_url] : []))
    .map(u => u.startsWith('http') ? u : location.origin + u);
  const _cat = S.categories.find(c => c.id === item.category_id);
  setJsonLd({ '@context': 'https://schema.org', '@graph': [
    {
      '@type': 'Product',
      name: item.name,
      description: item.description || undefined,
      image: _images.length ? _images : undefined,
      sku: item.sku || undefined,
      category: _cat?.name || undefined,
      brand: { '@type': 'Brand', name: _n },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'AUD',
        price: parseFloat(item.price).toFixed(2),
        availability: item.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url: location.href,
        seller: { '@type': 'Organization', name: _n },
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home',  item: location.origin + '/' },
        { '@type': 'ListItem', position: 2, name: 'Shop',  item: location.origin + '/shop' },
        ...(_cat ? [{ '@type': 'ListItem', position: 3, name: _cat.name, item: `${location.origin}/shop?cat=${_cat.slug}` }] : []),
        { '@type': 'ListItem', position: _cat ? 4 : 3, name: item.name, item: location.href },
      ],
    },
  ]});

  const related = S.items.filter(i => i.active && i.category_id === item.category_id && i.id !== id).slice(0, 4);

  const _threshold = parseInt(S.siteSettings.low_stock_threshold) || 5;
  let stockHtml, addDisabled = false;
  if (!item.active || item.stock === 0) {
    stockHtml = `<div class="stock-pill out-stock">Out of Stock</div>`;
    addDisabled = true;
  } else if (item.stock <= _threshold) {
    stockHtml = `<div class="stock-pill low-stock">Only ${item.stock} left</div>`;
  } else {
    stockHtml = `<div class="stock-pill in-stock">In Stock</div>`;
  }

  return `
  <div class="detail-wrap">
    <nav class="breadcrumb">
      <a onclick="navigate('/')">Home</a>
      <span class="sep">/</span>
      <a onclick="navigate('/shop')">Shop</a>
      <span class="sep">/</span>
      <a onclick="navigate('/shop?cat=${item.category_slug}')">${esc(item.category_name)}</a>
      <span class="sep">/</span>
      <span>${esc(item.name)}</span>
    </nav>

    <div class="product-detail">
      <div class="detail-img">
        ${item.images && item.images.length
          ? `<div class="gallery-main">
               <img src="${esc(item.images[0])}" alt="${esc(item.name)}" id="detailMainImg" onclick="openLightbox(this.src,'${esc(item.name)}')" onload="this.classList.add('img-loaded')" style="cursor:zoom-in">
             </div>
             ${item.images.length > 1 ? `
             <div class="gallery-thumbs">
               ${item.images.map((url, i) => `
                 <div class="gallery-thumb${i === 0 ? ' active' : ''}" onclick="switchGalleryImg('${esc(url)}',this)">
                   <img src="${esc(url)}" alt="${esc(item.name)} image ${i+1}" loading="lazy">
                 </div>`).join('')}
             </div>` : ''}`
          : `<div class="detail-ph">${slugIcon(item.category_slug)}</div>`}
      </div>

      <div class="detail-info">
        <div class="detail-cat-pill" onclick="navigate('/shop?cat=${item.category_slug}')">
          ${slugIcon(item.category_slug)} ${esc(item.category_name)}
        </div>
        <h1 class="detail-name">${esc(item.name)}</h1>
        <div class="detail-price"><sup>A$</sup>${parseFloat(item.price).toFixed(2).split('.')[0]}<span style="font-size:1.1rem;font-weight:700">.${parseFloat(item.price).toFixed(2).split('.')[1]}</span></div>

        ${stockHtml}

        ${item.description ? `<p class="detail-desc">${esc(item.description)}</p>` : ''}

        <div class="qty-row">
          <div class="qty-picker">
            <button id="qtyMinus" ${addDisabled ? 'disabled' : ''}>−</button>
            <span id="qtyVal">1</span>
            <button id="qtyPlus" ${addDisabled ? 'disabled' : ''}>+</button>
          </div>
          <button class="btn-add-detail" id="detailAddBtn" data-item-id="${item.id}" ${addDisabled ? 'disabled' : ''}>
            ${addDisabled ? 'Out of Stock' : 'Add to Cart'}
          </button>
        </div>

        <div class="detail-meta">
          ${item.sku ? `<div class="detail-meta-row"><span class="detail-meta-label">SKU</span><span class="detail-meta-val sku-tag">${esc(item.sku)}</span></div>` : ''}
          <div class="detail-meta-row"><span class="detail-meta-label">Category</span><span class="detail-meta-val">${esc(item.category_name)}</span></div>
          ${item.stock > 0 ? `<div class="detail-meta-row"><span class="detail-meta-label">Stock</span><span class="detail-meta-val">${item.stock} units</span></div>` : ''}
        </div>
      </div>
    </div>

    ${related.length ? `
    <div class="related-section">
      <h2>More from ${esc(item.category_name)}</h2>
      <div class="products-grid">${related.map(productCard).join('')}</div>
    </div>` : ''}

    ${recentlyViewedHTML(id)}
  </div>`;
}

// cart page — shows items from localStorage with a running total
function pageCart() {
  if (S.cart.length === 0) return `
    <div class="cart-wrap">
      <h1>Your Cart</h1>
      <div class="cart-empty">
        <div class="empty-icon">🛒</div>
        <h2>Your cart is empty</h2>
        <p>Add some products to get started.</p>
        <button class="btn-hero" onclick="navigate('/shop')" style="margin-top:1rem">Browse Products →</button>
      </div>
    </div>`;

  const lines = S.cart.map(line => {
    const item = S.items.find(i => i.id === line.id);
    if (!item) return '';
    return `
    <div class="cart-item">
      <div class="cart-item-img">
        ${item.image_url ? `<img src="${esc(item.image_url)}" alt="">` : slugIcon(item.category_slug)}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-cat">${esc(item.category_name)}</div>
        <div class="cart-item-name">${esc(item.name)}</div>
        <div class="cart-item-price">${money(item.price)} each</div>
      </div>
      <div class="cart-item-actions">
        <div class="cart-item-total">${money(item.price * line.qty)}</div>
        <div class="cart-qty-row">
          <button class="cart-qty-btn" data-cart-dec="${item.id}">−</button>
          <span class="cart-qty-num">${line.qty}</span>
          <button class="cart-qty-btn" data-cart-inc="${item.id}">+</button>
        </div>
        <button class="cart-remove" data-cart-remove="${item.id}">Remove</button>
      </div>
    </div>`;
  }).join('');

  const subtotal = cartTotal();
  const itemCount = S.cart.reduce((s, l) => s + l.qty, 0);

  return `
  <div class="cart-wrap">
    <h1>Your Cart <span style="font-size:1rem;font-weight:500;color:var(--muted)">(${itemCount} item${itemCount !== 1 ? 's' : ''})</span></h1>
    <div class="cart-layout">
      <div class="cart-items-list">${lines}</div>
      <div class="cart-summary">
        <h2>Order Summary</h2>
        <div class="summary-rows">
          <div class="summary-row label"><span>Subtotal</span><span>${money(subtotal)}</span></div>
          <div class="summary-row label"><span>Shipping</span><span class="shipping-free">Free</span></div>
        </div>
        <div class="summary-row total"><span>Total</span><span>${money(subtotal)}</span></div>
        <div style="margin-top:1.25rem;display:flex;flex-direction:column;gap:.6rem;">
          <button class="btn-checkout" onclick="navigate('/checkout')">Proceed to Checkout →</button>
          <button class="btn-continue-shop" onclick="navigate('/shop')">← Continue Shopping</button>
        </div>
      </div>
    </div>
  </div>`;
}

// checkout — collects customer details, calculates shipping, submits the order
function pageCheckout() {
  if (S.cart.length === 0) { navigate('/cart'); return ''; }
  const subtotal = cartTotal();
  const gst      = Math.round(subtotal * 0.10 * 100) / 100;
  const mode     = S.siteSettings.shipping_mode || 'free';
  const initCost = (mode === 'free') ? 0 : (mode === 'flat' ? parseFloat(S.siteSettings.shipping_flat_rate) || 0 : null);
  const initShippingHtml = initCost === null
    ? '<em style="color:var(--muted);font-size:.82rem">Select state</em>'
    : (initCost === 0 ? '<span class="free">Free</span>' : money(initCost));
  const total    = initCost !== null ? Math.round((subtotal + gst + initCost) * 100) / 100 : null;
  const itemCount = S.cart.reduce((s, l) => s + l.qty, 0);

  const summaryItems = S.cart.map(line => {
    const item = S.items.find(i => i.id === line.id);
    if (!item) return '';
    return `
    <div class="csc-item">
      <div class="csc-item-img">
        ${item.image_url ? `<img src="${esc(item.image_url)}" alt="">` : slugIcon(item.category_slug)}
      </div>
      <div>
        <div class="csc-item-name">${esc(item.name)}</div>
        <div class="csc-item-meta">Qty: ${line.qty}</div>
      </div>
      <div class="csc-item-price">${money(item.price * line.qty)}</div>
    </div>`;
  }).join('');

  return `
  <div class="checkout-wrap">
    <h1>Checkout</h1>
    <div id="checkoutError" class="checkout-error"></div>
    <div class="checkout-layout">

      <div class="checkout-form-col">
        <!-- Contact -->
        <div class="checkout-card">
          <div class="checkout-card-header">
            <div class="step-num">1</div>
            <h2>Contact Information</h2>
          </div>
          <div class="checkout-card-body">
            <div class="cf-row">
              <div class="cf-group"><label>First Name *</label><input id="cf-fname" type="text" placeholder="Jane" autocomplete="given-name"></div>
              <div class="cf-group"><label>Last Name *</label><input id="cf-lname" type="text" placeholder="Smith" autocomplete="family-name"></div>
            </div>
            <div class="cf-group"><label>Email Address *</label><input id="cf-email" type="email" placeholder="jane@example.com" autocomplete="email"></div>
            <div class="cf-group"><label>Phone <span class="cf-optional">(optional)</span></label><input id="cf-phone" type="tel" placeholder="04XX XXX XXX" autocomplete="tel"></div>
          </div>
        </div>

        <!-- Shipping -->
        <div class="checkout-card">
          <div class="checkout-card-header">
            <div class="step-num">2</div>
            <h2>Shipping Address</h2>
          </div>
          <div class="checkout-card-body">
            <div class="cf-group"><label>Street Address *</label><input id="cf-addr" type="text" placeholder="12 Smith Street" autocomplete="street-address"></div>
            <div class="cf-row-3">
              <div class="cf-group"><label>Suburb *</label><input id="cf-city" type="text" placeholder="Melbourne" autocomplete="address-level2"></div>
              <div class="cf-group">
                <label>State *</label>
                <select id="cf-state" autocomplete="address-level1" onchange="updateCheckoutShipping()">
                  <option value="">Select…</option>
                  <option value="NSW">NSW</option>
                  <option value="VIC">VIC</option>
                  <option value="QLD">QLD</option>
                  <option value="SA">SA</option>
                  <option value="WA">WA</option>
                  <option value="TAS">TAS</option>
                  <option value="ACT">ACT</option>
                  <option value="NT">NT</option>
                </select>
              </div>
              <div class="cf-group"><label>Postcode *</label><input id="cf-zip" type="text" placeholder="3000" maxlength="4" pattern="[0-9]{4}" autocomplete="postal-code"></div>
            </div>
          </div>
        </div>

        <!-- Payment (mock) -->
        <div class="checkout-card">
          <div class="checkout-card-header">
            <div class="step-num">3</div>
            <h2>Payment <span style="font-size:.75rem;font-weight:400;color:var(--muted)">— Demo only, no real charge</span></h2>
          </div>
          <div class="checkout-card-body">
            <div class="cf-group card-number-field">
              <label>Card Number</label>
              <input type="text" placeholder="1234 5678 9012 3456" maxlength="19" id="cf-card">
              <span class="card-type-icon">💳</span>
            </div>
            <div class="cf-row">
              <div class="cf-group"><label>Expiry</label><input type="text" placeholder="MM / YY" maxlength="7"></div>
              <div class="cf-group"><label>CVV</label><input type="text" placeholder="123" maxlength="4"></div>
            </div>
            <div class="cf-group"><label>Name on Card</label><input type="text" placeholder="Jane Smith"></div>
          </div>
        </div>

        <!-- Notes -->
        <div class="checkout-card">
          <div class="checkout-card-body">
            <div class="cf-group">
              <label>Order Notes <span class="cf-optional">(optional)</span></label>
              <textarea id="cf-notes" placeholder="Special instructions, delivery notes…"></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- Summary sidebar -->
      <div class="checkout-summary-card">
        <div class="csc-header">Order Summary · ${itemCount} item${itemCount !== 1 ? 's' : ''}</div>
        <div class="csc-items">${summaryItems}</div>
        <div class="csc-totals">
          <div class="csc-row muted"><span>Subtotal (ex. GST)</span><span>${money(subtotal)}</span></div>
          <div class="csc-row muted"><span>GST (10%)</span><span>${money(gst)}</span></div>
          <div class="csc-row muted"><span>Shipping</span><span id="checkoutShippingVal">${initShippingHtml}</span></div>
          <div class="csc-row total"><span>Total (inc. GST)</span><span id="checkoutTotalVal">${total !== null ? money(total) : '—'}</span></div>
        </div>
        <button class="btn-place-order" id="placeOrderBtn" onclick="placeOrder()">Place Order →</button>
        <div class="secure-note">🔒 Secure checkout — your info is safe</div>
      </div>

    </div>
  </div>`;
}

async function placeOrder() {
  const get = id => ($(`cf-${id}`)?.value || '').trim();
  const fields = { fname: get('fname'), lname: get('lname'), email: get('email'), addr: get('addr'), city: get('city'), state: get('state'), zip: get('zip') };
  const missing = Object.entries(fields).filter(([, v]) => !v).map(([k]) => k);

  const errEl = $('checkoutError');
  if (missing.length) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.classList.add('visible');
    errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  if (!/^\d{4}$/.test(fields.zip)) {
    errEl.textContent = 'Postcode must be 4 digits.';
    errEl.classList.add('visible');
    errEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  errEl.classList.remove('visible');

  const btn = $('placeOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Placing order…';

  const subtotalForShipping = cartTotal();
  const shippingCost = calcShipping(fields.state, subtotalForShipping) || 0;

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: `${fields.fname} ${fields.lname}`,
        customer_email: fields.email,
        customer_phone: get('phone'),
        shipping_address: fields.addr,
        shipping_city: fields.city,
        shipping_state: fields.state,
        shipping_zip: fields.zip,
        shipping_country: 'AU',
        notes: $('cf-notes')?.value?.trim() || null,
        lines: S.cart.map(l => ({ item_id: l.id, qty: l.qty })),
        shipping_cost: shippingCost,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Order failed');

    S.cart = [];
    cartSave();
    updateCartBadge();
    navigate(`/order/${data.id}`);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Place Order →';
    errEl.textContent = err.message;
    errEl.classList.add('visible');
    S.items = await fetch('/api/items').then(r => r.json()).catch(() => S.items);
  }
}

// order confirmation — fetches the fresh order and shows what just got placed
async function pageOrderConfirm(id) {
  const app = $('app');
  app.innerHTML = `<div style="text-align:center;padding:5rem 2rem;color:var(--muted)">Loading order…</div>`;

  let order;
  try {
    const res = await fetch(`/api/orders/${id}`);
    if (!res.ok) throw new Error('Not found');
    order = await res.json();
  } catch {
    app.innerHTML = page404();
    return '';
  }

  const addr = `${order.shipping_address}, ${order.shipping_city}, ${order.shipping_state} ${order.shipping_zip}`;

  app.innerHTML = `
  <div class="order-confirm-wrap">
    <div class="order-confirm-header">
      <div class="confirm-check">✓</div>
      <h1>Order Confirmed!</h1>
      <p>Thanks ${esc(order.customer_name.split(' ')[0])}! Your order is being prepared.</p>
      <div class="order-number-tag">${esc(order.order_number)}</div>
      <p style="margin-top:.75rem;font-size:.82rem;color:var(--muted-lt)">
        A confirmation has been sent to <strong style="color:var(--text)">${esc(order.customer_email)}</strong>
      </p>
    </div>

    <div class="order-confirm-grid">
      <div class="confirm-card">
        <div class="confirm-card-title">Items Ordered</div>
        <div class="confirm-card-body">
          ${order.items.map(l => `
            <div class="confirm-item-row">
              <span>${esc(l.name)} <span class="confirm-item-qty">× ${l.qty}</span></span>
              <span>${money(l.price * l.qty)}</span>
            </div>`).join('')}
          ${order.gst != null ? `
          <div class="confirm-item-row" style="color:var(--muted);font-size:.82rem">
            <span>GST (10%)</span><span>${money(order.gst)}</span>
          </div>` : ''}
          ${order.shipping_cost > 0 ? `
          <div class="confirm-item-row" style="color:var(--muted);font-size:.82rem">
            <span>Shipping</span><span>${money(order.shipping_cost)}</span>
          </div>` : `
          <div class="confirm-item-row" style="color:var(--muted);font-size:.82rem">
            <span>Shipping</span><span>Free</span>
          </div>`}
          <div class="confirm-total-row">
            <span>Total (inc. GST)</span><span>${money(order.total)}</span>
          </div>
        </div>
      </div>
      <div class="confirm-card">
        <div class="confirm-card-title">Shipping To</div>
        <div class="confirm-card-body">
          <strong>${esc(order.customer_name)}</strong>
          ${esc(order.shipping_address)}<br>
          ${esc(order.shipping_city)}, ${esc(order.shipping_state)} ${esc(order.shipping_zip)}<br>
          ${esc(order.shipping_country)}
        </div>
      </div>
    </div>

    <div class="confirm-actions">
      <button class="btn-hero" onclick="navigate('/shop')">Continue Shopping</button>
      <button class="btn-hero-outline" style="border-color:var(--border-md);color:var(--text)" onclick="navigate('/track?order=${esc(order.order_number)}')">Track This Order</button>
    </div>
  </div>`;
  return '';
}

// order tracking — customers look up their order using email and order number
function pageTrack() {
  const preOrder = new URLSearchParams(location.search).get('order') || '';
  return `
  <div class="track-wrap">
    <div class="track-hero">
      <h1>Track Your Order</h1>
      <p>Enter your email address and order number to check your order status.</p>
    </div>

    <div class="track-form-card">
      <div id="trackError" class="checkout-error"></div>
      <div class="cf-group">
        <label>Email Address</label>
        <input id="track-email" type="email" placeholder="jane@example.com" autocomplete="email">
      </div>
      <div class="cf-group" style="margin-bottom:1.25rem">
        <label>Order Number</label>
        <input id="track-order" type="text" placeholder="BIZ-123456" value="${esc(preOrder)}"
               style="text-transform:uppercase;font-family:monospace;letter-spacing:.04em"
               oninput="this.value=this.value.toUpperCase()"
               onkeydown="if(event.key==='Enter')lookupOrder()">
      </div>
      <button class="btn-hero" style="width:100%" onclick="lookupOrder()">Find My Order →</button>
    </div>

    <div id="trackResult"></div>
  </div>`;
}

const TRACK_STATUS_LABELS = {
  pending: 'Pending', processing: 'Processing', shipped: 'Shipped',
  delivered: 'Delivered', cancelled: 'Cancelled',
  return_requested: 'Return Requested', refunded: 'Refunded',
};

async function lookupOrder() {
  const email    = $('track-email')?.value?.trim();
  const orderNum = $('track-order')?.value?.trim().toUpperCase();
  const errEl    = $('trackError');

  if (!email || !orderNum) {
    errEl.textContent = 'Please enter your email address and order number.';
    errEl.classList.add('visible');
    return;
  }
  errEl.classList.remove('visible');
  $('trackResult').innerHTML = `<p style="text-align:center;color:var(--muted);padding:2rem">Looking up order…</p>`;

  try {
    const res   = await fetch(`/api/orders/lookup?email=${encodeURIComponent(email)}&order_number=${encodeURIComponent(orderNum)}`);
    const order = await res.json();
    if (!res.ok) throw new Error(order.error || 'Order not found');
    renderTrackResult(order);
  } catch (err) {
    $('trackResult').innerHTML = '';
    errEl.textContent = err.message;
    errEl.classList.add('visible');
  }
}

function renderTrackResult(order) {
  const sub      = order.subtotal ?? order.total;
  const gst      = order.gst ?? null;
  const shipping = order.shipping_cost || 0;

  $('trackResult').innerHTML = `
    <div class="track-result-card">
      <div class="track-result-header">
        <div>
          <div class="track-order-num">${esc(order.order_number)}</div>
          <div class="track-order-date">${new Date(order.created_at).toLocaleDateString('en-AU', { day:'numeric', month:'long', year:'numeric' })}</div>
        </div>
        <span class="order-badge ${order.status}">${TRACK_STATUS_LABELS[order.status] || order.status}</span>
      </div>

      <div class="track-items">
        ${order.items.map(l => `
          <div class="track-item-row">
            <span>${esc(l.name)} <span class="track-qty">× ${l.qty}</span></span>
            <span>${money(l.price * l.qty)}</span>
          </div>`).join('')}
        ${gst != null ? `<div class="track-item-row muted"><span>GST (10%)</span><span>${money(gst)}</span></div>` : ''}
        <div class="track-item-row muted"><span>Shipping</span><span>${shipping > 0 ? money(shipping) : 'Free'}</span></div>
        <div class="track-total-row"><span>Total (inc. GST)</span><span>${money(order.total)}</span></div>
      </div>

      <div class="track-address">
        <div class="track-address-label">Shipping To</div>
        <p>${esc(order.customer_name)}<br>${esc(order.shipping_address)}<br>${esc(order.shipping_city)}, ${esc(order.shipping_state)} ${esc(order.shipping_zip)}</p>
      </div>

      ${order.tracking_number ? `
      <div class="track-notes" style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-lt);">
        <div class="track-address-label">📦 Tracking Number</div>
        <p style="font-family:monospace;font-size:1rem;font-weight:700;margin:.25rem 0 0;letter-spacing:.5px">${esc(order.tracking_number)}</p>
      </div>` : ''}
      ${order.notes ? `<div class="track-notes"><div class="track-address-label">Order Notes</div><p>${esc(order.notes)}</p></div>` : ''}
    </div>`;
}

// about page
function pageAbout() {
  return `
  <div class="page-hero">
    <h1>About BIZShop</h1>
    <p>Quality tools and custom parts for makers</p>
  </div>
  <div class="about-wrap">
    <div class="about-section">
      <h2>Our Story</h2>
      <p>BIZShop started out of a cluttered garage workshop and a frustration with overpriced, hard-to-find tools. We believe every maker — whether you're building furniture, maintaining a car, or prototyping the next great invention — deserves access to quality tools without hunting through dozens of stores.</p>
      <p>What started as a small collection of hand-picked tools has grown to include a full line of custom 3D printed parts and hardware essentials. Every product we carry is something we've used ourselves and trust.</p>
    </div>

    <div class="about-section">
      <h2>What We Offer</h2>
      <div class="about-grid">
        ${[
          {icon:'🔧', title:'Hand Tools',   body:'Carefully selected wrenches, screwdrivers, hex keys, and more. Quality steel, comfortable grips, fair prices.'},
          {icon:'🖨️', title:'3D Printed Parts', body:'Custom-designed parts printed on-demand. Organizers, mounts, holders — things you need but can\'t always find.'},
          {icon:'🔩', title:'Hardware',     body:'Fastener assortments, brackets, and hardware bits. The small stuff that holds every project together.'},
        ].map(c => `
          <div class="about-card">
            <div class="acard-icon">${c.icon}</div>
            <h3>${c.title}</h3>
            <p>${c.body}</p>
          </div>`).join('')}
      </div>
    </div>

    <div class="about-section">
      <h2>Our Promise</h2>
      <p>We only list products we'd buy ourselves. If something doesn't meet our standard, it doesn't make it to the shelf. Every item ships from our own stock — no dropshipping, no mystery delays.</p>
      <p>Have a question or need something custom? <span style="color:var(--accent);cursor:pointer;font-weight:600" onclick="navigate('/contact')">Get in touch</span> — we actually respond.</p>
    </div>
  </div>`;
}

// contact page
function pageContact() {
  return `
  <div class="page-hero">
    <h1>Get in Touch</h1>
    <p>We'd love to hear from you</p>
  </div>
  <div class="contact-wrap">
    <div class="contact-info">
      <h2>Contact Information</h2>
      <p>Have a question about an order, need a custom part, or just want to say hi? Drop us a line and we'll get back to you within one business day.</p>

      ${[
        {icon:'📧', title:'Email',    body:'hello@bizshop.com'},
        {icon:'📞', title:'Phone',    body:'(555) 012-3456<br><small style="color:var(--muted-lt)">Mon–Fri, 9am–5pm</small>'},
        {icon:'📍', title:'Location', body:'123 Maker Lane<br>Workshop City, WS 00001'},
      ].map(c => `
        <div class="contact-item">
          <div class="ci-icon">${c.icon}</div>
          <div>
            <h4>${c.title}</h4>
            <p>${c.body}</p>
          </div>
        </div>`).join('')}
    </div>

    <div class="contact-form-card" id="contactFormWrap">
      <h2>Send a Message</h2>
      <form id="contactForm" onsubmit="submitContact(event)">
        <div class="cform-row">
          <div class="cform-group">
            <label>First Name</label>
            <input type="text" placeholder="Jane" required>
          </div>
          <div class="cform-group">
            <label>Last Name</label>
            <input type="text" placeholder="Smith" required>
          </div>
        </div>
        <div class="cform-group">
          <label>Email</label>
          <input type="email" placeholder="jane@example.com" required>
        </div>
        <div class="cform-group">
          <label>Subject</label>
          <select>
            <option>General Inquiry</option>
            <option>Order Question</option>
            <option>Custom Part Request</option>
            <option>Product Feedback</option>
            <option>Other</option>
          </select>
        </div>
        <div class="cform-group">
          <label>Message</label>
          <textarea placeholder="Tell us what's on your mind…" required></textarea>
        </div>
        <button type="submit" class="btn-submit">Send Message →</button>
      </form>
    </div>
  </div>`;
}

function submitContact(e) {
  e.preventDefault();
  $('contactFormWrap').innerHTML = `
    <div class="form-success">
      <div class="fs-icon">✅</div>
      <h3>Message Sent!</h3>
      <p>Thanks for reaching out. We'll get back to you within one business day.</p>
    </div>`;
  showToast('Message sent — we\'ll be in touch!', 'success');
}

// 404 — for when someone wanders somewhere that doesn't exist
function page404() {
  return `
  <div style="text-align:center;padding:6rem 2rem;">
    <div style="font-size:3rem;opacity:.3;margin-bottom:1rem">🔍</div>
    <h1 style="font-size:1.5rem;font-weight:800;margin-bottom:.5rem">Page Not Found</h1>
    <p style="color:var(--muted);margin-bottom:1.5rem">That page doesn't exist.</p>
    <button class="btn-hero" onclick="navigate('/')">Back to Home</button>
  </div>`;
}

// product card HTML — reused on the home page, shop page, and related products
function productCard(item) {
  return `
  <div class="product-card" data-product-id="${item.id}">
    <div class="img-wrap">
      ${item.image_url
        ? `<img src="${esc(item.image_url)}" alt="${esc(item.name)}" loading="lazy" onload="this.classList.add('img-loaded')">`
        : `<div class="ph-icon">${slugIcon(item.category_slug)}</div>`}
      ${item.stock <= 0
        ? '<div class="oos-badge">Out of Stock</div>'
        : item.stock <= (parseInt(S.siteSettings.low_stock_threshold) || 5)
          ? `<div class="low-stock-badge">Only ${item.stock} left</div>`
          : ''}
    </div>
    <div class="card-body">
      <div class="cat-tag">${esc(item.category_name)}</div>
      <div class="item-name">${esc(item.name)}</div>
      <div class="item-desc">${esc(item.description || '')}</div>
    </div>
    <div class="card-foot">
      <span class="price">${money(item.price)}</span>
      <button class="btn-add" data-add-cart="${item.id}" ${item.stock <= 0 ? 'disabled' : ''}>
        ${item.stock <= 0 ? 'Sold Out' : '+ Add'}
      </button>
    </div>
  </div>`;
}

function emptyState(title, sub) {
  return `<div class="empty-state"><div class="ei">🔍</div><h3>${title}</h3><p>${sub}</p></div>`;
}

// wires up event listeners after each render — product cards, filters, qty pickers, cart
function afterRender(path) {
  $('app').querySelectorAll('[data-product-id]').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-add-cart]')) return; // handled below
      navigate(`/product/${card.dataset.productId}`);
    });
  });

  $('app').querySelectorAll('[data-add-cart]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!btn.disabled) cartAdd(btn.dataset.addCart);
    });
  });

  if ($('shopSort')) {
    $('shopSort').addEventListener('change', () => { shopState.sort = $('shopSort').value; shopState.page = 1; applyShopFilters(); });
    $('inStockOnly').addEventListener('change', () => { shopState.inStock = $('inStockOnly').checked; shopState.page = 1; applyShopFilters(); });
    let priceTimer;
    const onPriceInput = () => { clearTimeout(priceTimer); priceTimer = setTimeout(() => { shopState.minPrice = $('priceMin')?.value || ''; shopState.maxPrice = $('priceMax')?.value || ''; shopState.page = 1; applyShopFilters(); }, 300); };
    $('priceMin')?.addEventListener('input', onPriceInput);
    $('priceMax')?.addEventListener('input', onPriceInput);
  }

  const detailImg = $('detailMainImg');
  if (detailImg) {
    detailImg.addEventListener('click', () => openLightbox(detailImg.src, detailImg.alt));
  }

  const qtyMinus = $('qtyMinus'), qtyPlus = $('qtyPlus'), qtyVal = $('qtyVal');
  const addBtn = $('detailAddBtn');
  if (qtyMinus && qtyPlus && qtyVal && addBtn) {
    const item = S.items.find(i => i.id === addBtn.dataset.itemId);
    const max = item ? item.stock : 99;
    qtyMinus.addEventListener('click', () => { if (S.detailQty > 1) { S.detailQty--; qtyVal.textContent = S.detailQty; } });
    qtyPlus.addEventListener('click',  () => { if (S.detailQty < max) { S.detailQty++; qtyVal.textContent = S.detailQty; } });
    addBtn.addEventListener('click', () => { cartAdd(addBtn.dataset.itemId, S.detailQty); });
  }

  $('app').querySelectorAll('[data-cart-inc]').forEach(b => b.addEventListener('click', () => {
    const line = S.cart.find(l => l.id === b.dataset.cartInc);
    if (line) { cartSetQty(line.id, line.qty + 1); render(); }
  }));
  $('app').querySelectorAll('[data-cart-dec]').forEach(b => b.addEventListener('click', () => {
    const line = S.cart.find(l => l.id === b.dataset.cartDec);
    if (line) { cartSetQty(line.id, line.qty - 1); render(); }
  }));
  $('app').querySelectorAll('[data-cart-remove]').forEach(b => b.addEventListener('click', () => {
    cartRemove(b.dataset.cartRemove); render();
  }));
}

// boot sequence — loads categories, items, and settings, then renders the page
function calcShipping(state, subtotal) {
  const s = S.siteSettings;
  const mode = s.shipping_mode || 'free';
  if (mode === 'free') return 0;
  const threshold = parseFloat(s.shipping_free_threshold) || 0;
  if (threshold > 0 && subtotal >= threshold) return 0;
  if (mode === 'flat') return parseFloat(s.shipping_flat_rate) || 0;
  if (mode === 'by_state' && state) return parseFloat(s[`shipping_${state}`] ?? s.shipping_flat_rate) || 0;
  return null; // by_state with no state selected = unknown
}

function updateCheckoutShipping() {
  const state    = $('cf-state')?.value;
  const subtotal = cartTotal();
  const gst      = Math.round(subtotal * 0.10 * 100) / 100;
  const cost     = calcShipping(state, subtotal);

  const shEl  = $('checkoutShippingVal');
  const totEl = $('checkoutTotalVal');
  if (!shEl || !totEl) return;

  if (cost === null) {
    shEl.innerHTML = '<em style="color:var(--muted);font-size:.82rem">Select state</em>';
    totEl.textContent = '—';
  } else {
    shEl.textContent  = cost === 0 ? 'Free' : money(cost);
    shEl.className    = cost === 0 ? 'free' : '';
    const total = Math.round((subtotal + gst + cost) * 100) / 100;
    totEl.textContent = money(total);
  }
}

async function init() {
  try {
    [S.categories, S.items, S.siteSettings] = await Promise.all([
      get('/api/categories'),
      get('/api/items'),
      get('/api/settings').catch(() => ({})),
    ]);
  } catch (e) {
    showToast('Failed to load products', 'error');
  }
  updateCartBadge();
  render();
}

init();
