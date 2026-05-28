let allProducts = [];
let allCategories = [];
let activeSlug = '';
let cart = [];

async function init() {
  const [cats, items] = await Promise.all([
    fetch('/api/categories').then(r => r.json()),
    fetch('/api/items?active=1').then(r => r.json())
  ]);
  allCategories = cats;
  allProducts = items;
  buildSidebar();
  renderProducts();
}

function buildSidebar() {
  const list = document.getElementById('catList');
  const allLi = list.querySelector('[data-slug=""]');
  document.getElementById('allBadge').textContent = allProducts.length;

  allCategories.forEach(cat => {
    const count = allProducts.filter(p => p.category_slug === cat.slug).length;
    const li = document.createElement('li');
    li.dataset.slug = cat.slug;
    li.innerHTML = `${cat.name} <span class="badge">${count}</span>`;
    li.onclick = () => filterCat(li, cat.slug);
    list.appendChild(li);
  });
}

function filterCat(el, slug) {
  document.querySelectorAll('.cat-list li').forEach(l => l.classList.remove('active'));
  el.classList.add('active');
  activeSlug = slug;
  document.getElementById('sectionTitle').textContent = slug
    ? allCategories.find(c => c.slug === slug)?.name || 'Products'
    : 'All Products';
  renderProducts();
}

function doSearch() {
  renderProducts(document.getElementById('searchInput').value.trim());
}

document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch();
});

function renderProducts(search = document.getElementById('searchInput').value.trim()) {
  const inStockOnly = document.getElementById('inStockOnly').checked;
  let filtered = allProducts.filter(p => {
    if (activeSlug && p.category_slug !== activeSlug) return false;
    if (inStockOnly && p.stock <= 0) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  document.getElementById('productCount').textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;

  const grid = document.getElementById('productsGrid');
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state">
      <h3>No products found</h3>
      <p>Try adjusting your search or filters.</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="product-card">
      <div class="img-wrap">
        ${p.image_url
          ? `<img src="${p.image_url}" alt="${p.name}">`
          : `<span class="placeholder-icon">${categoryIcon(p.category_slug)}</span>`}
        ${p.stock <= 0 ? '<span class="out-of-stock-badge">Out of Stock</span>' : ''}
      </div>
      <div class="card-body">
        <div class="cat-tag">${p.category_name}</div>
        <div class="item-name">${p.name}</div>
        <div class="item-desc">${p.description || ''}</div>
      </div>
      <div class="card-footer">
        <span class="price">$${parseFloat(p.price).toFixed(2)}</span>
        <button class="add-btn" ${p.stock <= 0 ? 'disabled' : ''} onclick="addToCart(${p.id}, '${esc(p.name)}', ${p.price})">
          ${p.stock <= 0 ? 'Sold Out' : 'Add'}
        </button>
      </div>
    </div>
  `).join('');
}

function categoryIcon(slug) {
  const map = { 'hand-tools': '🔧', '3d-printed': '🖨️', 'hardware': '🔩' };
  return map[slug] || '📦';
}

function esc(str) { return str.replace(/'/g, "\\'"); }

function addToCart(id, name, price) {
  const existing = cart.find(c => c.id === id);
  if (existing) { existing.qty++; } else { cart.push({ id, name, price, qty: 1 }); }
  document.getElementById('cartCount').textContent = cart.reduce((s, c) => s + c.qty, 0);
  document.getElementById('cartCount').style.display = cart.length ? '' : 'none';
  showToast(`Added "${name}" to cart`, 'success');
}

function showToast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

init();
