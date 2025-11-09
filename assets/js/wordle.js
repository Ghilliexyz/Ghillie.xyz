const LIST_URL = '/assets/projectFiles/CS2WordleList.txt.txt';
const AUTO_SOLVE = true;

let WORD_LIST = [];
let CANDIDATES = [];

const ui = {
  grid: document.getElementById('grid'),
  addRow: document.getElementById('addRow'),
  results: document.getElementById('results'),
  wordCount: document.getElementById('wordCount'),
  resultCounts: document.querySelectorAll('[data-result-count]'),
  solve: document.getElementById('solve'),
};

function uc(s){ return (s||'').toUpperCase(); }
function isAZ(ch){ return /^[A-Z]$/.test(ch); }
function countChars(str){ const m=new Map(); for(const c of str) m.set(c,(m.get(c)||0)+1); return m; }
function setResultCount(n){ ui.resultCounts.forEach(x=>x.textContent=n); }

// ---------- UI pieces ----------
function setState(tile, color){
  const allowed = new Set(['gray','yellow','green']);
  const next = allowed.has(color) ? color : 'gray';
  tile.dataset.state = next;
  tile.classList.remove('gray','yellow','green');
  tile.classList.add(next);
}
function focusNext(tile){
  const tiles = Array.from(tile.closest('.cells').querySelectorAll('.tile'));
  const i = tiles.indexOf(tile);
  tiles[i+1]?.querySelector('input')?.focus();
}
function focusPrev(tile){
  const tiles = Array.from(tile.closest('.cells').querySelectorAll('.tile'));
  const i = tiles.indexOf(tile);
  tiles[i-1]?.querySelector('input')?.focus();
}

function makeCell(){
  const cell = document.createElement('div');
  cell.className = 'cell';

  const tile = document.createElement('div');
  tile.className = 'tile gray';
  tile.dataset.state = 'gray';

  const input = document.createElement('input');
  input.maxLength = 1;
  input.autocomplete = 'off';
  input.autocapitalize = 'characters';
  input.spellcheck = false;
  input.inputMode = 'text';

  input.addEventListener('input', (e)=>{
    const v = uc(e.target.value);
    e.target.value = isAZ(v) ? v : '';
    if(e.target.value) focusNext(tile);
    if(AUTO_SOLVE) solve();
  });

  input.addEventListener('keydown', (e)=>{
    if(e.key === 'Backspace' && !e.target.value) focusPrev(tile);
  });

  input.addEventListener('paste', (e)=>{
    const txt = uc((e.clipboardData || window.clipboardData).getData('text') || '').replace(/[^A-Z]/g,'');
    if(txt.length === 5){
      e.preventDefault();
      const cells = tile.closest('.cells').querySelectorAll('.cell');
      for(let i=0;i<5;i++){
        const t = cells[i].querySelector('.tile');
        const inp = t.querySelector('input');
        inp.value = txt[i] || '';
        setState(t, 'gray'); // default to gray; change with pills
      }
      if(AUTO_SOLVE) solve();
    }
  });

  tile.addEventListener('click', (e)=>{
    if(e.target.tagName === 'INPUT') return;
    const order = ['gray','yellow','green'];   // removed ''
    const cur = tile.dataset.state;
    const next = order[(order.indexOf(cur)+1) % order.length];
    setState(tile, next);
    if(AUTO_SOLVE) solve();
  });

  tile.appendChild(input);

  const pills = document.createElement('div');
  pills.className = 'pills';
  ['gray','yellow','green'].forEach(col=>{
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `pill ${col}`;
    b.title = col[0].toUpperCase() + col.slice(1);
    b.addEventListener('click', (ev)=>{
      ev.preventDefault();
      if (tile.dataset.state !== col) setState(tile, col); // no toggle-off to blank
      if(AUTO_SOLVE) solve();
    });
    pills.appendChild(b);
  });

  const wrapper = document.createElement('div');
  cell.appendChild(tile);
  cell.appendChild(pills);
  return cell;
}

function makeRow(){
  const row = document.createElement('div');
  row.className = 'row';
  const cells = document.createElement('div');
  cells.className = 'cells';
  for(let i=0;i<5;i++) cells.appendChild(makeCell());
  row.appendChild(cells);
  return row;
}

function addRow(){
  const row = makeRow();
  ui.grid.appendChild(row);
  row.querySelector('input')?.focus();
}

// ---------- Read UI → constraints ----------
function readRows(){
  const rows = [];
  ui.grid.querySelectorAll('.row').forEach(r=>{
    const letters = [];
    const states  = [];
    r.querySelectorAll('.tile').forEach(t=>{
      letters.push(uc(t.querySelector('input')?.value || ''));
      states.push(t.dataset.state || '');
    });
    rows.push({ letters, states });
  });
  return rows;
}

