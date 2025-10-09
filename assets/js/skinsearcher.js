// ===================== CS2 Skin Solver — app.js =====================

// ---------- Canonical rarity ordering + aliases ----------
const RARITY_ORDER = [
  "Consumer Grade", "Industrial Grade", "Mil-Spec",
  "Restricted", "Classified", "Covert", "Contraband",
  "High Grade","Remarkable","Exotic","Extraordinary",
  "Distinguished","Superior","Exceptional","Master"
];

const RARITY_ALIASES = new Map([
  ["consumer grade","Consumer Grade"],
  ["industrial grade","Industrial Grade"],
  ["mil spec","Mil-Spec"], ["mil-spec","Mil-Spec"], ["milspec","Mil-Spec"],
  ["restricted","Restricted"], ["classified","Classified"], ["covert","Covert"], ["contraband","Contraband"],
  ["high grade","High Grade"], ["remarkable","Remarkable"], ["exotic","Exotic"], ["extraordinary","Extraordinary"],
  ["distinguished","Distinguished"], ["superior","Superior"], ["exceptional","Exceptional"], ["master","Master"]
]);

// Keep unknown years for range ("higher/lower") comparisons
const KEEP_UNKNOWN_YEARS_FOR_RANGE = true;

// Auto-load JSON from your path
const DEFAULT_JSON_URL = '/assets/cs2dleStuff/skins.json';

// ---------- Demo fallback (trim to your dataset structure) ----------
const DEMO = [
  {"url":"https://csgoskins.gg/items/ak-47-orbit-mk01","weapon":"AK-47","rarity":"Restricted","category":"Rifle","playside":"Terrorist","year":2013,"name":"AK-47 | Orbit Mk01"},
  {"url":"https://csgoskins.gg/items/ak-47-blue-laminate","weapon":"AK-47","rarity":"Mil-Spec","category":"Rifle","playside":"Terrorist","year":2013,"name":"AK-47 | Blue Laminate"},
  {"url":"https://csgoskins.gg/items/awp-printstream","weapon":"AWP","rarity":"Covert","category":"Sniper Rifle","playside":"Both Teams","year":2020,"name":"AWP | Printstream"},
  {"url":"https://csgoskins.gg/items/m4a4-royal-paladin","weapon":"M4A4","rarity":"Covert","category":"Rifle","playside":"CT","year":2015,"name":"M4A4 | Royal Paladin"},
  {"url":"https://csgoskins.gg/items/mag-7-praetorian","weapon":"MAG-7","rarity":"Mil-Spec","category":"Heavy","playside":"CT","year":2015,"name":"MAG-7 | Praetorian"},
  {"url":"https://csgoskins.gg/items/driver-gloves-convoy","weapon":"Gloves","rarity":"Extraordinary","category":"Gloves","playside":"Both Teams","year":2016,"name":"Driver Gloves | Convoy"},
  {"url":"https://csgoskins.gg/items/★-karambit-doppler","weapon":"★ Karambit","rarity":"Covert","category":"Knife","playside":"Both Teams","year":2015,"name":"★ Karambit | Doppler"},
  {"url":"https://csgoskins.gg/items/sticker-banana","weapon":"Sticker","rarity":"High Grade","category":"Sticker","playside":"Both Teams","year":2014,"name":"Sticker | Banana"},
  {"url":"https://csgoskins.gg/items/revolution-case","weapon":"Case","rarity":null,"category":"Case","playside":"Both Teams","year":2023,"name":"Revolution Case"}
];

// ---------- State ----------
let DATA = [...DEMO];
let CANDIDATES = [...DATA];
let EXCLUDED = new Set();
let CONSTRAINTS = []; // {field, verdict, value}
let HISTORY = [];     // per-guess snapshot for UI
let SELECTED = null;  // the picked item from search

// Pills: pending verdicts for the currently-selected item (null = not chosen)
let PENDING = { weapon:null, rarity:null, category:null, playside:null, year:null };

// ---------- Elements ----------
const $ = id => document.getElementById(id);
const els = {
  fileInput: $('fileInput'),
  resetBtn: $('resetBtn'),

  searchInput: $('searchInput'),
  searchList: $('searchList'),

  selectedCard: $('selectedCard'),
  selName: $('selName'),
  selWeapon: $('selWeapon'),
  selRarity: $('selRarity'),
  selCategory: $('selCategory'),
  selPlayside: $('selPlayside'),
  selYear: $('selYear'),

  addGuessBtn: $('addGuessBtn'),
  guessStatus: $('guessStatus'),

  constraints: $('constraints'),
  history: $('history'),
  candidateCount: $('candidateCount'),
  resultTableBody: document.querySelector('#resultTable tbody'),
};

