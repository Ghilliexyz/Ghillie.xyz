/* Image to Discord Image
   -----------------------
   Client-side image compressor. Decodes each dropped image, optionally
   downscales it, then re-encodes with the browser's built-in WebP/JPEG/PNG
   encoder via canvas.toBlob(). WebP at quality ~0.79 reproduces the
   "tiny file, still sharp" result from the Helens Bakery Pillow script,
   just running locally in the browser instead of on the desktop.

   Everything stays on-device; nothing is uploaded. */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const drop      = $("idDrop");
  const fileInput = $("idFile");
  const formatSeg = $("idFormat");
  const quality   = $("idQuality");
  const qualVal   = $("idQualVal");
  const qualHint  = $("idQualHint");
  const maxSel    = $("idMax");
  const tierSel   = $("idTier");
  const autofit   = $("idAutofit");
  const bar       = $("idBar");
  const summary   = $("idSummary");
  const grid      = $("idGrid");
  const cardTpl   = $("idCardTpl");
  const btnAll    = $("idDownloadAll");
  const btnClear  = $("idClear");

  const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
  const MB = 1024 * 1024;

  // Current settings, read fresh on every run.
  const settings = () => ({
    format: formatSeg.querySelector("button.on").dataset.format,
    quality: Number(quality.value) / 100,
    maxDim: Number(maxSel.value),
    limit: Number(tierSel.value) * MB,
    autofit: autofit.checked,
  });

  // Every image the user has added. Each item owns its own state + object URLs.
  let items = [];
  let uid = 0;

  /* ---------------- helpers ---------------- */

  function fmtBytes(b) {
    if (b < 1024) return b + " B";
    if (b < MB) return (b / 1024).toFixed(b < 10 * 1024 ? 1 : 0) + " KB";
    return (b / MB).toFixed(2) + " MB";
  }

  function baseName(name) {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(0, i) : name;
  }

  // Shared decoder: web formats natively, plus TIFF/HEIC/RAW via vendored libs.
  async function decode(file) {
    return window.DarkroomDecode.decode(file);
  }

  // High-quality downscale: halve in steps until close to target, so big
  // reductions stay crisp instead of aliasing in one jump.
  function drawScaled(source, sw, sh, tw, th, format) {
    let cw = sw, ch = sh;
    let canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    let ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, cw, ch);

    while (cw > tw * 2) {
      const nw = Math.max(tw, Math.round(cw / 2));
      const nh = Math.max(th, Math.round(ch / 2));
      const next = document.createElement("canvas");
      next.width = nw; next.height = nh;
      const nctx = next.getContext("2d");
      nctx.imageSmoothingEnabled = true;
      nctx.imageSmoothingQuality = "high";
      nctx.drawImage(canvas, 0, 0, nw, nh);
      canvas = next; ctx = nctx; cw = nw; ch = nh;
    }

    if (cw !== tw || ch !== th) {
      const out = document.createElement("canvas");
      out.width = tw; out.height = th;
      const octx = out.getContext("2d");
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = "high";
      // JPEG has no alpha: paint white so transparency doesn't turn black.
      if (format === "image/jpeg") { octx.fillStyle = "#ffffff"; octx.fillRect(0, 0, tw, th); }
      octx.drawImage(canvas, 0, 0, tw, th);
      return out;
    }

    if (format === "image/jpeg") {
      // Composite onto white in place.
      const out = document.createElement("canvas");
      out.width = tw; out.height = th;
      const octx = out.getContext("2d");
      octx.fillStyle = "#ffffff"; octx.fillRect(0, 0, tw, th);
      octx.drawImage(canvas, 0, 0);
      return out;
    }
    return canvas;
  }

  const toBlob = (canvas, format, q) =>
    new Promise((res) => canvas.toBlob(res, format, q));

  /* ---------------- core compression ---------------- */

  async function compress(item) {
    const s = settings();
    const src = item.bitmap;
    const ow = src.width, oh = src.height;

    let tw = ow, th = oh;
    if (s.maxDim && Math.max(ow, oh) > s.maxDim) {
      const scale = s.maxDim / Math.max(ow, oh);
      tw = Math.max(1, Math.round(ow * scale));
      th = Math.max(1, Math.round(oh * scale));
    }

    const canvas = drawScaled(src, ow, oh, tw, th, s.format);
    // PNG ignores the quality arg (lossless); WebP/JPEG use it.
    let q = s.format === "image/png" ? undefined : s.quality;
    let blob = await toBlob(canvas, s.format, q);

    // Auto-fit: if we blow the Discord limit, walk quality down, then, if a
    // lossless PNG still won't fit, fall back to WebP at that quality.
    if (s.autofit && blob && blob.size > s.limit && s.format !== "image/png") {
      let lo = 0.3, hi = q ?? 0.79, best = blob;
      for (let i = 0; i < 7 && best.size > s.limit; i++) {
        const mid = (lo + hi) / 2;
        const test = await toBlob(canvas, s.format, mid);
        if (test.size > s.limit) { hi = mid; } else { lo = mid; best = test; q = mid; }
      }
      blob = best;
    } else if (s.autofit && blob && blob.size > s.limit && s.format === "image/png") {
      // PNG can't be dialed down; try WebP so it still fits.
      const wq = 0.85;
      const wblob = await toBlob(canvas, "image/webp", wq);
      if (wblob && wblob.size < blob.size) { blob = wblob; item.outFormat = "image/webp"; }
    }

    item.outFormat = item.outFormat || s.format;
    item.blob = blob;
    item.outW = tw; item.outH = th;
    item.usedQ = q;
    return item;
  }

  /* ---------------- rendering ---------------- */

  function makeCard(item) {
    const node = cardTpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.classList.add("busy");
    item.el = node;
    item.els = {
      img:     node.querySelector(".id-thumb-img"),
      compare: node.querySelector(".id-compare"),
      fmt:     node.querySelector(".id-badge-fmt"),
      over:    node.querySelector(".id-over"),
      name:    node.querySelector(".id-name"),
      old:     node.querySelector(".id-old"),
      new:     node.querySelector(".id-new"),
      save:    node.querySelector(".id-save"),
      dims:    node.querySelector(".id-dims"),
      dl:      node.querySelector(".id-download"),
      rm:      node.querySelector(".id-remove"),
    };

    item.els.name.textContent = item.file.name;
    item.els.name.title = item.file.name;
    item.els.old.textContent = fmtBytes(item.file.size);
    item.els.compare.hidden = true;

    // Hold the compare button (or the thumb) to reveal the original.
    const showOrig = () => { if (item.origUrl) item.els.img.src = item.origUrl; };
    const showNew  = () => { if (item.outUrl) item.els.img.src = item.outUrl; };
    const c = item.els.compare;
    c.addEventListener("mousedown", showOrig);
    c.addEventListener("touchstart", (e) => { e.preventDefault(); showOrig(); }, { passive: false });
    ["mouseup", "mouseleave", "touchend", "touchcancel"].forEach((ev) =>
      c.addEventListener(ev, showNew)
    );

    item.els.dl.addEventListener("click", () => downloadItem(item));
    item.els.rm.addEventListener("click", () => removeItem(item));

    grid.appendChild(node);
    return node;
  }

  function paint(item) {
    const e = item.els;
    if (!e) return;
    item.el.classList.remove("busy");

    if (item.error) {
      e.name.textContent = item.file.name + ", could not read";
      e.new.textContent = "!";
      e.dl.disabled = true;
      return;
    }

    if (item.origUrl) URL.revokeObjectURL(item.origUrl);
    if (item.outUrl) URL.revokeObjectURL(item.outUrl);
    item.origUrl = URL.createObjectURL(item.file);
    item.outUrl = URL.createObjectURL(item.blob);

    e.img.src = item.outUrl;
    e.img.alt = "Compressed preview of " + item.file.name;
    e.compare.hidden = false;
    e.fmt.textContent = EXT[item.outFormat] || "img";
    e.new.textContent = fmtBytes(item.blob.size);

    const saved = 1 - item.blob.size / item.file.size;
    if (saved > 0) {
      e.save.textContent = "-" + Math.round(saved * 100) + "%";
      e.save.classList.remove("warn");
    } else {
      // Re-encoding a tiny/optimised file can grow it; be honest about that.
      e.save.textContent = "+" + Math.round(-saved * 100) + "%";
      e.save.classList.add("warn");
    }

    const s = settings();
    e.over.hidden = item.blob.size <= s.limit;

    const resized = item.outW !== item.bitmap.width || item.outH !== item.bitmap.height;
    e.dims.textContent =
      `${item.outW}×${item.outH}px` +
      (resized ? ` (from ${item.bitmap.width}×${item.bitmap.height})` : "") +
      (item.usedQ != null ? ` · q${Math.round(item.usedQ * 100)}` : " · lossless");

    e.dl.disabled = false;
  }

  function updateSummary() {
    const done = items.filter((i) => i.blob && !i.error);
    if (!items.length) { bar.hidden = true; return; }
    bar.hidden = false;

    const origTotal = done.reduce((a, i) => a + i.file.size, 0);
    const newTotal = done.reduce((a, i) => a + i.blob.size, 0);
    const saved = origTotal ? Math.round((1 - newTotal / origTotal) * 100) : 0;
    const over = done.filter((i) => i.blob.size > settings().limit).length;

    let txt = `<strong>${done.length}</strong> image${done.length === 1 ? "" : "s"} · ` +
              `${fmtBytes(origTotal)} → <strong>${fmtBytes(newTotal)}</strong>`;
    if (saved > 0) txt += ` · <span class="id-hl">${saved}% smaller</span>`;
    if (over) txt += ` · <span style="color:#ff9c9c">${over} still over limit</span>`;
    summary.innerHTML = txt;
    btnAll.disabled = done.length === 0;
  }

  /* ---------------- pipeline ---------------- */

  async function addFiles(fileList) {
    const files = [...fileList].filter((f) => window.DarkroomDecode.isSupported(f));
    if (!files.length) return;

    for (const file of files) {
      const item = { id: ++uid, file };
      items.push(item);
      makeCard(item);
    }
    updateSummary();
    // Process sequentially to keep the main thread responsive on big batches.
    for (const item of items) {
      if (item.processed) continue;
      await processItem(item);
    }
  }

  async function processItem(item) {
    item.processed = true;
    try {
      item.bitmap = await decode(item.file);
      await compress(item);
      paint(item);
    } catch (err) {
      item.error = true;
      paint(item);
    }
    updateSummary();
  }

  // Re-run everything when a setting changes.
  let rerunTimer = null;
  async function rerunAll() {
    for (const item of items) {
      if (item.error || !item.bitmap) continue;
      item.el.classList.add("busy");
      item.outFormat = null;
      try {
        await compress(item);
        paint(item);
      } catch { item.error = true; paint(item); }
    }
    updateSummary();
  }
  function scheduleRerun() {
    clearTimeout(rerunTimer);
    rerunTimer = setTimeout(rerunAll, 180);
  }

  /* ---------------- downloads ---------------- */

  function downloadItem(item) {
    if (!item.blob) return;
    const a = document.createElement("a");
    a.href = item.outUrl || URL.createObjectURL(item.blob);
    a.download = `${baseName(item.file.name)}-discord.${EXT[item.outFormat] || "img"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Browsers block a burst of separate downloads from one gesture, so "Download
  // all" bundles every output into a single ZIP instead. The images are already
  // compressed, so we use the ZIP "store" method (no deflate), tiny, fast and
  // dependency-free. Only the CRC32 + headers are assembled by hand below.
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = ~0;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (~c) >>> 0;
  }
  const u16 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255]);
  const u32 = (v) => new Uint8Array([v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]);

  async function makeZip(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const size = data.length;
      // local file header (+ data)
      chunks.push(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0), name, data);
      // central directory record (buffered until the end)
      central.push(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset), name);
      offset += 30 + name.length + size;
    }

    const cdStart = offset;
    let cdSize = 0;
    for (const p of central) { chunks.push(p); cdSize += p.length; }
    chunks.push(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cdSize), u32(cdStart), u16(0));

    return new Blob(chunks, { type: "application/zip" });
  }

  async function downloadAll() {
    const done = items.filter((i) => i.blob && !i.error);
    if (!done.length) return;
    // A single image doesn't need zipping, just save it directly.
    if (done.length === 1) { downloadItem(done[0]); return; }

    btnAll.disabled = true;
    const prev = btnAll.textContent;
    btnAll.textContent = "Zipping…";
    try {
      const used = new Set();
      const files = [];
      for (const item of done) {
        let name = `${baseName(item.file.name)}-discord.${EXT[item.outFormat] || "img"}`;
        // de-duplicate names so the archive never drops a file
        while (used.has(name.toLowerCase())) {
          const dot = name.lastIndexOf(".");
          name = name.slice(0, dot) + "-" + used.size + name.slice(dot);
        }
        used.add(name.toLowerCase());
        files.push({ name, data: new Uint8Array(await item.blob.arrayBuffer()) });
      }
      const zip = await makeZip(files);
      const url = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = url;
      a.download = "discord-images.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      btnAll.textContent = prev;
      btnAll.disabled = false;
    }
  }

  function removeItem(item) {
    if (item.origUrl) URL.revokeObjectURL(item.origUrl);
    if (item.outUrl) URL.revokeObjectURL(item.outUrl);
    if (item.el) item.el.remove();
    items = items.filter((i) => i !== item);
    updateSummary();
  }

  function clearAll() {
    items.forEach((i) => {
      if (i.origUrl) URL.revokeObjectURL(i.origUrl);
      if (i.outUrl) URL.revokeObjectURL(i.outUrl);
    });
    items = [];
    grid.innerHTML = "";
    updateSummary();
  }

  /* ---------------- wiring ---------------- */

  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); })
  );
  ["dragleave", "dragend"].forEach((ev) =>
    drop.addEventListener(ev, () => drop.classList.remove("drag"))
  );
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
  });
  // True only when this tool is on-screen. In the Darkroom suite the inactive
  // tool's panel is display:none, so its window-level drop/paste must stand down
  // and let the visible tool handle the file. Standalone, the root is always
  // visible so this is always true.
  const appRoot = document.getElementById("img-disc");
  const isActive = () => appRoot.getClientRects().length > 0;

  // Also accept a drop anywhere on the page.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    if (!isActive()) return;
    e.preventDefault();
    if (e.target.closest && e.target.closest("#idDrop")) return;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });
  // Paste an image straight from the clipboard.
  window.addEventListener("paste", (e) => {
    if (!isActive()) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => window.DarkroomDecode.isSupported(f));
    if (files.length) addFiles(files);
  });

  // Controls
  formatSeg.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    formatSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
    // PNG is lossless: quality slider does nothing, so hint accordingly.
    const isPng = btn.dataset.format === "image/png";
    quality.disabled = isPng;
    updateQualHint();
    scheduleRerun();
  });

  function updateQualHint() {
    const q = Number(quality.value);
    qualVal.textContent = q;
    const isPng = formatSeg.querySelector("button.on").dataset.format === "image/png";
    if (isPng) { qualHint.textContent = "PNG is lossless, quality has no effect."; return; }
    if (q >= 90) qualHint.textContent = "Near-lossless. Larger files.";
    else if (q >= 70) qualHint.textContent = "Recommended. Looks identical, tiny size.";
    else if (q >= 50) qualHint.textContent = "Smaller still. Slight softening.";
    else qualHint.textContent = "Very small. Visible quality loss.";
  }

  quality.addEventListener("input", () => { updateQualHint(); });
  quality.addEventListener("change", scheduleRerun);
  quality.addEventListener("input", scheduleRerun);
  maxSel.addEventListener("change", scheduleRerun);
  tierSel.addEventListener("change", scheduleRerun);
  autofit.addEventListener("change", scheduleRerun);

  btnAll.addEventListener("click", downloadAll);
  btnClear.addEventListener("click", clearAll);

  updateQualHint();
})();