function buildConstraints(rows){
  const greens   = Array(5).fill(null);
  const notAtPos = Array.from({ length: 5 }, () => new Set());

  // Global per-letter bounds
  const minCount = Object.create(null);  // minimum # occurrences required
  const maxCount = Object.create(null);  // maximum # occurrences allowed
  const graySeen = Object.create(null);  // track letters that ever appeared gray

  for (const { letters, states } of rows) {
    const gy = Object.create(null);  // per-row greens + yellows count
    const gr = Object.create(null);  // per-row grays count

    for (let i = 0; i < 5; i++) {
      const ch = letters[i];
      const st = states[i];
      if (!/^[A-Z]$/.test(ch)) continue;

      if (st === 'green') {
        greens[i] = ch;
        gy[ch] = (gy[ch] || 0) + 1;
      } else if (st === 'yellow') {
        notAtPos[i].add(ch);
        gy[ch] = (gy[ch] || 0) + 1;
      } else if (st === 'gray') {
        gr[ch] = (gr[ch] || 0) + 1;
        graySeen[ch] = (graySeen[ch] || 0) + 1;
      }
    }

    // Global MIN = max across rows of (greens + yellows) for each letter
    for (const [ch, cnt] of Object.entries(gy)) {
      minCount[ch] = Math.max(minCount[ch] || 0, cnt);
    }

    // Global MAX caps from this row’s mixed feedback
    for (const ch of Object.keys(gr)) {
      const present = gy[ch] || 0;
      if (present === 0) {
        // This row says the letter is absent entirely
        maxCount[ch] = 0;
      } else {
        // Mixed feedback ⇒ cap to exactly the non-gray count in this row
        const capHere = present;
        maxCount[ch] = Math.min(maxCount[ch] ?? Infinity, capHere);
      }
    }
  }

  // Gray at a position for a letter that DOES exist somewhere => not at this pos
  for (const { letters, states } of rows) {
    for (let i = 0; i < 5; i++) {
      const ch = letters[i];
      if (!/^[A-Z]$/.test(ch)) continue;
      if (states[i] === 'gray' && (minCount[ch] || 0) > 0) {
        notAtPos[i].add(ch);
      }
    }
  }

  // Letters seen only as gray across all rows are globally excluded
  const excludeAll = new Set(
    Object.keys(graySeen).filter(ch => (minCount[ch] || 0) === 0)
  );

  // Keep caps consistent with mins (same behavior as your OLD solver)
  for (const ch of Object.keys(maxCount)) {
    if (minCount[ch] != null) {
      maxCount[ch] = Math.min(maxCount[ch], minCount[ch]);
    }
  }

  return { greens, notAtPos, minCount, maxCount, excludeAll };
}

// ---------- Built-in solver ----------
function solve(){
  const rows = readRows();
  const C = buildConstraints(rows);

  function validWord(word){
    // Greens
    for (let i = 0; i < 5; i++) {
      if (C.greens[i] && word[i] !== C.greens[i]) return false;
    }
    // Global exclusions
    for (const ch of C.excludeAll) {
      if (word.includes(ch)) return false;
    }
    // Yellows (not at these positions)
    for (let i = 0; i < 5; i++) {
      for (const bad of C.notAtPos[i]) if (word[i] === bad) return false;
    }
    // Min / Max letter multiplicities
    const counts = countChars(word);
    for (const [ch, need] of Object.entries(C.minCount)) {
      if ((counts.get(ch) || 0) < need) return false;
    }
    for (const [ch, cap] of Object.entries(C.maxCount)) {
      if ((counts.get(ch) || 0) > cap) return false;
    }
    return true;
  }

  CANDIDATES = WORD_LIST.filter(validWord);
  render();
}

// ---------- Render ----------
function render(){
  ui.wordCount.textContent = WORD_LIST.length;
  setResultCount(CANDIDATES.length);

  ui.results.innerHTML = CANDIDATES.length
    ? CANDIDATES.slice(0).sort().map(w=>`<div class="result">${w}</div>`).join('')
    : `<div class="result" style="opacity:.7">— no matches yet —</div>`;
}

