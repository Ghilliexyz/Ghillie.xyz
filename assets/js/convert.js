/* Convert
   -------
   Batch-convert images between JPG / PNG / WebP in the browser, and compress
   the result so the new file isn't bloated by the format change. Optional
   downscale + quality control. Download all as one ZIP. Local only. */

(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const drop = $("cvDrop"), fileIn = $("cvFile");
  const formatSeg = $("cvFormat"), qualRow = $("cvQualRow"), qualIn = $("cvQuality"), qualVal = $("cvQualVal");
  const maxSel = $("cvMax");
  const bar = $("cvBar"), summary = $("cvSummary"), grid = $("cvGrid"), tpl = $("cvCardTpl");
  const dlAll = $("cvDownloadAll"), clearBtn = $("cvClear");

  const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
  const MB = 1048576;
  const fmt = () => formatSeg.querySelector("button.on").dataset.format;
  const quality = () => Number(qualIn.value) / 100;
  const fmtBytes = (b) => b < 1024 ? b + " B" : b < MB ? (b / 1024).toFixed(1) + " KB" : (b / MB).toFixed(2) + " MB";
  const base = (n) => { const i = n.lastIndexOf("."); return i > 0 ? n.slice(0, i) : n; };

  let items = [], uid = 0;

  async function decode(file) { return window.DarkroomDecode.decode(file); }
  const toBlob = (c, f, q) => new Promise((r) => c.toBlob(r, f, q));

  // High-quality downscale in halving steps so reductions stay crisp.
  function drawScaled(img, tw, th, format) {
    let cw = img.width, ch = img.height;
    let c = document.createElement("canvas"); c.width = cw; c.height = ch;
    let cx = c.getContext("2d"); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
    cx.drawImage(img, 0, 0);
    while (cw > tw * 2) {
      const nw = Math.max(tw, Math.round(cw / 2)), nh = Math.max(th, Math.round(ch / 2));
      const n = document.createElement("canvas"); n.width = nw; n.height = nh;
      const nx = n.getContext("2d"); nx.imageSmoothingEnabled = true; nx.imageSmoothingQuality = "high";
      nx.drawImage(c, 0, 0, nw, nh); c = n; cx = nx; cw = nw; ch = nh;
    }
    const out = document.createElement("canvas"); out.width = tw; out.height = th;
    const ox = out.getContext("2d"); ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = "high";
    if (format === "image/jpeg") { ox.fillStyle = "#fff"; ox.fillRect(0, 0, tw, th); } // JPEG has no alpha
    ox.drawImage(c, 0, 0, tw, th);
    return out;
  }

  async function convertItem(it) {
    const f = fmt();
    const maxDim = Number(maxSel.value);
    let tw = it.img.width, th = it.img.height;
    if (maxDim && Math.max(tw, th) > maxDim) {
      const s = maxDim / Math.max(tw, th);
      tw = Math.max(1, Math.round(tw * s)); th = Math.max(1, Math.round(th * s));
    }
    const out = drawScaled(it.img, tw, th, f);
    it.blob = await toBlob(out, f, f === "image/png" ? undefined : quality());
    it.outW = tw; it.outH = th;
    it.outFmt = f;
  }

  function card(it) {
    const n = tpl.content.firstElementChild.cloneNode(true);
    it.el = n;
    it.els = {
      img: n.querySelector(".cv-thumb-img"), name: n.querySelector(".cv-name"),
      from: n.querySelector(".cv-from"), to: n.querySelector(".cv-to"),
      old: n.querySelector(".cv-old"), new: n.querySelector(".cv-new"), save: n.querySelector(".cv-save"),
      dl: n.querySelector(".cv-dl"), rm: n.querySelector(".cv-rm"),
    };
    it.els.name.textContent = it.file.name;
    it.els.name.title = it.file.name;
    it.els.dl.addEventListener("click", () => download(it));
    it.els.rm.addEventListener("click", () => remove(it));
    n.classList.add("busy");
    grid.appendChild(n);
  }
  function paint(it) {
    it.el.classList.remove("busy");
    if (it.url) URL.revokeObjectURL(it.url);
    it.url = URL.createObjectURL(it.blob);
    it.els.img.src = it.url;
    it.els.from.textContent = (EXT[it.file.type] || it.file.name.split(".").pop() || "?").toUpperCase();
    it.els.to.textContent = (EXT[it.outFmt] || "").toUpperCase();
    it.els.old.textContent = fmtBytes(it.file.size);
    it.els.new.textContent = fmtBytes(it.blob.size);
    const saved = 1 - it.blob.size / it.file.size;
    if (it.els.save) {
      it.els.save.textContent = saved >= 0 ? "-" + Math.round(saved * 100) + "%" : "+" + Math.round(-saved * 100) + "%";
      it.els.save.classList.toggle("warn", saved < 0);
    }
  }
  function updateBar() {
    const done = items.filter((i) => i.blob);
    bar.hidden = items.length === 0;
    const o = done.reduce((a, i) => a + i.file.size, 0), nw = done.reduce((a, i) => a + i.blob.size, 0);
    const saved = o ? Math.round((1 - nw / o) * 100) : 0;
    let txt = `<strong>${done.length}</strong> file${done.length === 1 ? "" : "s"} → <strong>${(EXT[fmt()] || "").toUpperCase()}</strong> · ${fmtBytes(o)} → ${fmtBytes(nw)}`;
    if (saved > 0) txt += ` · <span class="cv-hl">${saved}% smaller</span>`;
    else if (saved < 0) txt += ` · <span style="color:#ff9c9c">${-saved}% larger</span>`;
    summary.innerHTML = txt;
    dlAll.disabled = done.length === 0;
  }

  async function add(list) {
    const files = [...list].filter((f) => window.DarkroomDecode.isSupported(f));
    for (const file of files) { const it = { id: ++uid, file }; items.push(it); card(it); }
    updateBar();
    for (const it of items) { if (it.done) continue; it.done = true; try { it.img = await decode(it.file); await convertItem(it); paint(it); } catch { it.el.classList.remove("busy"); } updateBar(); }
  }
  async function reconvert() {
    for (const it of items) { if (!it.img) continue; it.el.classList.add("busy"); try { await convertItem(it); paint(it); } catch {} }
    updateBar();
  }

  function download(it) {
    if (!it.blob) return;
    const a = document.createElement("a");
    a.href = it.url; a.download = `${base(it.file.name)}.${EXT[it.outFmt] || "img"}`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function remove(it) { if (it.url) URL.revokeObjectURL(it.url); it.el.remove(); items = items.filter((x) => x !== it); updateBar(); }

  // --- minimal store-only ZIP (shared shape with the other Darkroom tools) ---
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = ~0; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const u16 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255]);
  const u32 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);
  function zip(files) {
    const enc = new TextEncoder(), chunks = [], central = []; let off = 0;
    for (const f of files) {
      const nm = enc.encode(f.name), d = f.data, crc = crc32(d), s = d.length;
      chunks.push(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(s), u32(s), u16(nm.length), u16(0), nm, d);
      central.push(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(s), u32(s), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), nm);
      off += 30 + nm.length + s;
    }
    let cd = 0; const cds = off; for (const p of central) { chunks.push(p); cd += p.length; }
    chunks.push(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd), u32(cds), u16(0));
    return new Blob(chunks, { type: "application/zip" });
  }

  async function downloadAll() {
    const done = items.filter((i) => i.blob);
    if (!done.length) return;
    if (done.length === 1) return download(done[0]);
    dlAll.disabled = true; const prev = dlAll.textContent; dlAll.textContent = "Zipping…";
    try {
      const used = new Set(), files = [];
      for (const it of done) {
        let nm = `${base(it.file.name)}.${EXT[it.outFmt] || "img"}`;
        while (used.has(nm.toLowerCase())) { const d = nm.lastIndexOf("."); nm = nm.slice(0, d) + "-" + used.size + nm.slice(d); }
        used.add(nm.toLowerCase());
        files.push({ name: nm, data: new Uint8Array(await it.blob.arrayBuffer()) });
      }
      const u = URL.createObjectURL(zip(files));
      const a = document.createElement("a"); a.href = u; a.download = "converted.zip";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    } finally { dlAll.textContent = prev; dlAll.disabled = false; }
  }

  formatSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    formatSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    qualRow.style.display = b.dataset.format === "image/png" ? "none" : "";
    reconvert();
  });
  qualIn.addEventListener("input", () => { qualVal.textContent = qualIn.value; });
  qualIn.addEventListener("change", reconvert);
  maxSel.addEventListener("change", reconvert);

  drop.addEventListener("click", () => fileIn.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileIn.click(); } });
  fileIn.addEventListener("change", () => { add(fileIn.files); fileIn.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "dragend"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("drag")));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("drag"); if (e.dataTransfer.files) add(e.dataTransfer.files); });
  dlAll.addEventListener("click", downloadAll);
  clearBtn.addEventListener("click", () => { items.forEach((i) => i.url && URL.revokeObjectURL(i.url)); items = []; grid.innerHTML = ""; updateBar(); });

  const root = document.getElementById("convert");
  const activeTool = () => root.getClientRects().length > 0;
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    if (!activeTool()) return;
    if (e.target.closest && e.target.closest("#cvDrop")) return;
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length) add(e.dataTransfer.files);
  });
  window.addEventListener("paste", (e) => {
    if (!activeTool()) return;
    const f = [...(e.clipboardData?.files || [])].filter((x) => window.DarkroomDecode.isSupported(x));
    if (f.length) add(f);
  });
})();
