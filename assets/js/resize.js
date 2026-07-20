/* Resize / Crop
   -------------
   Load one image and drag a selection box over it to pick exactly the region
   to keep, then choose the output pixel size. Handles resize, the box body
   moves, dragging on bare image draws a fresh selection. Big reductions use
   stepped halving so downscales stay crisp. Local only, nothing uploaded. */

(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const drop = $("rzDrop"), fileIn = $("rzFile"), editor = $("rzEditor");
  const stage = $("rzStage"), img = $("rzPreview"), cropEl = $("rzCrop");
  const aspectSeg = $("rzAspect"), cropInfo = $("rzCropInfo");
  const wIn = $("rzW"), hIn = $("rzH"), lock = $("rzLock"), presets = $("rzPresets");
  const formatSeg = $("rzFormat"), qualRow = $("rzQualRow"), qualIn = $("rzQuality"), qualVal = $("rzQualVal");
  const dlBtn = $("rzDownload"), resetBtn = $("rzReset"), newBtn = $("rzReplace");
  const dimsEl = $("rzDims"), outEl = $("rzOut"), msg = $("rzMsg");

  const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
  const MIN = 20; // minimum selection, natural px
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let name = "image", url = null, srcImg = null;
  let natW = 0, natH = 0;
  let crop = { L: 0, T: 0, R: 0, B: 0 };
  let ratio = 0;                 // selection ratio lock (0 = free)
  const fmt = () => formatSeg.querySelector("button.on").dataset.format;
  const quality = () => Number(qualIn.value) / 100;
  const cw = () => crop.R - crop.L;
  const ch = () => crop.B - crop.T;
  const fmtBytes = (b) => b < 1024 ? b + " B" : b < 1048576 ? (b / 1024).toFixed(1) + " KB" : (b / 1048576).toFixed(2) + " MB";

  /* ---------- load ---------- */
  // srcImg (full-resolution decoded source) is what we crop/export from; the
  // <img> preview is a lightweight downscale just for on-screen display + overlay.
  async function load(file) {
    if (!file || !window.DarkroomDecode.isSupported(file)) return;
    name = file.name.replace(/\.[^.]+$/, "") || "image";
    const raw = /\.(arw|cr2|cr3|nef|dng|raf|orf|rw2|heic|heif)$/i.test(file.name);
    msg.textContent = raw ? "Decoding… large photos can take a few seconds." : "Reading image…";
    let decoded;
    try { decoded = await window.DarkroomDecode.decode(file); }
    catch (e) { msg.textContent = (e && e.message) || "Could not read that image."; return; }
    srcImg = decoded;
    natW = srcImg.width; natH = srcImg.height;
    crop = { L: 0, T: 0, R: natW, B: natH };
    wIn.value = natW; hIn.value = natH;
    const pv = document.createElement("canvas");
    const s = Math.min(1, 1600 / Math.max(natW, natH));
    pv.width = Math.max(1, Math.round(natW * s)); pv.height = Math.max(1, Math.round(natH * s));
    pv.getContext("2d").drawImage(srcImg, 0, 0, pv.width, pv.height);
    if (url) URL.revokeObjectURL(url);
    await new Promise((res) => pv.toBlob((b) => { url = URL.createObjectURL(b); res(); }, "image/png"));
    img.onload = () => { editor.hidden = false; drop.hidden = true; msg.textContent = ""; layout(); syncOut(); estimate(); };
    img.src = url;
  }

  /* ---------- overlay layout ---------- */
  function scale() { return img.clientWidth / natW; } // css px per natural px
  function layout() {
    if (!natW || !img.clientWidth) return;
    const s = scale();
    cropEl.style.left = crop.L * s + "px";
    cropEl.style.top = crop.T * s + "px";
    cropEl.style.width = (cw()) * s + "px";
    cropEl.style.height = (ch()) * s + "px";
    cropInfo.textContent = `Selection: ${Math.round(cw())}×${Math.round(ch())} px of ${natW}×${natH}`;
  }

  /* ---------- pointer: draw / move / resize ---------- */
  let drag = null;
  function ptNat(e) {
    const r = img.getBoundingClientRect();
    const s = img.clientWidth / natW;
    return { x: clamp((e.clientX - r.left) / s, 0, natW), y: clamp((e.clientY - r.top) / s, 0, natH), s };
  }
  stage.addEventListener("pointerdown", (e) => {
    if (!natW) return;
    const p = ptNat(e);
    const h = e.target.dataset ? e.target.dataset.h : null;
    let mode;
    if (h) mode = h;
    else if (p.x > crop.L && p.x < crop.R && p.y > crop.T && p.y < crop.B) mode = "move";
    else { mode = "draw"; crop = { L: p.x, T: p.y, R: p.x, B: p.y }; }
    drag = { mode, sx: e.clientX, sy: e.clientY, s: p.s, ox: p.x, oy: p.y, start: { ...crop } };
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = ptNat(e);
    let { L, T, R, B } = drag.start;
    const m = drag.mode;
    if (m === "move") {
      const w = R - L, hgt = B - T;
      const dx = (e.clientX - drag.sx) / drag.s, dy = (e.clientY - drag.sy) / drag.s;
      L = clamp(L + dx, 0, natW - w); T = clamp(T + dy, 0, natH - hgt); R = L + w; B = T + hgt;
    } else if (m === "draw") {
      L = Math.min(drag.ox, p.x); R = Math.max(drag.ox, p.x);
      T = Math.min(drag.oy, p.y); B = Math.max(drag.oy, p.y);
      if (ratio) { const w = R - L, hh = w / ratio; if (p.y < drag.oy) T = B - hh; else B = T + hh; }
    } else {
      if (m.includes("w")) L = Math.min(p.x, R - MIN);
      if (m.includes("e")) R = Math.max(p.x, L + MIN);
      if (m.includes("n")) T = Math.min(p.y, B - MIN);
      if (m.includes("s")) B = Math.max(p.y, T + MIN);
      if (ratio && m.length === 2) { // corner keeps ratio, driven by width
        const w = R - L, hh = w / ratio;
        if (m === "nw" || m === "ne") T = B - hh; else B = T + hh;
      }
    }
    // clamp inside image + keep min size
    L = clamp(L, 0, natW); R = clamp(R, 0, natW); T = clamp(T, 0, natH); B = clamp(B, 0, natH);
    if (R - L < MIN) { if (m.includes("w")) L = R - MIN; else R = L + MIN; }
    if (B - T < MIN) { if (m.includes("n")) T = B - MIN; else B = T + MIN; }
    crop = { L: clamp(L, 0, natW), T: clamp(T, 0, natH), R: clamp(R, 0, natW), B: clamp(B, 0, natH) };
    layout(); syncOut(); estimate();
  });
  const end = (e) => { if (drag) { try { stage.releasePointerCapture(e.pointerId); } catch {} drag = null; } };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);

  /* ---------- ratio presets ---------- */
  aspectSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    aspectSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    ratio = b.dataset.r === "orig" ? natW / natH : Number(b.dataset.r);
    stage.classList.toggle("rz-locked", !!ratio);
    if (ratio) snapRatio();
    layout(); syncOut(); estimate();
  });
  function snapRatio() {
    const cx = (crop.L + crop.R) / 2, cy = (crop.T + crop.B) / 2;
    let w = cw(), h = w / ratio;
    if (h > ch()) { h = ch(); w = h * ratio; }
    w = Math.min(w, natW); h = w / ratio; if (h > natH) { h = natH; w = h * ratio; }
    let L = clamp(cx - w / 2, 0, natW - w), T = clamp(cy - h / 2, 0, natH - h);
    crop = { L, T, R: L + w, B: T + h };
  }

  /* ---------- output size ---------- */
  function syncOut() {
    if (lock.checked) { wIn.value = Math.round(cw()); hIn.value = Math.round(ch()); }
    updateStat();
  }
  function outTarget() {
    return [Math.max(1, Math.round(Number(wIn.value) || 1)), Math.max(1, Math.round(Number(hIn.value) || 1))];
  }
  function updateStat() {
    const [w, h] = outTarget();
    dimsEl.innerHTML = `Output: <strong>${w}×${h}px</strong>`;
  }
  wIn.addEventListener("input", () => { if (lock.checked) hIn.value = Math.max(1, Math.round(Number(wIn.value) * ch() / cw())); updateStat(); estimate(); });
  hIn.addEventListener("input", () => { if (lock.checked) wIn.value = Math.max(1, Math.round(Number(hIn.value) * cw() / ch())); updateStat(); estimate(); });
  presets.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const p = Number(b.dataset.pct) / 100;
    wIn.value = Math.max(1, Math.round(cw() * p));
    hIn.value = Math.max(1, Math.round(ch() * p));
    updateStat(); estimate();
  });

  /* ---------- render + export ---------- */
  function renderTo(ow, oh, format) {
    const sx = Math.round(crop.L), sy = Math.round(crop.T), sw = Math.round(cw()), sh = Math.round(ch());
    let c = document.createElement("canvas"); c.width = sw; c.height = sh;
    let x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(srcImg, sx, sy, sw, sh, 0, 0, sw, sh);
    let cwid = sw, chei = sh;
    while (cwid > ow * 2) {
      const nw = Math.max(ow, Math.round(cwid / 2)), nh = Math.max(oh, Math.round(chei / 2));
      const n = document.createElement("canvas"); n.width = nw; n.height = nh;
      const nx = n.getContext("2d"); nx.imageSmoothingEnabled = true; nx.imageSmoothingQuality = "high";
      nx.drawImage(c, 0, 0, nw, nh); c = n; cwid = nw; chei = nh;
    }
    const out = document.createElement("canvas"); out.width = ow; out.height = oh;
    const ox = out.getContext("2d"); ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = "high";
    if (format === "image/jpeg") { ox.fillStyle = "#fff"; ox.fillRect(0, 0, ow, oh); }
    ox.drawImage(c, 0, 0, ow, oh);
    return out;
  }
  const toBlob = (c, f, q) => new Promise((r) => c.toBlob(r, f, q));

  let estT = null;
  function estimate() {
    clearTimeout(estT);
    estT = setTimeout(async () => {
      if (!natW) return;
      const [w, h] = outTarget(); const f = fmt();
      const blob = await toBlob(renderTo(w, h, f), f, f === "image/png" ? undefined : quality());
      outEl.textContent = "≈ " + fmtBytes(blob.size) + " " + (EXT[f] || "");
    }, 220);
  }

  formatSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    formatSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    qualRow.style.display = b.dataset.format === "image/png" ? "none" : "";
    estimate();
  });
  qualIn.addEventListener("input", () => { qualVal.textContent = qualIn.value; estimate(); });

  dlBtn.addEventListener("click", async () => {
    if (!natW) return;
    const [w, h] = outTarget(); const f = fmt();
    const blob = await toBlob(renderTo(w, h, f), f, f === "image/png" ? undefined : quality());
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = `${name}-${w}x${h}.${EXT[f] || "png"}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  });
  resetBtn.addEventListener("click", () => {
    crop = { L: 0, T: 0, R: natW, B: natH };
    ratio = 0; stage.classList.remove("rz-locked");
    aspectSeg.querySelectorAll("button").forEach((x, i) => x.classList.toggle("on", i === 0));
    wIn.value = natW; hIn.value = natH;
    layout(); updateStat(); estimate();
  });

  /* ---------- drop / browse ---------- */
  drop.addEventListener("click", () => fileIn.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileIn.click(); } });
  fileIn.addEventListener("change", () => { load(fileIn.files[0]); fileIn.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "dragend"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("drag")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("drag"); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
  newBtn.addEventListener("click", () => { editor.hidden = true; drop.hidden = false; natW = 0; });

  window.addEventListener("resize", () => { if (natW) layout(); });

  // suite: only grab window drops when this tool is on-screen
  const root = document.getElementById("resize");
  const active = () => root.getClientRects().length > 0;
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    if (!active()) return;
    if (e.target.closest && e.target.closest("#rzDrop")) return;
    if (e.target.closest && e.target.closest("#rzStage")) return;
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files[0]) load(e.dataTransfer.files[0]);
  });
})();
