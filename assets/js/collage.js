/* Collage / Layout Maker
   ----------------------
   Pick a layout, click a cell to fill it with a photo, then design on top:
   per-photo filters, drag-to-swap between tiles, text boxes (outline +
   highlight), emoji stickers, and solid or gradient backgrounds. Exports one
   flattened image. Everything is local; nothing is uploaded.

   Cells are normalised rects (0..1) so a layout works at any output aspect.
   The visible canvas renders at output resolution; export re-renders the same
   scene without the selection overlay. */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("clCanvas"), wrap = $("clCanvasWrap"), fileIn = $("clFile");
  const aspectSeg = $("clAspect"), layoutsEl = $("clLayouts");
  const gapIn = $("clGap"), radiusIn = $("clRadius");
  const bgTypeSeg = $("clBgType"), bgIn = $("clBg"), bg2Wrap = $("clBg2Wrap"), bg2In = $("clBg2"), bgSwatches = $("clBgSwatches");
  const angleRow = $("clAngleRow"), angleIn = $("clAngle"), gradPresets = $("clGradPresets");
  const cellTools = $("clCellTools"), zoomIn = $("clZoom");
  const fxRow = $("clFx"), brightIn = $("clBright"), contrastIn = $("clContrast"), satIn = $("clSat");
  const replaceBtn = $("clReplace"), removeBtn = $("clRemove");
  const addTextBtn = $("clAddText"), stickersEl = $("clStickers");
  const textTools = $("clTextTools"), textInput = $("clTextInput"), fontSel = $("clFont");
  const textSizeIn = $("clTextSize"), textColorIn = $("clTextColor"), alignSeg = $("clTextAlign");
  const boldBtn = $("clTextBold"), strokeIn = $("clStroke"), strokeColorIn = $("clStrokeColor");
  const hlChk = $("clHl"), hlColorIn = $("clHlColor");
  const dupBtn = $("clTextDup"), delBtn = $("clTextDel");
  const formatSeg = $("clFormat"), qualRow = $("clQualRow"), qualIn = $("clQuality"), qualVal = $("clQualVal");
  const sizeSel = $("clSize"), addBtn = $("clAdd"), clearBtn = $("clClear"), dlBtn = $("clDownload"), emptyHint = $("clEmptyHint");

  const ASPECTS = { square: [1080, 1080], portrait: [1080, 1350], story: [1080, 1920], landscape: [1350, 1080] };
  const R = (x, y, w, h) => ({ x, y, w, h });
  const T3 = 1 / 3, T4 = 1 / 4;
  const LAYOUTS = [
    { name: "Full",   cells: [R(0, 0, 1, 1)] },
    { name: "2 wide", cells: [R(0, 0, .5, 1), R(.5, 0, .5, 1)] },
    { name: "2 tall", cells: [R(0, 0, 1, .5), R(0, .5, 1, .5)] },
    { name: "L + 2",  cells: [R(0, 0, .5, 1), R(.5, 0, .5, .5), R(.5, .5, .5, .5)] },
    { name: "T + 2",  cells: [R(0, 0, 1, .5), R(0, .5, .5, .5), R(.5, .5, .5, .5)] },
    { name: "2 + 1",  cells: [R(0, 0, .5, .5), R(.5, 0, .5, .5), R(0, .5, 1, .5)] },
    { name: "3 wide", cells: [R(0, 0, T3, 1), R(T3, 0, T3, 1), R(2 * T3, 0, T3, 1)] },
    { name: "3 tall", cells: [R(0, 0, 1, T3), R(0, T3, 1, T3), R(0, 2 * T3, 1, T3)] },
    { name: "2x2",    cells: [R(0, 0, .5, .5), R(.5, 0, .5, .5), R(0, .5, .5, .5), R(.5, .5, .5, .5)] },
    { name: "L + 3",  cells: [R(0, 0, .5, 1), R(.5, 0, .5, T3), R(.5, T3, .5, T3), R(.5, 2 * T3, .5, T3)] },
    { name: "1 + 3",  cells: [R(0, 0, 1, .62), R(0, .62, T3, .38), R(T3, .62, T3, .38), R(2 * T3, .62, T3, .38)] },
    { name: "3 + 1",  cells: [R(0, 0, T3, .38), R(T3, 0, T3, .38), R(2 * T3, 0, T3, .38), R(0, .38, 1, .62)] },
    { name: "4 wide", cells: [R(0, 0, T4, 1), R(T4, 0, T4, 1), R(2 * T4, 0, T4, 1), R(3 * T4, 0, T4, 1)] },
    { name: "4 tall", cells: [R(0, 0, 1, T4), R(0, T4, 1, T4), R(0, 2 * T4, 1, T4), R(0, 3 * T4, 1, T4)] },
    { name: "2x3",    cells: [R(0, 0, .5, T3), R(.5, 0, .5, T3), R(0, T3, .5, T3), R(.5, T3, .5, T3), R(0, 2 * T3, .5, T3), R(.5, 2 * T3, .5, T3)] },
    { name: "3x3",    cells: (() => { const a = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) a.push(R(c * T3, r * T3, T3, T3)); return a; })() },
    { name: "4x4",    cells: (() => { const a = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) a.push(R(c * T4, r * T4, T4, T4)); return a; })() },
  ];
  const FX = [
    { name: "None", b: 100, c: 100, s: 100, extra: "" },
    { name: "B&W",  b: 100, c: 106, s: 100, extra: "grayscale(1)" },
    { name: "Vivid", b: 102, c: 112, s: 135, extra: "" },
    { name: "Warm", b: 104, c: 102, s: 112, extra: "sepia(0.25)" },
    { name: "Cool", b: 100, c: 104, s: 108, extra: "hue-rotate(-15deg)" },
    { name: "Fade", b: 107, c: 90, s: 82, extra: "" },
  ];
  const GRADS = [
    ["#f8b500", "#fceabb"], ["#ff6a88", "#ff99ac"], ["#5a3ea0", "#120024"], ["#00c6ff", "#0072ff"],
    ["#f093fb", "#f5576c"], ["#43e97b", "#38f9d7"], ["#30cfd0", "#330867"], ["#232526", "#414345"],
  ];
  const STICKERS = ["❤️", "⭐", "🔥", "✨", "😎", "📸", "🌸", "☀️", "💯", "👑", "🎉", "👋"];
  const FONT_DEFAULT = "Poppins, 'Segoe UI', sans-serif";

  const state = {
    aspect: "portrait", layout: 3, gap: 16, radius: 12,
    bgType: "solid", bg: "#0a0a0a", bg2: "#5a3ea0", angle: 135,
    format: "image/jpeg", quality: 0.92, size: 1080,
    sel: null, swapTo: null,
  };
  let slots = [], texts = [], uid = 0, pickTarget = -1;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const cellsOf = () => LAYOUTS[state.layout].cells;
  function ensureSlots() {
    const n = cellsOf().length;
    if (slots.length < n) slots = slots.concat(Array(n - slots.length).fill(null));
    else if (slots.length > n) slots = slots.slice(0, n);
  }
  function rectFor(c, W, H, g) { return { x: c.x * W + g / 2, y: c.y * H + g / 2, w: c.w * W - g, h: c.h * H - g }; }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function slotFilter(p) {
    const parts = [];
    if (p.b !== 100) parts.push(`brightness(${p.b}%)`);
    if (p.c !== 100) parts.push(`contrast(${p.c}%)`);
    if (p.s !== 100) parts.push(`saturate(${p.s}%)`);
    if (p.extra) parts.push(p.extra);
    return parts.join(" ") || "none";
  }
  function drawPhoto(ctx, p, rc) {
    const iw = p.img.width, ih = p.img.height;
    const scale = Math.max(rc.w / iw, rc.h / ih) * p.zoom;
    const dw = iw * scale, dh = ih * scale;
    const dx = rc.x + (rc.w - dw) / 2 - p.panX * ((rc.w - dw) / 2);
    const dy = rc.y + (rc.h - dh) / 2 - p.panY * ((rc.h - dh) / 2);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.filter = slotFilter(p);
    ctx.drawImage(p.img, dx, dy, dw, dh);
    ctx.filter = "none";
  }
  function fillBg(ctx, W, H) {
    if (state.bgType === "transparent") return; // leave the canvas clear for a transparent PNG/WebP
    if (state.bgType === "gradient") {
      const a = (state.angle - 90) * Math.PI / 180, cx = W / 2, cy = H / 2;
      const len = (Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))) / 2;
      const g = ctx.createLinearGradient(cx - Math.cos(a) * len, cy - Math.sin(a) * len, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.addColorStop(0, state.bg); g.addColorStop(1, state.bg2); ctx.fillStyle = g;
    } else ctx.fillStyle = state.bg;
    ctx.fillRect(0, 0, W, H);
  }
  function drawText(ctx, t, W, H) {
    const fs = t.size * H;
    ctx.font = `${t.weight} ${fs}px ${t.font}`;
    ctx.textAlign = t.align; ctx.textBaseline = "middle";
    const lines = (t.text || " ").split("\n");
    const lh = fs * 1.2, totalH = lh * lines.length, cx = t.cx * W, cy = t.cy * H;
    let maxw = 0; lines.forEach((l) => { maxw = Math.max(maxw, ctx.measureText(l || " ").width); });
    const bx = t.align === "left" ? cx : t.align === "right" ? cx - maxw : cx - maxw / 2;
    const box = { x: bx - fs * 0.22, y: cy - totalH / 2 - fs * 0.12, w: maxw + fs * 0.44, h: totalH + fs * 0.24 };
    if (t.hlOn) { ctx.save(); ctx.fillStyle = t.hl; roundRect(ctx, box.x, box.y, box.w, box.h, fs * 0.16); ctx.fill(); ctx.restore(); }
    ctx.save();
    if (!t.hlOn && !t.stroke) { ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = fs * 0.08; }
    const put = (fn) => lines.forEach((l, i) => fn(l, cx, cy - totalH / 2 + lh * (i + 0.5)));
    if (t.stroke > 0) { ctx.lineWidth = fs * t.stroke; ctx.strokeStyle = t.strokeColor; ctx.lineJoin = "round"; put((l, x, y) => ctx.strokeText(l, x, y)); }
    ctx.fillStyle = t.color; put((l, x, y) => ctx.fillText(l, x, y));
    ctx.restore();
    t._box = box;
  }
  function paint(ctx, W, H, overlay) {
    ctx.clearRect(0, 0, W, H);
    fillBg(ctx, W, H);
    const g = state.gap, r = state.radius;
    cellsOf().forEach((c, i) => {
      const rc = rectFor(c, W, H, g), p = slots[i];
      ctx.save(); roundRect(ctx, rc.x, rc.y, rc.w, rc.h, r); ctx.clip();
      if (p) drawPhoto(ctx, p, rc);
      else if (overlay) {
        ctx.fillStyle = "rgba(20,20,20,0.85)"; ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
        ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
        roundRect(ctx, rc.x + 1, rc.y + 1, rc.w - 2, rc.h - 2, r); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255,255,255,0.32)"; ctx.lineWidth = Math.max(3, Math.min(rc.w, rc.h) * 0.03);
        const mx = rc.x + rc.w / 2, my = rc.y + rc.h / 2, s = Math.min(rc.w, rc.h) * 0.12;
        ctx.beginPath(); ctx.moveTo(mx - s, my); ctx.lineTo(mx + s, my); ctx.moveTo(mx, my - s); ctx.lineTo(mx, my + s); ctx.stroke();
      }
      ctx.restore();
      if (overlay && state.sel && state.sel.type === "cell" && state.sel.i === i) { ctx.save(); roundRect(ctx, rc.x, rc.y, rc.w, rc.h, r); ctx.strokeStyle = "#ff3c3c"; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
      if (overlay && state.swapTo === i) { ctx.save(); roundRect(ctx, rc.x, rc.y, rc.w, rc.h, r); ctx.strokeStyle = "#4ad2ff"; ctx.lineWidth = 4; ctx.setLineDash([10, 7]); ctx.stroke(); ctx.restore(); }
    });
    texts.forEach((t, i) => {
      drawText(ctx, t, W, H);
      if (overlay && state.sel && state.sel.type === "text" && state.sel.i === i) {
        const b = t._box; ctx.save(); ctx.strokeStyle = "#ff3c3c"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.restore();
      }
    });
  }
  function render() {
    ensureSlots();
    const [W, H] = ASPECTS[state.aspect];
    canvas.width = W; canvas.height = H;
    paint(canvas.getContext("2d"), W, H, true);
    emptyHint.hidden = slots.some(Boolean) || texts.length > 0;
    const selCell = state.sel && state.sel.type === "cell" && slots[state.sel.i];
    cellTools.hidden = !selCell;
    if (selCell) syncCell(slots[state.sel.i]);
    const selText = state.sel && state.sel.type === "text";
    textTools.hidden = !selText;
    if (selText) syncText(texts[state.sel.i]);
    dlBtn.disabled = !slots.some(Boolean) && texts.length === 0;
  }
  function syncCell(p) {
    zoomIn.value = Math.round(p.zoom * 100);
    brightIn.value = p.b; contrastIn.value = p.c; satIn.value = p.s;
    fxRow.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.fx === p.preset));
  }
  function syncText(t) {
    if (document.activeElement !== textInput) textInput.value = t.text;
    fontSel.value = t.font; textSizeIn.value = Math.round(t.size * 100); textColorIn.value = t.color;
    alignSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.al === t.align));
    boldBtn.classList.toggle("on", t.weight === "800");
    strokeIn.value = Math.round(t.stroke * 100); strokeColorIn.value = t.strokeColor;
    hlChk.checked = t.hlOn; hlColorIn.value = t.hl;
  }

  /* ---------- pointer ---------- */
  let drag = null;
  function toOut(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height), sx: canvas.width / r.width, sy: canvas.height / r.height }; }
  function hitCell(ox, oy) { const [W, H] = ASPECTS[state.aspect], g = state.gap, list = cellsOf(); for (let i = 0; i < list.length; i++) { const rc = rectFor(list[i], W, H, g); if (ox >= rc.x && ox <= rc.x + rc.w && oy >= rc.y && oy <= rc.y + rc.h) return i; } return -1; }
  function hitText(ox, oy) { for (let i = texts.length - 1; i >= 0; i--) { const b = texts[i]._box; if (b && ox >= b.x && ox <= b.x + b.w && oy >= b.y && oy <= b.y + b.h) return i; } return -1; }

  canvas.addEventListener("pointerdown", (e) => {
    const pt = toOut(e);
    const ti = hitText(pt.x, pt.y);
    if (ti >= 0) { state.sel = { type: "text", i: ti }; drag = { kind: "text", i: ti, lastX: e.clientX, lastY: e.clientY, sx: pt.sx, sy: pt.sy }; canvas.setPointerCapture(e.pointerId); render(); return; }
    const ci = hitCell(pt.x, pt.y);
    if (ci < 0) { state.sel = null; render(); return; }
    if (!slots[ci]) { pickTarget = ci; fileIn.click(); return; }
    state.sel = { type: "cell", i: ci }; drag = { kind: "cell", i: ci, lastX: e.clientX, lastY: e.clientY, sx: pt.sx, sy: pt.sy }; canvas.setPointerCapture(e.pointerId); render();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const [W, H] = ASPECTS[state.aspect], pt = toOut(e);
    if (drag.kind === "text") {
      const t = texts[drag.i]; if (!t) return;
      t.cx = clamp(t.cx + (e.clientX - drag.lastX) * drag.sx / W, 0, 1);
      t.cy = clamp(t.cy + (e.clientY - drag.lastY) * drag.sy / H, 0, 1);
      drag.lastX = e.clientX; drag.lastY = e.clientY; render(); return;
    }
    // cell: pan while inside the origin tile, or mark a swap target when over another
    const over = hitCell(pt.x, pt.y);
    if (over >= 0 && over !== drag.i) { state.swapTo = over; drag.lastX = e.clientX; drag.lastY = e.clientY; render(); return; }
    state.swapTo = null;
    const p = slots[drag.i]; if (!p) return;
    const rc = rectFor(cellsOf()[drag.i], W, H, state.gap);
    const scale = Math.max(rc.w / p.img.width, rc.h / p.img.height) * p.zoom;
    const freeX = rc.w - p.img.width * scale, freeY = rc.h - p.img.height * scale;
    const dxPx = (e.clientX - drag.lastX) * drag.sx, dyPx = (e.clientY - drag.lastY) * drag.sy;
    drag.lastX = e.clientX; drag.lastY = e.clientY;
    if (freeX < 0) p.panX = clamp(p.panX - dxPx / (freeX / 2), -1, 1);
    if (freeY < 0) p.panY = clamp(p.panY - dyPx / (freeY / 2), -1, 1);
    render();
  });
  const endDrag = (e) => {
    if (drag) {
      if (drag.kind === "cell" && state.swapTo != null && state.swapTo !== drag.i) {
        const t = slots[drag.i]; slots[drag.i] = slots[state.swapTo]; slots[state.swapTo] = t;
        state.sel = { type: "cell", i: state.swapTo };
      }
      state.swapTo = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch {}
      drag = null; render();
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  /* ---------- files ---------- */
  async function decode(file) { return window.DarkroomDecode.decode(file); }
  function newSlot(img, name) { return { id: ++uid, img, name, zoom: 1, panX: 0, panY: 0, b: 100, c: 100, s: 100, extra: "", preset: "None" }; }
  async function assignFiles(fileList, startCell) {
    const files = [...fileList].filter((f) => window.DarkroomDecode.isSupported(f));
    if (!files.length) return;
    ensureSlots();
    let fi = 0; const order = [];
    if (startCell >= 0) order.push(startCell);
    for (let i = 0; i < slots.length; i++) if (i !== startCell && !slots[i]) order.push(i);
    for (const idx of order) { if (fi >= files.length) break; if (slots[idx] && idx !== startCell) continue; try { slots[idx] = newSlot(await decode(files[fi]), files[fi].name); } catch {} fi++; }
    render();
  }
  fileIn.addEventListener("change", () => { assignFiles(fileIn.files, pickTarget); pickTarget = -1; fileIn.value = ""; });
  addBtn.addEventListener("click", () => { pickTarget = -1; fileIn.click(); });
  wrap.addEventListener("dragover", (e) => { e.preventDefault(); wrap.classList.add("drag"); });
  wrap.addEventListener("dragleave", () => wrap.classList.remove("drag"));
  wrap.addEventListener("drop", (e) => { e.preventDefault(); wrap.classList.remove("drag"); if (!e.dataTransfer || !e.dataTransfer.files.length) return; const pt = toOut(e); assignFiles(e.dataTransfer.files, hitCell(pt.x, pt.y)); });

  /* ---------- controls ---------- */
  aspectSeg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; aspectSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); state.aspect = b.dataset.aspect; render(); });
  function buildLayouts() {
    LAYOUTS.forEach((L, i) => {
      const btn = document.createElement("button");
      btn.className = "cl-layout" + (i === state.layout ? " on" : ""); btn.type = "button"; btn.title = L.name + " (" + L.cells.length + ")";
      const mini = document.createElement("span"); mini.className = "cl-mini";
      L.cells.forEach((c) => { const cell = document.createElement("i"); cell.style.left = c.x * 100 + "%"; cell.style.top = c.y * 100 + "%"; cell.style.width = c.w * 100 + "%"; cell.style.height = c.h * 100 + "%"; mini.appendChild(cell); });
      btn.appendChild(mini);
      btn.addEventListener("click", () => { state.layout = i; if (state.sel && state.sel.type === "cell") state.sel = null; layoutsEl.querySelectorAll(".cl-layout").forEach((x) => x.classList.toggle("on", x === btn)); render(); });
      layoutsEl.appendChild(btn);
    });
  }
  gapIn.addEventListener("input", () => { state.gap = Number(gapIn.value); render(); });
  radiusIn.addEventListener("input", () => { state.radius = Number(radiusIn.value); render(); });
  function setFormat(f) {
    state.format = f;
    formatSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.format === f));
    qualRow.style.display = f === "image/png" ? "none" : "";
  }
  bgTypeSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    bgTypeSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    state.bgType = b.dataset.bg;
    const grad = state.bgType === "gradient", trans = state.bgType === "transparent";
    bg2Wrap.hidden = angleRow.hidden = !grad;
    bgSwatches.hidden = trans;
    // transparency needs an alpha format, so nudge JPEG over to PNG
    if (trans && state.format === "image/jpeg") setFormat("image/png");
    render();
  });
  bgIn.addEventListener("input", () => { state.bg = bgIn.value; render(); });
  bg2In.addEventListener("input", () => { state.bg2 = bg2In.value; render(); });
  angleIn.addEventListener("input", () => { state.angle = Number(angleIn.value); render(); });
  function buildGrads() {
    GRADS.forEach((g) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "cl-grad";
      b.style.background = `linear-gradient(135deg, ${g[0]}, ${g[1]})`; b.title = "Gradient";
      b.addEventListener("click", () => {
        state.bgType = "gradient"; state.bg = g[0]; state.bg2 = g[1];
        bgIn.value = g[0]; bg2In.value = g[1];
        bgTypeSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.bg === "gradient"));
        bg2Wrap.hidden = angleRow.hidden = false; render();
      });
      gradPresets.appendChild(b);
    });
  }

  // cell tools
  zoomIn.addEventListener("input", () => { const p = curCell(); if (p) { p.zoom = Number(zoomIn.value) / 100; render(); } });
  function buildFx() {
    FX.forEach((f) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "cl-chip"; b.dataset.fx = f.name; b.textContent = f.name;
      b.addEventListener("click", () => { const p = curCell(); if (!p) return; p.b = f.b; p.c = f.c; p.s = f.s; p.extra = f.extra; p.preset = f.name; render(); });
      fxRow.appendChild(b);
    });
  }
  const adj = (prop) => () => { const p = curCell(); if (!p) return; p[prop] = Number((prop === "b" ? brightIn : prop === "c" ? contrastIn : satIn).value); p.preset = null; render(); };
  brightIn.addEventListener("input", adj("b"));
  contrastIn.addEventListener("input", adj("c"));
  satIn.addEventListener("input", adj("s"));
  replaceBtn.addEventListener("click", () => { if (state.sel && state.sel.type === "cell") { pickTarget = state.sel.i; slots[state.sel.i] = null; fileIn.click(); } });
  removeBtn.addEventListener("click", () => { if (state.sel && state.sel.type === "cell") { slots[state.sel.i] = null; state.sel = null; render(); } });
  function curCell() { return state.sel && state.sel.type === "cell" ? slots[state.sel.i] : null; }

  // text + stickers
  function newText(over) { return Object.assign({ id: ++uid, text: "Your text", cx: 0.5, cy: 0.5, size: 0.09, color: "#ffffff", font: FONT_DEFAULT, weight: "800", align: "center", stroke: 0, strokeColor: "#000000", hlOn: false, hl: "#ff3c3c" }, over || {}); }
  addTextBtn.addEventListener("click", () => { texts.push(newText()); state.sel = { type: "text", i: texts.length - 1 }; render(); textInput.focus(); textInput.select(); });
  function buildStickers() {
    STICKERS.forEach((emo) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "cl-sticker"; b.textContent = emo;
      b.addEventListener("click", () => { texts.push(newText({ text: emo, size: 0.16, weight: "400" })); state.sel = { type: "text", i: texts.length - 1 }; render(); });
      stickersEl.appendChild(b);
    });
  }
  textInput.addEventListener("input", () => { const t = curText(); if (t) { t.text = textInput.value; render(); } });
  fontSel.addEventListener("change", () => { const t = curText(); if (t) { t.font = fontSel.value; render(); } });
  textSizeIn.addEventListener("input", () => { const t = curText(); if (t) { t.size = Number(textSizeIn.value) / 100; render(); } });
  textColorIn.addEventListener("input", () => { const t = curText(); if (t) { t.color = textColorIn.value; render(); } });
  alignSeg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; const t = curText(); if (!t) return; t.align = b.dataset.al; render(); });
  boldBtn.addEventListener("click", () => { const t = curText(); if (!t) return; t.weight = t.weight === "800" ? "400" : "800"; render(); });
  strokeIn.addEventListener("input", () => { const t = curText(); if (t) { t.stroke = Number(strokeIn.value) / 100; render(); } });
  strokeColorIn.addEventListener("input", () => { const t = curText(); if (t) { t.strokeColor = strokeColorIn.value; render(); } });
  hlChk.addEventListener("change", () => { const t = curText(); if (t) { t.hlOn = hlChk.checked; render(); } });
  hlColorIn.addEventListener("input", () => { const t = curText(); if (t) { t.hl = hlColorIn.value; t.hlOn = true; hlChk.checked = true; render(); } });
  dupBtn.addEventListener("click", () => { const t = curText(); if (!t) return; texts.push(Object.assign({}, t, { id: ++uid, cy: clamp(t.cy + 0.05, 0, 1) })); state.sel = { type: "text", i: texts.length - 1 }; render(); });
  delBtn.addEventListener("click", () => { if (state.sel && state.sel.type === "text") { texts.splice(state.sel.i, 1); state.sel = null; render(); } });
  function curText() { return state.sel && state.sel.type === "text" ? texts[state.sel.i] : null; }

  // export
  formatSeg.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; formatSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); state.format = b.dataset.format; qualRow.style.display = state.format === "image/png" ? "none" : ""; });
  qualIn.addEventListener("input", () => { state.quality = Number(qualIn.value) / 100; qualVal.textContent = qualIn.value; });
  sizeSel.addEventListener("change", () => { state.size = Number(sizeSel.value); });
  clearBtn.addEventListener("click", () => { slots = slots.map(() => null); texts = []; state.sel = null; render(); });

  const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
  dlBtn.addEventListener("click", async () => {
    const [W0, H0] = ASPECTS[state.aspect];
    const k = state.size / Math.max(W0, H0), W = Math.round(W0 * k), H = Math.round(H0 * k);
    const out = document.createElement("canvas"); out.width = W; out.height = H;
    const sg = state.gap, sr = state.radius, ss = state.sel, sw = state.swapTo;
    state.gap = sg * k; state.radius = sr * k; state.sel = null; state.swapTo = null;
    paint(out.getContext("2d"), W, H, false);
    state.gap = sg; state.radius = sr; state.sel = ss; state.swapTo = sw;
    const q = state.format === "image/png" ? undefined : state.quality;
    const blob = await new Promise((res) => out.toBlob(res, state.format, q));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "collage." + (EXT[state.format] || "png");
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    render();
  });

  // collapsible control groups (click the header to fold)
  document.querySelectorAll("#collage .cl-group > .cl-group-title").forEach((t) => {
    t.setAttribute("role", "button"); t.tabIndex = 0; t.setAttribute("aria-expanded", "true");
    const toggle = () => { const c = t.parentElement.classList.toggle("collapsed"); t.setAttribute("aria-expanded", String(!c)); };
    t.addEventListener("click", toggle);
    t.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });

  buildLayouts(); buildFx(); buildStickers(); buildGrads(); render();
})();
