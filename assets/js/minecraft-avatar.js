/* Minecraft Avatar Maker
   Type a username -> resolve the account -> render its skin as a 3D
   "developer profile picture" and composite it onto a custom background,
   then download or copy the square PNG. Runs entirely in the browser.

   Pipeline:
     username --(playerdb.co)--> uuid  (CORS-friendly, 400s on unknown players)
     uuid     --(mc-heads.net)--> skin PNG  (CORS *)
     skin     --(starlightskins)--> 3D render PNG, transparent bg  (CORS *)
   The Starlight username resolver is unreliable, so we always pass the skin
   URL explicitly via ?skinUrl= which the renderer honours.  */

(() => {
  'use strict';

  // ---- endpoints -----------------------------------------------------------
  const PLAYERDB = (name) => `https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`;
  const SKIN_URL = (idOrName) => `https://mc-heads.net/skin/${encodeURIComponent(idOrName)}`;
  const RENDER_URL = (pose, skinUrl) =>
    `https://starlightskins.lunareclipse.studio/render/${pose}/x/full?skinUrl=${encodeURIComponent(skinUrl)}`;

  // ---- render styles (Starlight render types that support the FULL crop) ---
  // defaultZoom = fraction of the square the render's WIDTH should span; tall
  // full-body poses want a smaller value so more of the body is visible.
  const POSES = [
    { id: 'mojavatar',  label: 'Mojavatar', zoom: 0.82, top: 0.05 },
    { id: 'head',       label: 'Head',      zoom: 0.86, top: 0.09 },
    { id: 'isometric',  label: 'Isometric', zoom: 0.80, top: 0.06 },
    { id: 'default',    label: 'Full Body', zoom: 0.56, top: 0.03 },
    { id: 'marching',   label: 'Marching',  zoom: 0.58, top: 0.03 },
    { id: 'cheering',   label: 'Cheering',  zoom: 0.62, top: 0.03 },
    { id: 'relaxing',   label: 'Relaxing',  zoom: 0.66, top: 0.05 },
    { id: 'pointing',   label: 'Pointing',  zoom: 0.66, top: 0.03 },
    { id: 'archer',     label: 'Archer',    zoom: 0.70, top: 0.03 },
    { id: 'sleeping',   label: 'Sleeping',  zoom: 0.80, top: 0.18 },
  ];

  // ---- background presets (the classic dev-PFP greens + brand colours) ------
  const SWATCHES = ['#3fbf3f', '#1da1f2', '#29b6e8', '#9b59b6',
                    '#ff6a3d', '#ff3c3c', '#111111', '#f2f2f2'];

  const EXPORT = 1024; // internal working resolution; downloads scale from this

  // Legacy 64x32 -> 64x64 skin conversion. Old accounts (Notch, jeb_) still use
  // the pre-1.8 format, which the renderer mangles (missing limbs, black head).
  // These copies rebuild the second arm/leg from the mirrored first, matching
  // Mojang's own upgrade (coords from bs-community/skinview-utils).
  const LEGACY_COPIES = [
    [4, 16, 4, 4, 20, 48], [8, 16, 4, 4, 24, 48], [0, 20, 4, 12, 24, 52],
    [4, 20, 4, 12, 20, 52], [8, 20, 4, 12, 16, 52], [12, 20, 4, 12, 28, 52],
    [44, 16, 4, 4, 36, 48], [48, 16, 4, 4, 40, 48], [40, 20, 4, 12, 40, 52],
    [44, 20, 4, 12, 36, 52], [48, 20, 4, 12, 32, 52], [52, 20, 4, 12, 44, 52],
  ];

  // ---- state ---------------------------------------------------------------
  const state = {
    player: null,          // { name, id }
    skinUrl: null,         // resolved skin src for the renderer (url or data URI)
    pose: 'mojavatar',
    images: new Map(),     // pose -> HTMLImageElement (cache per player)
    bg: { type: 'solid', c1: '#3fbf3f', c2: '#0a0a0a', gradient: false },
    shape: 'square',       // square | rounded | circle
    zoom: 1.18,
    panY: 0,               // -0.5 .. 0.5 (fraction of square)
    size: 512,
    busy: false,
  };

  // ---- element refs (filled on init) ---------------------------------------
  let els = {};

  function init() {
    els = {
      root:     document.getElementById('mc-avatar'),
      form:     document.getElementById('avForm'),
      user:     document.getElementById('avUser'),
      go:       document.getElementById('avGo'),
      chips:    document.getElementById('avChips'),
      msg:      document.getElementById('avMsg'),
      studio:   document.getElementById('avStudio'),
      canvas:   document.getElementById('avCanvas'),
      loading:  document.getElementById('avLoading'),
      poses:    document.getElementById('avPoses'),
      swatches: document.getElementById('avSwatches'),
      custom:   document.getElementById('avCustom'),
      customIn: document.getElementById('avCustomIn'),
      gradBtn:  document.getElementById('avGradient'),
      grad2wrap:document.getElementById('avGrad2'),
      grad2:    document.getElementById('avGrad2In'),
      shape:    document.getElementById('avShape'),
      zoom:     document.getElementById('avZoom'),
      pan:      document.getElementById('avPan'),
      reset:    document.getElementById('avReset'),
      sizes:    document.getElementById('avSizes'),
      download: document.getElementById('avDownload'),
      copy:     document.getElementById('avCopy'),
      playerEl: document.getElementById('avPlayer'),
    };
    if (!els.root) return;

    els.ctx = els.canvas.getContext('2d');
    els.canvas.width = els.canvas.height = EXPORT;

    buildPoses();
    buildSwatches();
    wire();

    // show the second gradient colour as a filled swatch from the start
    els.grad2wrap.classList.add('has-color');
    els.grad2wrap.style.background = state.bg.c2;

    // shareable deep link: /minecraft-avatar/?u=Notch renders on load
    const u = new URLSearchParams(location.search).get('u');
    if (u && NAME_RE.test(u)) { els.user.value = u; loadPlayer(u); }
  }

  // ---- build control UI ----------------------------------------------------
  function buildPoses() {
    els.poses.innerHTML = '';
    POSES.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'av-pose' + (p.id === state.pose ? ' on' : '');
      b.textContent = p.label;
      b.dataset.pose = p.id;
      b.addEventListener('click', () => selectPose(p.id));
      els.poses.appendChild(b);
    });
  }

  function buildSwatches() {
    els.swatches.innerHTML = '';
    SWATCHES.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'av-swatch' + (c === state.bg.c1 && state.bg.type === 'solid' ? ' on' : '');
      b.style.background = c;
      b.dataset.color = c;
      b.addEventListener('click', () => setBgColor(c));
      els.swatches.appendChild(b);
    });
    // custom "pick any colour" swatch (defined in the HTML; re-attach after the
    // innerHTML reset above so it lives inline with the presets)
    els.swatches.appendChild(els.custom);
    // transparent swatch
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'av-swatch av-swatch-trans';
    t.title = 'Transparent';
    t.addEventListener('click', () => setTransparent());
    els.swatches.appendChild(t);
  }

  function wire() {
    els.form.addEventListener('submit', (e) => { e.preventDefault(); loadPlayer(els.user.value.trim()); });

    els.chips.querySelectorAll('[data-name]').forEach((c) =>
      c.addEventListener('click', () => { els.user.value = c.dataset.name; loadPlayer(c.dataset.name); }));

    // custom colour picker
    els.customIn.addEventListener('input', () => {
      els.custom.classList.add('has-color');
      els.custom.style.background = els.customIn.value;
      setBgColor(els.customIn.value, true);
    });

    // gradient toggle + second colour
    els.gradBtn.addEventListener('click', () => {
      state.bg.gradient = !state.bg.gradient;
      els.gradBtn.classList.toggle('on', state.bg.gradient);
      els.grad2wrap.hidden = !state.bg.gradient;
      if (state.bg.type === 'transparent') setBgColor(state.bg.c1);
      draw();
    });
    els.grad2.addEventListener('input', () => {
      state.bg.c2 = els.grad2.value;
      els.grad2wrap.classList.add('has-color');
      els.grad2wrap.style.background = els.grad2.value;
      draw();
    });

    // shape segmented control
    els.shape.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        state.shape = b.dataset.shape;
        els.shape.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        draw();
      }));

    // framing sliders
    els.zoom.addEventListener('input', () => { state.zoom = +els.zoom.value / 100; draw(); });
    els.pan.addEventListener('input', () => { state.panY = +els.pan.value / 100; draw(); });
    els.reset.addEventListener('click', resetFraming);

    // export size
    els.sizes.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        state.size = +b.dataset.size;
        els.sizes.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      }));

    els.download.addEventListener('click', download);
    els.copy.addEventListener('click', copyToClipboard);
  }

  // ---- player resolution ---------------------------------------------------
  const NAME_RE = /^[A-Za-z0-9_]{2,16}$/;

  async function loadPlayer(name) {
    if (state.busy) return;
    if (!name) { msg('Enter a Minecraft username.'); return; }
    if (!NAME_RE.test(name)) { msg('That is not a valid Minecraft username.'); return; }

    setBusy(true);
    msg('', true);
    showLoading('Looking up player…');

    let id = name; // best-effort fallback if the lookup service is unreachable
    try {
      const r = await fetch(PLAYERDB(name), { headers: { Accept: 'application/json' } });
      if (r.status === 400 || r.status === 404) {
        finishError(`No Minecraft account named "${name}".`);
        return;
      }
      if (r.ok) {
        const j = await r.json();
        const p = j && j.data && j.data.player;
        if (p && p.id) { id = p.id; name = p.username || name; }
      }
    } catch (_) { /* offline lookup: fall through with the raw username */ }

    state.player = { name, id };
    state.images.clear();
    els.playerEl.innerHTML = `Skin: <strong>${escapeHtml(name)}</strong>`;
    resetFraming(); // apply the current pose's default framing to the sliders

    // Resolve the skin the renderer should use, upgrading legacy skins first.
    try {
      state.skinUrl = await resolveSkinUrl(id);
    } catch (_) {
      state.skinUrl = SKIN_URL(id); // best-effort: hand the raw skin to the renderer
    }

    await renderPose(state.pose, true);
  }

  // ---- render a pose (fetch + draw) ----------------------------------------
  function poseMeta(id) { return POSES.find((p) => p.id === id) || POSES[0]; }

  async function selectPose(id) {
    if (state.busy || !state.player) return;
    state.pose = id;
    els.poses.querySelectorAll('.av-pose').forEach((b) => b.classList.toggle('on', b.dataset.pose === id));
    resetFraming(); // sensible default framing for the new pose
    await renderPose(id, false);
  }

  async function renderPose(id, isNewPlayer) {
    setBusy(true);
    showLoading('Rendering skin…');
    try {
      const img = await getPoseImage(id);
      state.imgReady = img;
      draw();
      revealStudio();
      msg('', true);
    } catch (e) {
      if (isNewPlayer) finishError('Could not render that skin. Try again in a moment.');
      else msg('That style failed to render. Pick another.');
    } finally {
      setBusy(false);
      hideLoading();
    }
  }

  function getPoseImage(id) {
    if (state.images.has(id)) return Promise.resolve(state.images.get(id));
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { state.images.set(id, img); resolve(img); };
      img.onerror = () => reject(new Error('render failed'));
      img.src = RENDER_URL(id, state.skinUrl);
    });
  }

  // Load the raw skin; hand modern 64x64 skins straight to the renderer, but
  // convert legacy 64x32 skins to 64x64 and return them as a data URI.
  function resolveSkinUrl(id) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (img.naturalHeight >= 64) { resolve(SKIN_URL(id)); return; }
        try { resolve(convertLegacySkin(img)); }
        catch (_) { resolve(SKIN_URL(id)); }
      };
      img.onerror = () => reject(new Error('skin load failed'));
      img.src = SKIN_URL(id);
    });
  }

  function convertLegacySkin(img) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);            // legacy sheet lands in the top 64x32
    for (const [sX, sY, w, h, dX, dY] of LEGACY_COPIES) {
      cx.save();                        // mirror each first-limb region into the second
      cx.translate(dX + w, dY);
      cx.scale(-1, 1);
      cx.drawImage(cv, sX, sY, w, h, 0, 0, w, h);
      cx.restore();
    }
    // A fully-opaque head overlay is old "filler", not a real hat: clear it so
    // the renderer doesn't cap the head with a solid black box.
    const hat = cx.getImageData(32, 0, 32, 16).data;
    let opaque = true;
    for (let i = 3; i < hat.length; i += 4) { if (hat[i] !== 255) { opaque = false; break; } }
    if (opaque) cx.clearRect(32, 0, 32, 16);
    return cv.toDataURL('image/png');
  }

  // ---- compositing ---------------------------------------------------------
  function draw() {
    if (!state.imgReady) return;
    paint(els.ctx, EXPORT, state.imgReady);
  }

  function paint(ctx, size, img) {
    ctx.clearRect(0, 0, size, size);
    ctx.save();

    // shape mask
    if (state.shape !== 'square') {
      ctx.beginPath();
      if (state.shape === 'circle') {
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      } else {
        roundRect(ctx, 0, 0, size, size, size * 0.16);
      }
      ctx.clip();
    }

    // background
    if (state.bg.type !== 'transparent') {
      if (state.bg.gradient) {
        const g = ctx.createLinearGradient(0, 0, size, size);
        g.addColorStop(0, state.bg.c1);
        g.addColorStop(1, state.bg.c2);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = state.bg.c1;
      }
      ctx.fillRect(0, 0, size, size);
    }

    // avatar render
    const meta = poseMeta(state.pose);
    const drawW = size * state.zoom;
    const scale = drawW / img.width;
    const drawH = img.height * scale;
    const x = (size - drawW) / 2;
    const y = size * meta.top + state.panY * size;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, drawW, drawH);

    ctx.restore();
  }

  // ---- background helpers --------------------------------------------------
  function setBgColor(c, fromCustom) {
    state.bg.type = 'solid';
    state.bg.c1 = c;
    markSwatch(fromCustom ? null : c);
    draw();
  }
  function setTransparent() {
    state.bg.type = 'transparent';
    markSwatch('__trans__');
    draw();
  }
  function markSwatch(active) {
    els.swatches.querySelectorAll('.av-swatch').forEach((b) => {
      const isTrans = b.classList.contains('av-swatch-trans');
      b.classList.toggle('on', active === '__trans__' ? isTrans : (!isTrans && b.dataset.color === active));
    });
    els.custom.classList.toggle('has-color', active === null);
  }

  // ---- framing -------------------------------------------------------------
  function resetFraming() {
    const meta = poseMeta(state.pose);
    state.zoom = meta.zoom;
    state.panY = 0;
    els.zoom.value = Math.round(meta.zoom * 100);
    els.pan.value = 0;
    draw();
  }

  // ---- export --------------------------------------------------------------
  function renderToSize(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    paint(c.getContext('2d'), size, state.imgReady);
    return c;
  }

  function download() {
    if (!state.imgReady) return;
    const c = renderToSize(state.size);
    c.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${state.player.name}-minecraft-avatar.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  async function copyToClipboard() {
    if (!state.imgReady || !navigator.clipboard || !window.ClipboardItem) {
      flashCopy('No clipboard'); return;
    }
    try {
      const c = renderToSize(state.size);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flashCopy('Copied!');
    } catch (_) { flashCopy('Blocked'); }
  }
  function flashCopy(text) {
    const original = 'Copy';
    els.copy.textContent = text;
    els.copy.classList.add('copied');
    setTimeout(() => { els.copy.textContent = original; els.copy.classList.remove('copied'); }, 1400);
  }

  // ---- ui helpers ----------------------------------------------------------
  function revealStudio() { els.studio.hidden = false; }
  function showLoading(text) { els.loading.querySelector('.av-load-text').textContent = text; els.loading.hidden = false; }
  function hideLoading() { els.loading.hidden = true; }
  function setBusy(b) { state.busy = b; els.go.disabled = b; }
  function finishError(text) { setBusy(false); hideLoading(); msg(text); }
  function msg(text, ok) { els.msg.textContent = text; els.msg.classList.toggle('ok', !!ok); }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
