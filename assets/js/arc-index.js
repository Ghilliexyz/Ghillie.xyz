// ---- Config ----
const DATA_URL = '/assets/data/arc_items.json';

const nf = new Intl.NumberFormat('en-GB');

// Basic HTML escaping
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(n) {
  if (n === null || n === undefined) return '—';
  return nf.format(n);
}

function formatWeight(w) {
  if (w === null || w === undefined) return '—';
  return `${w}`;
}

document.addEventListener('DOMContentLoaded', () => {
  const els = {
    search: document.getElementById('aiSearch'),
    rarity: document.getElementById('rarityFilter'),
    category: document.getElementById('categoryFilter'),
    recycle: document.getElementById('recycleFilter'),
    clear: document.getElementById('clearFilters'),
    itemsCount: document.getElementById('itemsCount'),
    itemsShown: document.getElementById('itemsShown'),
    itemsList: document.getElementById('itemsList'),
    loading: document.getElementById('itemsLoading'),
    error: document.getElementById('itemsError'),
  };

  let items = [];
  let filteredItems = [];

  // ---- Load data ----
  fetch(DATA_URL)
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} loading ${DATA_URL}`);
      }
      return res.json();
    })
    .then(data => {
      items = (data || []).map(it => ({
        ...it,
        recycle_to: it.recycle_to || [],
        used_in_crafting: it.used_in_crafting || [],
      }));

      els.itemsCount.textContent = items.length.toString();
      buildFilterOptions(items, els);
      applyFilters({ items, els });
    })
    .catch(err => {
      console.error('Failed to load items JSON:', err);
      if (els.error) {
        els.error.hidden = false;
      }
    })
    .finally(() => {
      if (els.loading) els.loading.hidden = true;
    });

  // ---- Events ----
  if (els.search) {
    els.search.addEventListener('input', () => applyFilters({ items, els }));
  }
  if (els.rarity) {
    els.rarity.addEventListener('change', () => applyFilters({ items, els }));
  }
  if (els.category) {
    els.category.addEventListener('change', () => applyFilters({ items, els }));
  }
  if (els.recycle) {
    els.recycle.addEventListener('change', () => applyFilters({ items, els }));
  }
  if (els.clear) {
    els.clear.addEventListener('click', () => {
      if (els.search) els.search.value = '';
      if (els.rarity) els.rarity.value = '';
      if (els.category) els.category.value = '';
      if (els.recycle) els.recycle.value = '';
      applyFilters({ items, els });
    });
  }
});

// ---- Build filters from data ----
function buildFilterOptions(items, els) {
  const raritySet = new Set();
  const categorySet = new Set();
  const recycleSet = new Set();

  for (const it of items) {
    if (it.rarity) raritySet.add(it.rarity);
    if (it.category) categorySet.add(it.category);
    for (const rec of it.recycle_to || []) {
      if (rec.item) recycleSet.add(rec.item);
    }
  }

  const rarities = Array.from(raritySet).sort();
  const categories = Array.from(categorySet).sort();
  const recyclables = Array.from(recycleSet).sort();

  fillSelect(els.rarity, rarities, 'All');
  fillSelect(els.category, categories, 'All');
  fillSelect(els.recycle, recyclables, 'Any');
}

function fillSelect(selectEl, values, defaultLabel) {
  if (!selectEl) return;
  // keep the first <option> as default
  const first = selectEl.querySelector('option');
  selectEl.innerHTML = '';
  if (first) {
    first.value = '';
    first.textContent = defaultLabel;
    selectEl.appendChild(first);
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = defaultLabel;
    selectEl.appendChild(opt);
  }

  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
}

// ---- Filtering + rendering ----
function applyFilters({ items, els }) {
  if (!Array.isArray(items) || !els.itemsList) return;

  const qRaw = (els.search?.value || '').trim();
  const q = qRaw.toLowerCase();

  const rarity = els.rarity?.value || '';
  const category = els.category?.value || '';
  const recycleTarget = (els.recycle?.value || '').toLowerCase();

  // Special pattern: "recycle X"
  let recycleQuery = null;
  const m = q.match(/^recycle\s+(.+)/i);
  if (m && m[1]) {
    recycleQuery = m[1].trim().toLowerCase();
  }

  const results = items.filter(it => {
    // basic filters
    if (rarity && it.rarity !== rarity) return false;
    if (category && it.category !== category) return false;

    const recNames = (it.recycle_to || [])
      .map(r => (r.item || '').toLowerCase());

    if (recycleTarget && !recNames.includes(recycleTarget)) return false;

    if (recycleQuery) {
      // In recycle mode we only care about items that recycle into the target
      if (!recNames.includes(recycleQuery)) return false;
      return true;
    }

    if (!q) return true;

    const haystack = [
      it.name,
      it.rarity,
      it.category,
      it.recycle_to_raw,
      it.keep_for,
      ...(it.used_in_crafting || []).map(u => u.name),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });

  els.itemsShown.textContent = results.length.toString();
  renderItems(results, els.itemsList);
}

function renderItems(list, container) {
  if (!container) return;

  if (!list.length) {
    container.innerHTML = '<p class="muted noResults">No items match your search.</p>';
    return;
  }

  const html = list.map(it => renderItemCard(it)).join('\n');
  container.innerHTML = html;
}

function renderItemCard(it) {
  const imgHtml = it.image_url
    ? `<img class="itemIcon" src="${escapeHtml(it.image_url)}" alt="${escapeHtml(it.name)}">`
    : `<div class="itemIcon itemIcon--placeholder">${escapeHtml(it.name?.charAt(0) || '?')}</div>`;

  const rarityPill = it.rarity
    ? `<span class="pill">${escapeHtml(it.rarity)}</span>`
    : '';

  const categoryPill = it.category
    ? `<span class="pill">${escapeHtml(it.category)}</span>`
    : '';

  const sellPerItem = formatNumber(it.sell_price);
  const stackSize = it.stack_size ?? null;
  const sellPerStack = (it.sell_price_per_stack != null)
    ? formatNumber(it.sell_price_per_stack)
    : (it.sell_price != null && stackSize)
      ? formatNumber(it.sell_price * stackSize)
      : '—';

  const weight = formatWeight(it.weight);

  // Recycles to chips
  const recycleChips = (it.recycle_to || []).length
    ? it.recycle_to.map(r => {
        const amount = r.amount != null ? `${r.amount}x ` : '';
        return `<span class="chip">${amount}${escapeHtml(r.item || '')}</span>`;
      }).join(' ')
    : `<span class="chip">Cannot be recycled / unknown</span>`;

  // Used in chips
  const uses = it.used_in_crafting || [];
  const usesChips = uses.length
    ? uses.slice(0, 6).map(u => {
        const name = escapeHtml(u.name || '');
        const href = u.wiki_url ? escapeHtml(u.wiki_url) : null;
        if (href) {
          return `<a class="chip" href="${href}" target="_blank" rel="noopener noreferrer">${name}</a>`;
        }
        return `<span class="chip">${name}</span>`;
      }).join(' ')
      : `<span class="chip">No crafting uses found</span>`;

  const keepFor = it.keep_for ? escapeHtml(it.keep_for) : '';

  const wikiLink = it.wiki_url
    ? `<a class="wikiLink" href="${escapeHtml(it.wiki_url)}" target="_blank" rel="noopener noreferrer">
         Open on ARC Raiders Wiki
       </a>`
    : '';

  return `
<article class="itemCard">
  <div class="itemMain">
    ${imgHtml}
    <div class="itemText">
      <h3>${escapeHtml(it.name || 'Unknown item')}</h3>
      <div class="itemMetaLine">
        ${rarityPill}
        ${categoryPill}
      </div>
      ${wikiLink}
      ${keepFor ? `<div class="muted" style="font-size:11px;margin-top:4px;">Keep for: ${keepFor}</div>` : ''}
    </div>
  </div>

  <div class="itemDetailsRight">
    <dl class="itemStats">
      <div>
        <dt>Sell (1)</dt>
        <dd>${sellPerItem}</dd>
      </div>
      <div>
        <dt>Sell (stack)</dt>
        <dd>${sellPerStack}${stackSize ? ` (x${stackSize})` : ''}</dd>
      </div>
      <div>
        <dt>Stack size</dt>
        <dd>${stackSize != null ? stackSize : '—'}</dd>
      </div>
      <div>
        <dt>Weight</dt>
        <dd>${weight}</dd>
      </div>
    </dl>

    <div>
      <div class="itemSectionTitle">Recycles to</div>
      <div class="itemRecycleList">
        ${recycleChips}
      </div>
    </div>

    <div>
      <div class="itemSectionTitle">Used in</div>
      <div class="itemUsesList">
        ${usesChips}
      </div>
    </div>
  </div>
</article>`;
}