// ===================== Utilities =====================
function canonStr(s){ return (s ?? "").toString().trim(); }

function canonRarity(r){
  const key = canonStr(r).toLowerCase().replace(/\s+/g,' ');
  return RARITY_ALIASES.get(key) || (r ? r.toString().trim() : null);
}

function canonCategory(c){
  const s = canonStr(c).toLowerCase();
  if (!s) return null;
  if (s.includes("sniper")) return "Sniper Rifle";
  if (s === "rifle") return "Rifle";
  if (s.includes("heavy")) return "Heavy";
  if (s.includes("smg")) return "SMG";
  if (s.includes("pistol")) return "Pistol";
  if (s.includes("glove")) return "Gloves";
  if (s.includes("knife") || s.includes("karambit") || s.includes("bayonet")) return "Knife";
  if (s.includes("sticker")) return "Sticker";
  if (s.includes("case") || s.includes("container")) return "Case";
  if (s.includes("agent")) return "Agent";
  if (s.includes("patch")) return "Patch";
  if (s.includes("music")) return "Music Kit";
  if (s.includes("souvenir")) return "Souvenir Package";
  return c.toString().trim();
}

// ---- TRI-STATE playside canonicalization ----
function canonPlayside(p){
  const s = canonStr(p).toLowerCase();
  if (!s) return null;
  if (s.startsWith('ct')) return 'CT-side';
  if (s.startsWith('t'))  return 'T-side';
  if (s.includes('both') || s.includes('teams') || s.includes('team') || s.includes('any') || s.includes('all') || s.includes('either'))
    return 'Both sides';
  return 'Both sides';
}

function compareRarity(a, b){
  const A = canonRarity(a);
  const B = canonRarity(b);
  const ia = RARITY_ORDER.indexOf(A);
  const ib = RARITY_ORDER.indexOf(B);
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib); // >0 ⇒ a is higher
}

function uniq(arr){ return Array.from(new Set(arr)); }
function mkBadge(text, ok){
  const el = document.createElement('span');
  el.className = 'badge ' + (ok ? 'ok' : 'bad');
  el.textContent = text;
  return el;
}

function finishOfName(name){
  if(!name) return '';
  const i = name.indexOf('|');
  return i >= 0 ? name.slice(i+1).trim() : name.trim();
}

function normalize(s){ return String(s||'').toLowerCase().replace(/\s+/g,' ').trim(); }

function matchScore(item, q){
  const name = normalize(item.name);
  const finish = normalize(finishOfName(item.name));
  q = normalize(q);
  if(!q) return -1;
  let score = 0;
  if(name.includes(q)) score += 3;
  if(finish.includes(q)) score += 2;
  // tiny fuzzy
  let i = 0, hits = 0;
  for(const ch of name){
    if(i < q.length && ch === q[i]){ i++; hits++; }
  }
  return score + Math.min(hits, 3);
}

// ===================== Search & Select =====================
function renderSearchList(q){
  const list = DATA
    .map(it => ({ it, s: matchScore(it, q) }))
    .filter(x => x.s > 0)
    .sort((a,b)=> b.s - a.s)
    .slice(0, 150)
    .map(({it}) => it);

  if(list.length === 0){
    els.searchList.style.display = 'none';
    els.searchList.innerHTML = '';
    return;
  }

  const grouped = {};
  list.forEach(it=>{
    const fin = finishOfName(it.name);
    grouped[fin] = grouped[fin] || [];
    grouped[fin].push(it);
  });

  const frag = document.createDocumentFragment();
  Object.entries(grouped).forEach(([fin, items])=>{
    items.forEach(it=>{
      const div = document.createElement('div');
      div.className = 'finder__search-item';
      div.innerHTML = `
        <div>
          <div>${it.name}</div>
          <div class="meta">${it.weapon} • ${it.rarity ?? '-'} • ${it.category ?? '-'} • ${canonPlayside(it.playside) ?? '-'} • ${it.year ?? '-'}</div>
        </div>
        <div class="meta">${items.length > 1 ? `${items.length}×` : ''}</div>
      `;
      div.addEventListener('click', ()=>{
        els.searchInput.value = it.name;
        els.searchList.style.display = 'none';
        setSelected(it);
      });
      frag.appendChild(div);
    });
  });

  els.searchList.innerHTML = '';
  els.searchList.appendChild(frag);
  els.searchList.style.display = 'block';
}

