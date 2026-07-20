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
    await loadScript("/assets/vendor/utif.js");
    return tiffToCanvas(new Uint8Array(await file.arrayBuffer()));
  }

  async function decodeHeic(file) {
    await loadScript("/assets/vendor/heic2any.min.js");
    let out = await window.heic2any({ blob: file, toType: "image/png" });
    if (Array.isArray(out)) out = out[0];
    return await createImageBitmap(out);
  }

  const asU8 = (v) => (v instanceof Uint8Array ? v : new Uint8Array(v));

  async function decodeRaw(file) {
    await loadScript("/assets/vendor/dcraw.js");
    await loadScript("/assets/vendor/utif.js");
    const buf = new Uint8Array(await file.arrayBuffer());
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
