/* Seamless Carousel Maker
   -----------------------
   Takes one wide image and slices it into N equal Instagram-sized panels.
   The panels line up edge-to-edge, so posting them as a carousel and swiping
   reads as one continuous panorama.

   Geometry lives in "composite space": a virtual canvas that is
   (slideW * slides) wide by slideH tall. The source image is placed into that
   space once (cover/contain + zoom + pan), then any rectangle of it can be
   painted to an output canvas, the whole thing for the preview, or a single
   slide column for export. Nothing is uploaded; it all runs locally. */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const drop     = $("scDrop");
  const fileInput = $("scFile");
  const editor   = $("scEditor");
  const canvas   = $("scCanvas");
  const swipe    = $("scSwipe");
  const msg      = $("scMsg");

  const countIn  = $("scCount");
  const countVal = $("scCountVal");
  const widthHint = $("scWidthHint");
  const aspectSeg = $("scAspect");
  const fitSeg   = $("scFit");
  const bgRow    = $("scBgRow");
  const bgIn     = $("scBg");
  const zoomIn   = $("scZoom");
  const panXIn   = $("scPanX");
  const panYIn   = $("scPanY");
  const resetBtn = $("scReset");
  const formatSeg = $("scFormat");
  const qualRow  = $("scQualRow");
  const qualIn   = $("scQuality");
  const qualVal  = $("scQualVal");
  const btnDl    = $("scDownload");
  const btnNew   = $("scReplace");

  const EXT = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

  let img = null;          // the loaded HTMLImage/ImageBitmap
  let imgName = "carousel"; // base name for exports
  let swipeUrls = [];       // object URLs for the swipe preview, revoked on rebuild

  /* ---------- settings ---------- */

  function settings() {
    const a = aspectSeg.querySelector("button.on");
    return {
      slides: Number(countIn.value),
      slideW: Number(a.dataset.w),
      slideH: Number(a.dataset.h),
      fit: fitSeg.querySelector("button.on").dataset.fit,
      bg: bgIn.value,
      zoom: Number(zoomIn.value) / 100,
      panX: Number(panXIn.value) / 100,
      panY: Number(panYIn.value) / 100,
      format: formatSeg.querySelector("button.on").dataset.format,
      quality: Number(qualIn.value) / 100,
    };
  }

  // Where the image sits inside composite space (all in composite pixels).
  function placement(s) {
    const compW = s.slideW * s.slides;
    const compH = s.slideH;
    const cover = Math.max(compW / img.width, compH / img.height);
    const contain = Math.min(compW / img.width, compH / img.height);
    const scale = (s.fit === "cover" ? cover : contain) * s.zoom;
    const dw = img.width * scale;
    const dh = img.height * scale;
    const freeX = compW - dw; // negative when the image overflows (pannable)
    const freeY = compH - dh;
    const dx = freeX / 2 - s.panX * (freeX / 2);
    const dy = freeY / 2 - s.panY * (freeY / 2);
    return { compW, compH, dx, dy, dw, dh };
  }

  // Paint a rectangle of composite space (rx,ry,rw,rh) into a ctx of size outW×outH.
  function paintRegion(ctx, p, s, rx, ry, rw, rh, outW, outH) {
    const kx = outW / rw;
    const ky = outH / rh;
    ctx.clearRect(0, 0, outW, outH);
    if (s.fit === "contain" || s.format === "image/jpeg") {
      // JPEG has no alpha, and Contain shows the backdrop, so fill it.
      ctx.fillStyle = s.format === "image/jpeg" && s.fit === "cover" ? "#000000" : s.bg;
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (p.dx - rx) * kx, (p.dy - ry) * ky, p.dw * kx, p.dh * ky);
  }

  /* ---------- preview ---------- */

  let rafId = null;
  function scheduleRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = null; render(); });
  }

  function render() {
    if (!img) return;
    const s = settings();
    const p = placement(s);

    // Display canvas: cap resolution so huge carousels stay light, keep aspect.
    const maxW = 1600;
    const dispW = Math.min(maxW, p.compW);
    const dispH = Math.round(dispW * (p.compH / p.compW));
    canvas.width = dispW;
    canvas.height = dispH;
    const ctx = canvas.getContext("2d");
    paintRegion(ctx, p, s, 0, 0, p.compW, p.compH, dispW, dispH);

    // Slide divider lines.
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(1, dispW / p.compW * 2);
    ctx.setLineDash([8, 7]);
    for (let i = 1; i < s.slides; i++) {
      const x = Math.round((i * s.slideW / p.compW) * dispW) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dispH);
      ctx.stroke();
    }
    ctx.restore();

    buildSwipe(s, p);
    updateHint(s);
  }

  // Build the swipe-preview thumbnails from the same geometry.
  function buildSwipe(s, p) {
    swipeUrls.forEach((u) => URL.revokeObjectURL(u));
    swipeUrls = [];
    swipe.innerHTML = "";

    // Render slides at a modest preview resolution (height 540) for speed.
    const previewH = 540;
    const previewW = Math.round(previewH * (s.slideW / s.slideH));
    const c = document.createElement("canvas");
    c.width = previewW; c.height = previewH;
    const cx = c.getContext("2d");

    for (let i = 0; i < s.slides; i++) {
      paintRegion(cx, p, s, i * s.slideW, 0, s.slideW, s.slideH, previewW, previewH);
      const el = document.createElement("div");
      el.className = "sc-slide";
      const im = document.createElement("img");
      im.src = c.toDataURL("image/webp", 0.85);
      im.alt = "Slide " + (i + 1);
      const no = document.createElement("span");
      no.className = "sc-slide-no";
      no.textContent = (i + 1) + " / " + s.slides;
      el.appendChild(im);
      el.appendChild(no);
      swipe.appendChild(el);
    }
  }

  function updateHint(s) {
    const neededW = s.slideW * s.slides;
    if (img.width < neededW * 0.85 && s.fit === "cover") {
      widthHint.textContent =
        `Heads up: your photo is ${img.width}px wide; ${neededW}px is ideal for ${s.slides} slides. It will be upscaled a little.`;
      widthHint.classList.add("warn");
    } else {
      widthHint.textContent =
        `Each slide exports at ${s.slideW}×${s.slideH}px (${neededW}px total wide).`;
      widthHint.classList.remove("warn");
    }
  }

  /* ---------- load ---------- */

  async function loadFile(file) {
    if (!file || !window.DarkroomDecode.isSupported(file)) return;
    imgName = file.name.replace(/\.[^.]+$/, "") || "carousel";
    const raw = /\.(arw|cr2|cr3|nef|dng|raf|orf|rw2|heic|heif)$/i.test(file.name);
    msg.textContent = raw ? "Decoding… large photos can take a few seconds." : "Reading image…";
    msg.className = "sc-msg ok";
    try {
      img = await window.DarkroomDecode.decode(file);
      editor.hidden = false;
      drop.hidden = true;
      msg.textContent = "";
      render();
    } catch (e) {
      msg.className = "sc-msg";
      msg.textContent = (e && e.message) || "Could not read that image.";
    }
  }

  /* ---------- export (ZIP of numbered slides) ---------- */

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

  function makeZip(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const size = data.length;
      chunks.push(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0), name, data);
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

  const toBlob = (c, format, q) => new Promise((res) => c.toBlob(res, format, q));

  async function exportAll() {
    if (!img) return;
    const s = settings();
    const p = placement(s);
    btnDl.disabled = true;
    const prev = btnDl.innerHTML;
    btnDl.textContent = "Rendering…";
    try {
      const c = document.createElement("canvas");
      c.width = s.slideW; c.height = s.slideH;
      const cx = c.getContext("2d");
      const ext = EXT[s.format] || "img";
      const q = s.format === "image/png" ? undefined : s.quality;
      const pad = String(s.slides).length;

      const files = [];
      for (let i = 0; i < s.slides; i++) {
        paintRegion(cx, p, s, i * s.slideW, 0, s.slideW, s.slideH, s.slideW, s.slideH);
        const blob = await toBlob(c, s.format, q);
        const data = new Uint8Array(await blob.arrayBuffer());
        const n = String(i + 1).padStart(pad, "0");
        files.push({ name: `${imgName}-slide-${n}.${ext}`, data });
      }

      const zip = makeZip(files);
      const url = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${imgName}-carousel.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      btnDl.innerHTML = prev;
      btnDl.disabled = false;
    }
  }

  /* ---------- wiring ---------- */

  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", () => { loadFile(fileInput.files[0]); fileInput.value = ""; });

  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); })
  );
  ["dragleave", "dragend"].forEach((ev) =>
    drop.addEventListener(ev, () => drop.classList.remove("drag"))
  );
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    if (e.dataTransfer && e.dataTransfer.files) loadFile(e.dataTransfer.files[0]);
  });
  // True only when this tool is on-screen (see the note in image-to-discord.js):
  // in the Darkroom suite the inactive panel is display:none, so its window-level
  // drop/paste must stand down and let the visible tool handle the file.
  const appRoot = document.getElementById("carousel");
  const isActive = () => appRoot.getClientRects().length > 0;

  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    if (!isActive()) return;
    e.preventDefault();
    if (e.target.closest && e.target.closest("#scDrop")) return;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
  });
  window.addEventListener("paste", (e) => {
    if (!isActive()) return;
    const f = [...(e.clipboardData?.files || [])].find((x) => window.DarkroomDecode.isSupported(x));
    if (f) loadFile(f);
  });

  countIn.addEventListener("input", () => { countVal.textContent = countIn.value; scheduleRender(); });

  aspectSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    aspectSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    scheduleRender();
  });

  fitSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    fitSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    bgRow.hidden = b.dataset.fit !== "contain";
    scheduleRender();
  });
  bgIn.addEventListener("input", scheduleRender);

  [zoomIn, panXIn, panYIn].forEach((el) => el.addEventListener("input", scheduleRender));

  resetBtn.addEventListener("click", () => {
    zoomIn.value = 100; panXIn.value = 0; panYIn.value = 0;
    scheduleRender();
  });

  formatSeg.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    formatSeg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    qualRow.style.display = b.dataset.format === "image/png" ? "none" : "";
  });
  qualIn.addEventListener("input", () => { qualVal.textContent = qualIn.value; });

  btnDl.addEventListener("click", exportAll);
  btnNew.addEventListener("click", () => {
    editor.hidden = true;
    drop.hidden = false;
    img = null;
    swipeUrls.forEach((u) => URL.revokeObjectURL(u));
    swipeUrls = [];
    swipe.innerHTML = "";
  });

  // keep the preview crisp when the stage width changes
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (img) scheduleRender(); }, 150);
  });
})();
