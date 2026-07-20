/* Darkroom shared image decoder
   ------------------------------
   One decode path for every tool. Browsers natively handle JPG/PNG/WebP/AVIF/
   GIF/BMP; this adds TIFF, HEIC/HEIF, and camera RAW (ARW, CR2, CR3, NEF, DNG,
   RAF, ORF, RW2, and more) by decoding them locally with self-hosted WebAssembly
   /JS libraries. Nothing is ever uploaded: the file's bytes go straight into the
   decoder in your browser.

   Vendored decoders (loaded lazily, only the first time you open a file that
   needs them, from /assets/vendor/):
     - utif.js         (TIFF)                          MIT
     - heic2any.min.js (HEIC/HEIF, bundles libheif)    MIT / LGPL
     - dcraw.js        (camera RAW, port of dcraw)     GPL-2.0

   Exposes window.DarkroomDecode.decode(file) -> Promise<ImageBitmap|Canvas|Image>
   (all are drawable with ctx.drawImage and expose width/height). */

(function () {
  "use strict";

  const RAW_EXT = ["arw", "srf", "sr2", "cr2", "cr3", "crw", "nef", "nrw", "dng", "raf",
    "orf", "rw2", "raw", "pef", "srw", "3fr", "dcr", "kdc", "mrw", "mos", "erf", "x3f",
    "iiq", "rwl", "k25", "fff", "mef", "cap", "nksc"];
  const HEIC_EXT = ["heic", "heif", "hif"];
  const TIFF_EXT = ["tif", "tiff"];
  const NATIVE_EXT = ["jpg", "jpeg", "jpe", "jfif", "png", "apng", "webp", "avif", "gif", "bmp", "dib", "ico"];

  const ext = (name) => { const i = (name || "").lastIndexOf("."); return i >= 0 ? name.slice(i + 1).toLowerCase() : ""; };

  // Does this look like something we can decode? RAW/HEIC often have empty MIME,
  // so we accept by extension too.
  function isSupported(file) {
    const e = ext(file.name);
    if (file.type && file.type.startsWith("image/")) return true;
    return NATIVE_EXT.includes(e) || RAW_EXT.includes(e) || HEIC_EXT.includes(e) || TIFF_EXT.includes(e);
  }

  // Lazy, de-duplicated <script> loader for the vendored decoders.
  const scripts = {};
  function loadScript(src) {
    if (scripts[src]) return scripts[src];
    scripts[src] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = () => res();
      s.onerror = () => { scripts[src] = null; rej(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
    return scripts[src];
  }

  // ----- "Decoding..." overlay -------------------------------------------
  // TIFF/HEIC/RAW decoding is slow and RAW (dcraw) runs synchronously, freezing
  // the tab for a few seconds. We show a full-screen status card BEFORE the heavy
  // work and force a paint, so the user sees it is working, not frozen.
  let busyEl = null;
  function ensureBusy() {
    if (busyEl) return busyEl;
    const style = document.createElement("style");
    style.textContent =
      '#dr-decoding{position:fixed;inset:0;z-index:99999;display:none;place-items:center;' +
      'background:rgba(4,4,4,.72);backdrop-filter:blur(3px);font-family:"Segoe UI",system-ui,sans-serif}' +
      '#dr-decoding.on{display:grid}' +
      '#dr-decoding .dr-card{max-width:340px;margin:20px;text-align:center;padding:26px 30px;' +
      'border:1px solid rgba(255,255,255,.1);border-radius:16px;background:linear-gradient(135deg,#161616,#0c0c0c);' +
      'box-shadow:0 20px 70px rgba(0,0,0,.6)}' +
      '#dr-decoding .dr-spin{width:38px;height:38px;margin:0 auto 16px;border:3px solid rgba(255,255,255,.14);' +
      'border-top-color:#ff3c3c;border-radius:50%;animation:dr-spin .8s linear infinite}' +
      '@keyframes dr-spin{to{transform:rotate(360deg)}}' +
      '#dr-decoding .dr-t{margin:0 0 7px;font-size:15px;font-weight:700;letter-spacing:.02em;color:#ededed}' +
      '#dr-decoding .dr-s{margin:0;font-size:12.5px;line-height:1.55;color:#9a9a9a}' +
      '@media (prefers-reduced-motion:reduce){#dr-decoding .dr-spin{animation:none}}';
    document.head.appendChild(style);
    busyEl = document.createElement("div");
    busyEl.id = "dr-decoding";
    busyEl.setAttribute("role", "status");
    busyEl.setAttribute("aria-live", "polite");
    busyEl.innerHTML = '<div class="dr-card"><div class="dr-spin" aria-hidden="true"></div><p class="dr-t"></p><p class="dr-s"></p></div>';
    document.body.appendChild(busyEl);
    return busyEl;
  }
  // Resolve after two frames so the browser actually paints the overlay before a
  // synchronous decode locks up the main thread.
  const paint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  async function showBusy(title, sub) {
    const el = ensureBusy();
    el.querySelector(".dr-t").textContent = title;
    el.querySelector(".dr-s").textContent = sub;
    el.classList.add("on");
    await paint();
  }
  function hideBusy() { if (busyEl) busyEl.classList.remove("on"); }

  async function decodeNative(file) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch {
      return await new Promise((res, rej) => {
        const im = new Image(); const u = URL.createObjectURL(file);
        im.onload = () => { URL.revokeObjectURL(u); res(im); };
        im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("This image could not be read.")); };
        im.src = u;
      });
    }
  }

  // Decode TIFF bytes (also used for dcraw's TIFF output) into a canvas.
  function tiffToCanvas(buf) {
    const ifds = UTIF.decode(buf);
    let best = null;
    ifds.forEach((ifd) => {
      try { UTIF.decodeImage(buf, ifd); } catch (e) { /* skip undecodable sub-IFDs */ }
      const w = ifd.width || 0, h = ifd.height || 0;
      if (w && h && (!best || w * h > best.width * best.height)) best = ifd;
    });
    if (!best) throw new Error("No image found in this TIFF.");
    const rgba = UTIF.toRGBA8(best);
    const c = document.createElement("canvas");
    c.width = best.width; c.height = best.height;
    c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), best.width, best.height), 0, 0);
    return c;
  }

  async function decodeTiff(file) {
    await showBusy("Decoding TIFF…", "Reading the image on your device. This can take a moment for a large file.");
    try {
      await loadScript("/assets/vendor/utif.js");
      const buf = new Uint8Array(await file.arrayBuffer());
      await paint();
      return tiffToCanvas(buf);
    } finally { hideBusy(); }
  }

  async function decodeHeic(file) {
    await showBusy("Decoding HEIC…", "Converting the Apple photo on your device. This can take a few seconds. Nothing is uploaded.");
    try {
      await loadScript("/assets/vendor/heic2any.min.js");
      let out = await window.heic2any({ blob: file, toType: "image/png" });
      if (Array.isArray(out)) out = out[0];
      return await createImageBitmap(out);
    } finally { hideBusy(); }
  }

  const asU8 = (v) => (v instanceof Uint8Array ? v : new Uint8Array(v));

  async function decodeRaw(file) {
    await showBusy("Decoding RAW…", "Developing your camera RAW on your device. Large files can take several seconds and the page may briefly pause. Nothing is uploaded.");
    try {
      await loadScript("/assets/vendor/dcraw.js");
      await loadScript("/assets/vendor/utif.js");
      const buf = new Uint8Array(await file.arrayBuffer());
      await paint(); // let the overlay show before the synchronous decode locks the thread
      // Full (half-size for speed) develop with the camera white balance -> TIFF.
      try {
        const tiff = window.dcraw(buf, { useCameraWhiteBalance: true, setHalfSizeMode: true, exportAsTiff: true });
        if (tiff && tiff.length) return tiffToCanvas(asU8(tiff));
      } catch (e) { /* fall through to the embedded preview */ }
      // Fallback: the full-size JPEG preview embedded in the RAW (fast, lower res).
      const thumb = window.dcraw(buf, { extractThumbnail: true });
      if (thumb && thumb.length) {
        const t = asU8(thumb);
        // embedded preview is usually JPEG; if it is a PPM, dcraw returns "P6.." header
        if (t[0] === 0x50 && (t[1] === 0x36 || t[1] === 0x35)) return ppmToCanvas(t);
        return await createImageBitmap(new Blob([t], { type: "image/jpeg" }));
      }
      throw new Error("This RAW file could not be decoded.");
    } finally { hideBusy(); }
  }

  // Minimal binary PPM (P6) reader, for the rare camera whose preview is a PPM.
  function ppmToCanvas(bytes) {
    let p = 2, vals = [];
    const skipWs = () => { while (p < bytes.length && /\s/.test(String.fromCharCode(bytes[p]))) p++; };
    while (vals.length < 3) {
      skipWs();
      if (bytes[p] === 0x23) { while (p < bytes.length && bytes[p] !== 0x0a) p++; continue; }
      let n = "";
      while (p < bytes.length && !/\s/.test(String.fromCharCode(bytes[p]))) { n += String.fromCharCode(bytes[p]); p++; }
      vals.push(parseInt(n, 10));
    }
    p++; // single whitespace after maxval
    const [w, h] = vals;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const img = c.getContext("2d").createImageData(w, h);
    for (let i = 0, j = p, k = 0; i < w * h; i++) { img.data[k++] = bytes[j++]; img.data[k++] = bytes[j++]; img.data[k++] = bytes[j++]; img.data[k++] = 255; }
    c.getContext("2d").putImageData(img, 0, 0);
    return c;
  }

  async function decode(file) {
    const e = ext(file.name);
    const t = file.type || "";
    if (TIFF_EXT.includes(e) || t === "image/tiff") return decodeTiff(file);
    if (HEIC_EXT.includes(e) || t === "image/heic" || t === "image/heif") return decodeHeic(file);
    if (RAW_EXT.includes(e)) return decodeRaw(file);
    return decodeNative(file);
  }

  window.DarkroomDecode = { decode, isSupported, ext, RAW_EXT, HEIC_EXT, TIFF_EXT, NATIVE_EXT };
})();
