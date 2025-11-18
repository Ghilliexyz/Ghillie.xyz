// ---- Config ----
const DATA_URL = '/assets/data/arc_items.json';

const nf = new Intl.NumberFormat('en-GB');

// Known rarities + sort order (for filter + pill colours)
const KNOWN_RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const RARITY_ORDER = KNOWN_RARITIES.reduce((acc, r, idx) => {
  acc[r.toLowerCase()] = idx;
  return acc;
}, {});

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
    sort: document.getElementById('sortFilter'),
    clear: document.getElementById('clearFilters'),
    itemsCount: document.getElementById('itemsCount'),
    itemsShown: document.getElementById('itemsShown'),
    itemsList: document.getElementById('itemsList'),
    loading: document.getElementById('itemsLoading'),
    error: document.getElementById('itemsError'),
  };

  let items = [];

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

      if (els.itemsCount) els.itemsCount.textContent = items.length.toString();
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
  if (els.sort) {
    els.sort.addEventListener('change', () => applyFilters({ items, els }));
  }
  if (els.clear) {
    els.clear.addEventListener('click', () => {
      if (els.search) els.search.value = '';
      if (els.rarity) els.rarity.value = '';
      if (els.category) els.category.value = '';
      if (els.sort) els.sort.value = '';
      applyFilters({ items, els });
    });
  }
});

// ---- Build filters from data ----
function buildFilterOptions(items, els) {
  const raritySet = new Set(KNOWN_RARITIES);
  const categorySet = new Set();

  for (const it of items) {
    if (it.rarity) raritySet.add(it.rarity);
    if (it.category) categorySet.add(it.category);
  }

  const rarities = Array.from(raritySet);
  const categories = Array.from(categorySet);

  // Sort rarities by rank (Common -> Legendary), not alphabetically
  const sortedRarities = rarities.sort((a, b) => {
    const al = (a || '').toLowerCase();
    const bl = (b || '').toLowerCase();
    const ao = RARITY_ORDER.hasOwnProperty(al) ? RARITY_ORDER[al] : 999;
    const bo = RARITY_ORDER.hasOwnProperty(bl) ? RARITY_ORDER[bl] : 999;
    if (ao !== bo) return ao - bo;
    return al.localeCompare(bl);
  });

  const sortedCategories = categories.sort((a, b) =>
    (a || '').toLowerCase().localeCompare((b || '').toLowerCase())
  );

  fillSelect(els.rarity, sortedRarities, 'All');
  fillSelect(els.category, sortedCategories, 'All');
}

function fillSelect(selectEl, values, defaultLabel) {
  if (!selectEl) return;

  selectEl.innerHTML = '';

  const first = document.createElement('option');
  first.value = '';
  first.textContent = defaultLabel;
  selectEl.appendChild(first);

  values.forEach(v => {
    if (!v) return;
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });
}

// Helpers for sorting metrics
function getValue(it) {
  return it.sell_price != null ? it.sell_price : 0;
}
function getStack(it) {
  return it.stack_size != null ? it.stack_size : 0;
}
function getWeightMetric(it) {
  return it.weight != null ? it.weight : 0;
}

function sortItems(list, mode) {
  if (!mode) return list;
  const arr = [...list];

  arr.sort((a, b) => {
    switch (mode) {
      case 'value_desc': return getValue(b) - getValue(a);
      case 'value_asc':  return getValue(a) - getValue(b);
      case 'stack_desc': return getStack(b) - getStack(a);
      case 'stack_asc':  return getStack(a) - getStack(b);
      case 'weight_desc': return getWeightMetric(b) - getWeightMetric(a);
      case 'weight_asc':  return getWeightMetric(a) - getWeightMetric(b);
      default: return 0;
    }
  });

  return arr;
}

// ---- Filtering + rendering ----
function applyFilters({ items, els }) {
  if (!Array.isArray(items) || !els.itemsList) return;

  const qRaw = (els.search?.value || '').trim();
  const q = qRaw.toLowerCase();

  const rarity = els.rarity?.value || '';
  const category = els.category?.value || '';
  const sortMode = els.sort?.value || '';

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

  const sorted = sortItems(results, sortMode);

  if (els.itemsShown) {
    els.itemsShown.textContent = sorted.length.toString();
  }
  renderItems(sorted, els.itemsList);
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

  const raritySlug = (it.rarity || '').toLowerCase();
  const rarityClass = raritySlug ? ` pill--rarity pill--rarity-${raritySlug}` : '';

  const rarityPill = it.rarity
    ? `<span class="pill${rarityClass}">${escapeHtml(it.rarity)}</span>`
    : '';

  const categoryPill = it.category
    ? `<span class="pill pill--category">${escapeHtml(it.category)}</span>`
    : '';

  const sellPerItem = formatNumber(it.sell_price);
  const stackSize = it.stack_size ?? null;
  const sellPerStack = (it.sell_price_per_stack != null)
    ? formatNumber(it.sell_price_per_stack)
    : (it.sell_price != null && stackSize)
      ? formatNumber(it.sell_price * stackSize)
      : '—';

  const weight = formatWeight(it.weight);

  // Recycles to pills (with links when we have wiki_url)
  const recycleChips = (it.recycle_to || []).length
    ? it.recycle_to.map(r => {
        const amount = r.amount != null ? `${r.amount}x ` : '';
        const label  = escapeHtml(r.item || '');

        if (r.wiki_url) {
          const href = escapeHtml(r.wiki_url);
          return `<a class="recyclesToPill" href="${href}" target="_blank" rel="noopener noreferrer">${amount}${label}</a>`;
        }

        return `<span class="recyclesToPill">${amount}${label}</span>`;
      }).join(' ')
    : `<span class="recyclesToPill">Cannot be recycled / unknown</span>`;

  // Used in pills (with links when we have wiki_url)
  const uses = it.used_in_crafting || [];
  const usesChips = uses.length
    ? uses.slice(0, 6).map(u => {
        const name = escapeHtml(u.name || '');
        const href = u.wiki_url ? escapeHtml(u.wiki_url) : null;
        if (href) {
          return `<a class="usedInPill" href="${href}" target="_blank" rel="noopener noreferrer">${name}</a>`;
        }
        return `<span class="usedInPill">${name}</span>`;
      }).join(' ')
      : `<span class="usedInPill">No crafting uses found</span>`;

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