els.searchInput.addEventListener('input', e=>{
  renderSearchList(e.target.value);
});
document.addEventListener('click', (e)=>{
  if(!els.searchList.contains(e.target) && e.target !== els.searchInput){
    els.searchList.style.display = 'none';
  }
});

function clearPillsUI(){
  els.selectedCard?.querySelectorAll('.pill').forEach(p=> p.classList.remove('active'));
}

function setSelected(item){
  SELECTED = item;
  if(!item){
    els.selectedCard.classList.add('hidden');
    return;
  }
  els.selectedCard.classList.remove('hidden');

  // Fill the selected card
  els.selName.textContent = item.name || '—';
  els.selWeapon.textContent = item.weapon || '';
  els.selRarity.textContent = canonRarity(item.rarity) || '';
  els.selCategory.textContent = canonCategory(item.category) || '';
  els.selPlayside.textContent = canonPlayside(item.playside) || '';
  els.selYear.textContent = item.year ?? '';

  // Reset pending verdicts + pill visuals
  PENDING = { weapon:null, rarity:null, category:null, playside:null, year:null };
  clearPillsUI();
}

// Pill click handling
els.selectedCard?.addEventListener('click', (e)=>{
  const btn = e.target.closest('.pill');
  if(!btn) return;
  const field = btn.dataset.field;
  const verdict = btn.dataset.verdict;
  if(!field || !verdict) return;

  PENDING[field] = verdict;

  // toggle 'active' within the group
  const group = btn.closest('.pill-group');
  if(group){
    group.querySelectorAll('.pill').forEach(p => p.classList.toggle('active', p === btn));
  }
});

// ===================== Data Load / Reset =====================
function loadData(json){
  DATA = json.filter(Boolean);

  CANDIDATES = [...DATA];
  EXCLUDED.clear();
  CONSTRAINTS = [];
  HISTORY = [];
  setSelected(null);

  applyFilters();
  renderAll();
}

els.fileInput?.addEventListener('change', e=>{
  const f = e.target.files?.[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const json = JSON.parse(reader.result);
      loadData(json);
    }catch{ alert('Invalid JSON file.'); }
  };
  reader.readAsText(f);
});

els.resetBtn?.addEventListener('click', ()=> bootLoad(true));

