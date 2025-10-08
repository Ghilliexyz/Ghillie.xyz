const LIST_URL = 'WordleList.txt';         // set to null to *force* the built-in list
const AUTO_SOLVE = true;

let WORD_LIST = [];
let CANDIDATES = [];

const els = {
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
function setResultCount(n){ els.resultCounts.forEach(x=>x.textContent=n); }

// ---------- UI pieces ----------
function setState(tile, color){
  tile.dataset.state = color || '';
  tile.classList.remove('gray','yellow','green');
  if(color) tile.classList.add(color);
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
    const order = ['', 'gray', 'yellow', 'green'];
    const cur = tile.dataset.state || '';
    const next = order[(order.indexOf(cur)+1)%order.length];
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
      setState(tile, tile.dataset.state === col ? '' : col);
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
  els.grid.appendChild(row);
  row.querySelector('input')?.focus();
}

// ---------- Read UI → constraints ----------
function readRows(){
  const rows = [];
  els.grid.querySelectorAll('.row').forEach(r=>{
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
  const greenAt = Array(5).fill(null);
  const notAt   = Array(5).fill(null).map(()=> new Set());
  const minCount = new Map();
  const graySeen = new Map();

  for(const {letters, states} of rows){
    for(let i=0;i<5;i++){
      const ch = letters[i];
      const st = states[i];
      if(!/^[A-Z]$/.test(ch)) continue;

      if(st === 'green'){
        greenAt[i] = ch;
        minCount.set(ch, (minCount.get(ch)||0) + 1);
      } else if(st === 'yellow'){
        notAt[i].add(ch);
        minCount.set(ch, (minCount.get(ch)||0) + 1);
      } else if(st === 'gray'){
        graySeen.set(ch, (graySeen.get(ch)||0) + 1);
      }
    }
  }

  const excludeAll = new Set();
  for(const [ch] of graySeen.entries()){
    if((minCount.get(ch)||0) === 0) excludeAll.add(ch);
  }

  // Gray on letters that exist -> “not at this position”
  for(const {letters, states} of rows){
    for(let i=0;i<5;i++){
      const ch = letters[i];
      if(!/^[A-Z]$/.test(ch)) continue;
      if(states[i] === 'gray' && (minCount.get(ch)||0) > 0){
        notAt[i].add(ch);
      }
    }
  }

  return { greenAt, notAt, minCount, excludeAll };
}

// ---------- Built-in solver ----------
function solve(){
  const rows = readRows();
  const C = buildConstraints(rows);

  function validWord(word){
    for(let i=0;i<5;i++){
      if(C.greenAt[i] && word[i] !== C.greenAt[i]) return false;
    }
    for(const ch of C.excludeAll){
      if(word.includes(ch)) return false;
    }
    for(let i=0;i<5;i++){
      for(const bad of C.notAt[i]) if(word[i] === bad) return false;
    }
    const counts = countChars(word);
    for(const [ch, need] of C.minCount.entries()){
      if((counts.get(ch)||0) < need) return false;
    }
    return true;
  }

  CANDIDATES = WORD_LIST.filter(validWord);
  render();
}

// ---------- Render ----------
function render(){
  els.wordCount.textContent = WORD_LIST.length;
  setResultCount(CANDIDATES.length);

  els.results.innerHTML = CANDIDATES.length
    ? CANDIDATES.slice(0).sort().map(w=>`<div class="result">${w}</div>`).join('')
    : `<div class="result" style="opacity:.7">— no matches yet —</div>`;
}

// ---------- Data load ----------
const DEFAULT_WORDS = ["ABOUT", "ABOVE", "ALERT", "ALONE", "ARGUE", "ARISE", "ASSET", "AUDIO", "BASIC", "BEACH", "BEGAN", "BEGIN", "BEING", "BLACK", "BRAIN", "BREAD", "BREAK", "BRING", "BROWN", "BUYER", "CANDY", "CAUSE", "CHAIN", "CHAIR", "CHART", "CHEAP", "CHECK", "CHEST", "CHIEF", "CHILD", "CHOSE", "CIVIL", "CLASS", "CLEAR", "CLOCK", "CLOSE", "COACH", "COAST", "COULD", "COUNT", "CRAFT", "CRANE", "CRASH", "CRATE", "CRISP", "CROSS", "CROWD", "CROWN", "DAILY", "DEALT", "DEGRE", "DELTA", "DEPTH", "DOUBT", "DREAM", "DRINK", "DRIVE", "EARLY", "EARTH", "EIGHT", "ELDER", "ELITE", "ENTER", "EQUAL", "ERROR", "EVENT", "EVERY", "FAITH", "FALSE", "FANCY", "FAULT", "FAVOR", "FIELD", "FIFTH", "FIFTY", "FINAL", "FIRST", "FLAME", "FLESH", "FLOOR", "FOCUS", "FORCE", "FORTH", "FOUND", "FRAME", "FRESH", "FRONT", "FRUIT", "GIANT", "GLASS", "GLOBE", "GRACE", "GRADE", "GRANT", "GRAPE", "GRAPH", "GRASS", "GREEN", "GROUP", "GUARD", "GUEST", "GUIDE", "HAPPY", "HEART", "HEAVY", "HONEY", "HOTEL", "HOUSE", "HUMAN", "IDEAL", "IMAGE", "INDEX", "INNER", "INPUT", "ISSUE", "JUDGE", "KNIFE", "LABEL", "LARGE", "LAUGH", "LEARN", "LEAST", "LEMON", "LEVEL", "LIGHT", "LIMIT", "LOCAL", "LOGIC", "LOOSE", "LOVED", "LOWER", "LUCKY", "MARCH", "MATCH", "METAL", "MIGHT", "MODEL", "MONEY", "MONTH", "MORAL", "MOUND", "MOUTH", "MOVIE", "MUSIC", "NEEDS", "NERVE", "NORTH", "NOVEL", "OCCUR", "OFFER", "OFTEN", "ORDER", "OTHER", "OUGHT", "PAINT", "PANEL", "PARTY", "PATCH", "PHASE", "PHONE", "PIECE", "PILOT", "PLACE", "PLAIN", "PLANT", "PLATE", "POINT", "POWER", "PRESS", "PRICE", "PRIDE", "PRIME", "PRINT", "PRIZE", "PROOF", "PROUD", "PROVE", "PULSE", "QUICK", "QUIET", "RADIO", "RAISE", "RANGE", "RAPID", "RATIO", "REACH", "READY", "RIGHT", "RIVER", "ROUTE", "ROYAL", "RUGBY", "RURAL", "SCALE", "SCENE", "SCOPE", "SCORE", "SENSE", "SERVE", "SETUP", "SEVEN", "SHAPE", "SHARE", "SHEEP", "SHEET", "SHIFT", "SHINE", "SHIRT", "SHOCK", "SHOOT", "SHORT", "SHOWN", "SIGHT", "SIGMA", "SIXTH", "SKILL", "SMILE", "SMITH", "SMOKE", "SOLID", "SOLVE", "SORRY", "SOUND", "SPACE", "SPARE", "SPEAK", "SPEED", "SPEND", "SPENT", "SPICE", "SPIKE", "SPILL", "SPIRE", "SPLIT", "SPORT", "SPOUT", "STAFF", "STAGE", "STAKE", "STAND", "START", "STATE", "STEAM", "STEEL", "STICK", "STILL", "STOCK", "STONE", "STOOD", "STORM", "STORY", "STRAP", "STRAW", "STREA", "STREE", "STREN", "STRIP", "STUCK", "STUDY", "STUFF", "STYLE", "SUGAR", "SUNNY", "SUPER", "SURGE", "SWEET", "TABLE", "TASTE", "TEACH", "TEETH", "THANK", "THEIR", "THEME", "THERE", "THESE", "THICK", "THINK", "THIRD", "THOSE", "THREE", "THROW", "TIGHT", "TIMES", "TITLE", "TODAY", "TOUCH", "TOUGH", "TOWER", "TRACK", "TRADE", "TRAIN", "TRIAL", "TRIBE", "TRICK", "TRIED", "TRUCK", "TRULY", "TRUST", "TRUTH", "UNDER", "UNION", "UNITY", "UNTIL", "UPPER", "URBAN", "USAGE", "USUAL", "VALUE", "VIDEO", "VISIT", "VOICE", "WASTE", "WATCH", "WATER", "WEALT", "WEIRD", "WHERE", "WHILE", "WHITE", "WHOLE", "WIDEN", "WIDER", "WOMAN", "WORLD", "WORRY", "WORTH", "WOULD", "WRIST", "WRITE", "WRONG"];

async function loadList(){
  // If LIST_URL is null/empty, or if fetch fails (e.g., file://), fall back to built-in list.
  if(!LIST_URL){
    WORD_LIST = DEFAULT_WORDS.slice(0);
    CANDIDATES = WORD_LIST.slice(0);
    render();
    if (AUTO_SOLVE) solve();
    return;
  }
  try{
    const res = await fetch(`${LIST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if(!res.ok) throw new Error(res.status);
    const text = await res.text();
    WORD_LIST = Array.from(new Set(
      text.split(/\\r?\\n/)
          .map(s => uc(s.trim()))
          .filter(s => /^[A-Z]{5}$/.test(s))
    ));
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
  els.addRow.addEventListener('click', addRow);
});