// ---------- Data load ----------
const DEFAULT_WORDS = ["ABOUT","ABOVE","ALERT","ALONE","ARGUE","ARISE","ASSET","AUDIO","BASIC","BEACH","BEGAN","BEGIN","BEING","BLACK","BRAIN","BREAD","BREAK","BRING","BROWN","BUYER","CANDY","CAUSE","CHAIN","CHAIR","CHART","CHEAP","CHECK","CHEST","CHIEF","CHILD","CHOSE","CIVIL","CLASS","CLEAR","CLOCK","CLOSE","COACH","COAST","COULD","COUNT","CRAFT","CRANE","CRASH","CRATE","CRISP","CROSS","CROWD","CROWN","DAILY","DEALT","DEGRE","DELTA","DEPTH","DOUBT","DREAM","DRINK","DRIVE","EARLY","EARTH","EIGHT","ELDER","ELITE","ENTER","EQUAL","ERROR","EVENT","EVERY","FAITH","FALSE","FANCY","FAULT","FAVOR","FIELD","FIFTH","FIFTY","FINAL","FIRST","FLAME","FLESH","FLOOR","FOCUS","FORCE","FORTH","FOUND","FRAME","FRESH","FRONT","FRUIT","GIANT","GLASS","GLOBE","GRACE","GRADE","GRANT","GRAPE","GRAPH","GRASS","GREEN","GROUP","GUARD","GUEST","GUIDE","HAPPY","HEART","HEAVY","HONEY","HOTEL","HOUSE","HUMAN","IDEAL","IMAGE","INDEX","INNER","INPUT","ISSUE","JUDGE","KNIFE","LABEL","LARGE","LAUGH","LEARN","LEAST","LEMON","LEVEL","LIGHT","LIMIT","LOCAL","LOGIC","LOOSE","LOVED","LOWER","LUCKY","MARCH","MATCH","METAL","MIGHT","MODEL","MONEY","MONTH","MORAL","MOUND","MOUTH","MOVIE","MUSIC","NEEDS","NERVE","NORTH","NOVEL","OCCUR","OFFER","OFTEN","ORDER","OTHER","OUGHT","PAINT","PANEL","PARTY","PATCH","PHASE","PHONE","PIECE","PILOT","PLACE","PLAIN","PLANT","PLATE","POINT","POWER","PRESS","PRICE","PRIDE","PRIME","PRINT","PRIZE","PROOF","PROUD","PROVE","PULSE","QUICK","QUIET","RADIO","RAISE","RANGE","RAPID","RATIO","REACH","READY","RIGHT","RIVER","ROUTE","ROYAL","RUGBY","RURAL","SCALE","SCENE","SCOPE","SCORE","SENSE","SERVE","SETUP","SEVEN","SHAPE","SHARE","SHEEP","SHEET","SHIFT","SHINE","SHIRT","SHOCK","SHOOT","SHORT","SHOWN","SIGHT","SIGMA","SIXTH","SKILL","SMILE","SMITH","SMOKE","SOLID","SOLVE","SORRY","SOUND","SPACE","SPARE","SPEAK","SPEED","SPEND","SPENT","SPICE","SPIKE","SPILL","SPIRE","SPLIT","SPORT","SPOUT","STAFF","STAGE","STAKE","STAND","START","STATE","STEAM","STEEL","STICK","STILL","STOCK","STONE","STOOD","STORM","STORY","STRAP","STRAW","STREA","STREE","STREN","STRIP","STUCK","STUDY","STUFF","STYLE","SUGAR","SUNNY","SUPER","SURGE","SWEET","TABLE","TASTE","TEACH","TEETH","THANK","THEIR","THEME","THERE","THESE","THICK","THINK","THIRD","THOSE","THREE","THROW","TIGHT","TIMES","TITLE","TODAY","TOUCH","TOUGH","TOWER","TRACK","TRADE","TRAIN","TRIAL","TRIBE","TRICK","TRIED","TRUCK","TRULY","TRUST","TRUTH","UNDER","UNION","UNITY","UNTIL","UPPER","URBAN","USAGE","USUAL","VALUE","VIDEO","VISIT","VOICE","WASTE","WATCH","WATER","WEALT","WEIRD","WHERE","WHILE","WHITE","WHOLE","WIDEN","WIDER","WOMAN","WORLD","WORRY","WORTH","WOULD","WRIST","WRITE","WRONG"];

// --- robust parser ---
function parseWordList(text){
  // Strip UTF-8 BOM if present
  const noBom = text.replace(/^\uFEFF/, '');
  // Split CRLF / LF / CR
  const lines = noBom.split(/\r?\n|\r/);

  const words = Array.from(new Set(
    lines
      .map(s => uc(s.trim()))
      .filter(s => /^[A-Z]{5}$/.test(s))
  ));

  console.info('[Wordle] lines:', lines.length, 'valid5:', words.length);
  return words;
}

async function loadList(){
  if(!LIST_URL){
    WORD_LIST = DEFAULT_WORDS.slice(0);
    CANDIDATES = WORD_LIST.slice(0);
    render();
    if (AUTO_SOLVE) solve();
    return;
  }
  try{
    const url = new URL(LIST_URL, document.baseURI).href;
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if(!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

    const text = await res.text();

    // Guard against HTML fallback (SPA, 404 rewrites)
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/html') || /^\s*<!DOCTYPE|^\s*<html/i.test(text)) {
      throw new Error('Got HTML instead of plain text word list');
    }

    WORD_LIST = parseWordList(text);
    console.info('[Wordle] Loaded list:', url, 'count:', WORD_LIST.length);
  }catch(e){
    console.warn('[Wordle] Could not load list from', LIST_URL, '→ using built-in list instead:', e);
    WORD_LIST = DEFAULT_WORDS.slice(0);
  }
  CANDIDATES = WORD_LIST.slice(0);
  render();
  if (AUTO_SOLVE) solve();
}

// ---------- Boot ----------
function seedRows(){ for(let i=0;i<3;i++) addRow(); }

document.addEventListener('DOMContentLoaded', () => {
  seedRows();             // ensure boxes exist immediately
  loadList();             // then fetch the list (or use built-in)
  ui.addRow.addEventListener('click', addRow);
});