async function fetchJson(url){
  const res = await fetch(url, { cache: 'no-store' });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function bootLoad(forceDemo=false){
  if(forceDemo){
    loadData(DEMO);
    return;
  }
  try{
    const data = await fetchJson(`${DEFAULT_JSON_URL}?t=${Date.now()}`); // cache-bust
    loadData(data);
    console.log(`[solver] Loaded ${data.length} records from ${DEFAULT_JSON_URL}`);
  }catch(err){
    console.warn(`[solver] Could not load default JSON (${DEFAULT_JSON_URL}):`, err);
    loadData(DEMO); // fallback demo
  }
}

// ===================== Filtering Engine =====================
function applyFilters(){
  let rows = DATA.filter(r=>!EXCLUDED.has(r.name));

  for(const c of CONSTRAINTS){
    const { field, verdict, value } = c;

    if(field === 'weapon'){
      if(verdict === 'correct'){
        rows = rows.filter(r => canonStr(r.weapon) === canonStr(value));
      }else if(verdict === 'wrong'){
        rows = rows.filter(r => canonStr(r.weapon) !== canonStr(value));
      }
    }

    if(field === 'category'){
      const wantRifle = rifleBool(value);
      if(verdict === 'correct'){
        rows = rows.filter(r => rifleBool(r.category) === wantRifle);
      }else if(verdict === 'wrong'){
        rows = rows.filter(r => rifleBool(r.category) !== wantRifle);
      }
    }

    if(field === 'playside'){
      const want = (typeof value === 'string') ? value : canonPlayside(value);
      if(verdict === 'correct'){
        rows = rows.filter(r => canonPlayside(r.playside) === want);
      }else if(verdict === 'wrong'){
        rows = rows.filter(r => canonPlayside(r.playside) !== want);
      }
    }

    if(field === 'rarity'){
      if(verdict === 'correct'){
        rows = rows.filter(r => canonRarity(r.rarity) === canonRarity(value));
      }else if(verdict === 'higher'){
        rows = rows.filter(r => compareRarity(r.rarity, value) > 0);
      }else if(verdict === 'lower'){
        rows = rows.filter(r => compareRarity(r.rarity, value) < 0);
      }else if(verdict === 'wrong'){
        rows = rows.filter(r => canonRarity(r.rarity) !== canonRarity(value));
      }
    }

    if(field === 'year'){
      const n = Number(value);
      rows = rows.filter(r => {
        const y = Number(r.year);
        const known = Number.isFinite(y);
        if (verdict === 'correct') return known && y === n;
        if (verdict === 'wrong')   return !known || y !== n;
        if (verdict === 'higher')  return (known ? y > n : KEEP_UNKNOWN_YEARS_FOR_RANGE);
        if (verdict === 'lower')   return (known ? y < n : KEEP_UNKNOWN_YEARS_FOR_RANGE);
        return true;
      });
    }
  }

  // Canonicalize for display
  rows = rows.map(r => ({
    ...r,
    rarity: canonRarity(r.rarity),
    category: canonCategory(r.category),
    playside: canonPlayside(r.playside)
  }));

  CANDIDATES = rows;
  sortCandidates();
}

function rifleBool(cat){
  const s = canonStr(cat).toLowerCase();
  return s === "rifle" || (s.includes("rifle") && !s.includes("sniper"));
}

// ---------- Smart sorting ----------
function latestConstraint(field){
  for(let i = CONSTRAINTS.length - 1; i >= 0; i--){
    if(CONSTRAINTS[i].field === field) return CONSTRAINTS[i];
  }
  return null;
}

function rarityIndex(v){
  const r = canonRarity(v);
  const i = RARITY_ORDER.indexOf(r);
  return i >= 0 ? i : 999;
}

function candidateScore(r){
  // reward matching any 'correct' constraints
  const corrects = CONSTRAINTS.filter(c => c.verdict === 'correct');
  let correctMatches = 0;
  for(const c of corrects){
    if(c.field === 'weapon'   && canonStr(r.weapon)    === canonStr(c.value)) correctMatches++;
    if(c.field === 'rarity'   && canonRarity(r.rarity) === canonRarity(c.value)) correctMatches++;
    if(c.field === 'category' && rifleBool(r.category) === rifleBool(c.value)) correctMatches++;
    if(c.field === 'playside' && canonPlayside(r.playside) === canonPlayside(c.value)) correctMatches++;
    if(c.field === 'year'){
      const y = Number(r.year);
      if(Number.isFinite(y) && y === Number(c.value)) correctMatches++;
    }
  }

  // prefer closest to latest higher/lower thresholds
  let proximity = 0;
  const cr = latestConstraint('rarity');
  if(cr && (cr.verdict === 'higher' || cr.verdict === 'lower')){
    const d = Math.abs(rarityIndex(r.rarity) - rarityIndex(cr.value));
    proximity += d;
  }
  const cy = latestConstraint('year');
  if(cy && (cy.verdict === 'higher' || cy.verdict === 'lower')){
    const y = Number(r.year), n = Number(cy.value);
    const d = Number.isFinite(y) ? Math.abs(y - n) : 1000;
    proximity += d / 2;
  }

  const combinedScore = proximity - (correctMatches * 10);
  return { combinedScore, correctMatches, name: r.name || '' };
}

function sortCandidates(){
  CANDIDATES.sort((a,b)=>{
    const A = candidateScore(a);
    const B = candidateScore(b);
    if(A.combinedScore !== B.combinedScore) return A.combinedScore - B.combinedScore;
    if(A.correctMatches !== B.correctMatches) return B.correctMatches - A.correctMatches;
    return A.name.localeCompare(B.name);
  });
}

// ===================== Rendering =====================
function renderConstraints(){
  els.constraints.innerHTML = '';
  for(const c of CONSTRAINTS){
    let label;
    if(c.field === 'category'){
      label = `Category ${rifleBool(c.value) ? 'Rifle' : 'Not Rifle'} → ${c.verdict}`;
    } else if (c.field === 'playside'){
      label = `Playside ${canonPlayside(c.value)} → ${c.verdict}`;
    } else if (c.field === 'rarity'){
      label = `Rarity ${c.value} → ${c.verdict}`;
    } else if (c.field === 'year'){
      label = `Year ${c.value} → ${c.verdict}`;
    } else if (c.field === 'weapon'){
      label = `Weapon ${c.value} → ${c.verdict}`;
    } else {
      label = `${c.field} → ${c.verdict}`;
    }
    const ok = c.verdict === 'correct';
    els.constraints.appendChild(mkBadge(label, ok));
  }
}

function renderHistory(){
  els.history.innerHTML = '';
  HISTORY.forEach(h=>{
    const wrap = document.createElement('div');
    wrap.className = 'guess-row';
    wrap.appendChild(mkBadge(`${h.weapon.value} → ${h.weapon.verdict}`, h.weapon.verdict==='correct'));
    wrap.appendChild(mkBadge(`${h.rarity.value} → ${h.rarity.verdict}`, h.rarity.verdict==='correct'));
    wrap.appendChild(mkBadge(`${rifleBool(h.category.value)?'Rifle':'Not Rifle'} → ${h.category.verdict}`, h.category.verdict==='correct'));
    wrap.appendChild(mkBadge(`${canonPlayside(h.playside.value) ?? '-'} → ${h.playside.verdict}`, h.playside.verdict==='correct'));
    wrap.appendChild(mkBadge(`${h.year.value||'-'} → ${h.year.verdict}`, h.year.verdict==='correct'));
    els.history.appendChild(wrap);
  });
}

function renderTable(){
  els.candidateCount.textContent = CANDIDATES.length.toString();

  // Render ALL candidates (no slice)
  const rows = CANDIDATES.map(r => `
    <tr data-name="${encodeURIComponent(r.name || '')}">
      <td class="cell-name">${r.name ?? ''}</td>
      <td>${r.weapon ?? ''}</td>
      <td>${r.rarity ?? ''}</td>
      <td>${r.category ?? ''}</td>
      <td>${r.playside ?? ''}</td>
      <td>${r.year ?? ''}</td>
      <td><a class="btn" href="${r.url}" target="_blank" rel="noopener">Open</a></td>
    </tr>
  `).join('');

  els.resultTableBody.innerHTML = rows;

  // Row click → select this item quickly
  els.resultTableBody.querySelectorAll('tr').forEach(tr=>{
    tr.addEventListener('click', (e)=>{
      // ignore clicks on the "Open" button
      if(e.target.closest('a')) return;
      const n = decodeURIComponent(tr.getAttribute('data-name') || '');
      const item = CANDIDATES.find(x => x.name === n);
      if(item) setSelected(item);
    });
  });
}

function renderAll(){
  renderConstraints();
  renderHistory();
  renderTable();
}

// ===================== Add Guess (pill verdicts) =====================
els.addGuessBtn?.addEventListener('click', ()=>{
  if(!SELECTED){
    if(els.guessStatus){
      els.guessStatus.textContent = 'Pick a skin first.';
      setTimeout(()=>els.guessStatus.textContent='', 1500);
    }
    return;
  }

  const fields = ['weapon','rarity','category','playside','year'];
  const guess = {};
  const newC = [];

  for(const f of fields){
    const v = PENDING[f];           // pill verdict chosen (or null)
    if(!v) continue;                // only commit fields the user set

    const value =
      f === 'weapon'   ? SELECTED.weapon :
      f === 'rarity'   ? canonRarity(SELECTED.rarity) :
      f === 'category' ? canonCategory(SELECTED.category) :
      f === 'playside' ? canonPlayside(SELECTED.playside) :
      f === 'year'     ? Number(SELECTED.year) :
      null;

    guess[f] = { value, verdict: v };
    newC.push({ field: f, verdict: v, value });
  }

  if(newC.length === 0){
    if(els.guessStatus){
      els.guessStatus.textContent = 'Tap some pills (verdicts) first.';
      setTimeout(()=> els.guessStatus.textContent = '', 1500);
    }
    return;
  }

  CONSTRAINTS.push(...newC);
  EXCLUDED.add(SELECTED.name);
  HISTORY.push({
    weapon:   guess.weapon   ?? { value: SELECTED.weapon,                  verdict: '(skipped)' },
    rarity:   guess.rarity   ?? { value: canonRarity(SELECTED.rarity),     verdict: '(skipped)' },
    category: guess.category ?? { value: canonCategory(SELECTED.category), verdict: '(skipped)' },
    playside: guess.playside ?? { value: canonPlayside(SELECTED.playside), verdict: '(skipped)' },
    year:     guess.year     ?? { value: Number(SELECTED.year),            verdict: '(skipped)' },
  });

  if(els.guessStatus){
    els.guessStatus.textContent = 'Guess added.';
    setTimeout(()=> els.guessStatus.textContent = '', 1500);
  }

  applyFilters();
  renderAll();

  // Ready for next pick
  PENDING = { weapon:null, rarity:null, category:null, playside:null, year:null };
  clearPillsUI();
});

// ===================== Init =====================
(async function init(){
  await bootLoad(); // auto-load JSON (fallback to demo)
})();
// ===================== End of skinsearcher.js =====================