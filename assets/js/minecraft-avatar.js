/* Minecraft Avatar Maker
   Type a username -> resolve the account -> load its skin as a live 3D model
   you can drag to rotate (skinview3d / three.js), then composite the current
   frame onto a custom background and download or copy the square PNG.
   Runs entirely in the browser.

   Pipeline:
     username --(playerdb.co)--> uuid   (CORS-friendly, 400s on unknown players)
     uuid     --(mc-heads.net)--> skin PNG  (CORS *; skinview3d loads it with
                                             crossOrigin so the export canvas
                                             stays untainted)
   The model renders into a transparent WebGL canvas that sits on top of a 2D
   background canvas. Zoom is applied by the 3D camera, vertical pan is a CSS
   transform, and export re-composites the live frame onto the background so the
   downloaded PNG matches exactly what is on screen. */

(() => {
  'use strict';

  // ---- endpoints -----------------------------------------------------------
  const PLAYERDB = (name) => `https://playerdb.co/api/player/minecraft/${encodeURIComponent(name)}`;
  const SKIN_URL = (idOrName) => `https://mc-heads.net/skin/${encodeURIComponent(idOrName)}`;

  // ---- poses (skinview3d animation classes; null = clean static pose) -------
  const POSES = [
    { id: 'static', label: 'Static', anim: null },
    { id: 'idle',   label: 'Idle',   anim: 'IdleAnimation' },
    { id: 'walk',   label: 'Walk',   anim: 'WalkingAnimation' },
    { id: 'run',    label: 'Run',    anim: 'RunningAnimation' },
    { id: 'wave',   label: 'Wave',   anim: 'WaveAnimation' },
    { id: 'crouch', label: 'Crouch', anim: 'CrouchAnimation' },
    { id: 'fly',    label: 'Fly',    anim: 'FlyingAnimation' },
  ];

  // ---- background presets (the classic dev-PFP greens + brand colours) ------
  const SWATCHES = ['#3fbf3f', '#1da1f2', '#29b6e8', '#9b59b6',
                    '#ff6a3d', '#ff3c3c', '#111111', '#f2f2f2'];

  const EXPORT = 1024; // 2D background canvas resolution; downloads scale from this
  const VIEW = 512;    // skinview3d logical size (backing = VIEW * pixelRatio)

  // ---- state ---------------------------------------------------------------
  const state = {
    player: null,          // { name, id }
    pose: 'static',        // POSES id
    bg: { type: 'solid', c1: '#3fbf3f', c2: '#0a0a0a', gradient: false },
    shape: 'square',       // square | rounded | circle
    zoom: 0.9,             // maps to skinview3d viewer.zoom
    panY: 0,               // -0.4 .. 0.4 (fraction of the square)
    spin: false,           // auto-rotate
    size: 512,             // export size
    busy: false,
  };

  // ---- element refs (filled on init) ---------------------------------------
  let els = {};
  let viewer = null; // skinview3d.SkinViewer

  function init() {
    els = {
      root:     document.getElementById('mc-avatar'),
      form:     document.getElementById('avForm'),
      user:     document.getElementById('avUser'),
      go:       document.getElementById('avGo'),
      chips:    document.getElementById('avChips'),
      msg:      document.getElementById('avMsg'),
      studio:   document.getElementById('avStudio'),
      wrap:     document.getElementById('avCanvasWrap'),
      canvas:   document.getElementById('avCanvas'),
      viewer:   document.getElementById('avViewer'),
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
      spinBtn:  document.getElementById('avSpin'),
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
      paintBg();
    });
    els.grad2.addEventListener('input', () => {
      state.bg.c2 = els.grad2.value;
      els.grad2wrap.classList.add('has-color');
      els.grad2wrap.style.background = els.grad2.value;
      paintBg();
    });

    // shape segmented control
    els.shape.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        state.shape = b.dataset.shape;
        els.shape.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        applyShape();
      }));

    // framing
    els.zoom.addEventListener('input', () => setZoom(+els.zoom.value / 100));
    els.pan.addEventListener('input', () => setPan(+els.pan.value / 100));
    els.spinBtn.addEventListener('click', toggleSpin);
    els.reset.addEventListener('click', resetView);

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
    if (!window.skinview3d) { msg('3D viewer failed to load. Refresh and try again.'); return; }

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
    els.playerEl.innerHTML = `Skin: <strong>${escapeHtml(name)}</strong>`;

    try {
      ensureViewer();
      showLoading('Loading skin…');
      await viewer.loadSkin(SKIN_URL(id), { model: 'auto-detect' });
    } catch (e) {
      finishError('Could not load that skin. Try again in a moment.');
      return;
    }

    selectPose(state.pose);
    applyShape();
    resetView();     // default zoom / pan / rotation
    paintBg();
    revealStudio();
    msg('', true);
    setBusy(false);
    hideLoading();
  }

  // ---- 3D viewer -----------------------------------------------------------
  function ensureViewer() {
    if (viewer) return;
    // preserveDrawingBuffer keeps the last frame readable so drawImage/toBlob
    // can composite it into the exported PNG.
    viewer = new skinview3d.SkinViewer({
      canvas: els.viewer, width: VIEW, height: VIEW, preserveDrawingBuffer: true,
    });
    // Render at 2x (or the device ratio, whichever is higher) so 1024px exports
    // stay crisp even on a 1x display.
    viewer.pixelRatio = Math.max(2, window.devicePixelRatio || 1);
    viewer.fov = 45;
    viewer.zoom = state.zoom;
    viewer.autoRotate = state.spin;
    viewer.autoRotateSpeed = 1.2;
    if (viewer.controls) {
      viewer.controls.enableRotate = true;
      viewer.controls.enableZoom = false; // zoom is driven by the slider
      viewer.controls.enablePan = false;  // vertical framing is a CSS transform
    }
  }

  function selectPose(id) {
    state.pose = id;
    els.poses.querySelectorAll('.av-pose').forEach((b) => b.classList.toggle('on', b.dataset.pose === id));
    if (!viewer) return;
    const p = POSES.find((x) => x.id === id) || POSES[0];
    // Assigning viewer.animation resets the model's joints, so switching to
    // "Static" (null) always returns a clean default pose.
    viewer.animation = p.anim ? new skinview3d[p.anim]() : null;
  }

  function setZoom(v) {
    state.zoom = v;
    if (viewer) viewer.zoom = v;
  }

  function setPan(v) {
    state.panY = v;
    els.viewer.style.transform = `translateY(${(v * 100).toFixed(3)}%)`;
  }

  function toggleSpin() {
    state.spin = !state.spin;
    els.spinBtn.classList.toggle('on', state.spin);
    if (viewer) viewer.autoRotate = state.spin;
  }

  function applyShape() {
    els.wrap.classList.toggle('shape-rounded', state.shape === 'rounded');
    els.wrap.classList.toggle('shape-circle', state.shape === 'circle');
  }

  // ---- background preview --------------------------------------------------
  function paintBg() {
    els.ctx.clearRect(0, 0, EXPORT, EXPORT);
    paintBackground(els.ctx, EXPORT);
  }

  function paintBackground(ctx, size) {
    if (state.bg.type === 'transparent') return;
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

  function setBgColor(c, fromCustom) {
    state.bg.type = 'solid';
    state.bg.c1 = c;
    markSwatch(fromCustom ? null : c);
    paintBg();
  }
  function setTransparent() {
    state.bg.type = 'transparent';
    markSwatch('__trans__');
    paintBg();
  }
  function markSwatch(active) {
    els.swatches.querySelectorAll('.av-swatch').forEach((b) => {
      const isTrans = b.classList.contains('av-swatch-trans');
      b.classList.toggle('on', active === '__trans__' ? isTrans : (!isTrans && b.dataset.color === active));
    });
    els.custom.classList.toggle('has-color', active === null);
  }

  // ---- framing -------------------------------------------------------------
  function resetView() {
    setZoom(0.9);
    els.zoom.value = 90;
    setPan(0);
    els.pan.value = 0;
    if (viewer && typeof viewer.resetCameraPose === 'function') {
      viewer.resetCameraPose();
      viewer.zoom = state.zoom; // re-apply after the camera reset
    }
  }

  // ---- export --------------------------------------------------------------
  // Composite the current 3D frame onto the background at an arbitrary size.
  function drawExport(ctx, size) {
    ctx.clearRect(0, 0, size, size);
    ctx.save();

    if (state.shape !== 'square') {
      ctx.beginPath();
      if (state.shape === 'circle') ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      else roundRect(ctx, 0, 0, size, size, size * 0.16);
      ctx.clip();
    }

    paintBackground(ctx, size);

    if (viewer) {
      viewer.render(); // ensure the backing buffer holds the current frame
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(els.viewer, 0, state.panY * size, size, size);
    }

    ctx.restore();
  }

  function renderToSize(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    drawExport(c.getContext('2d'), size);
    return c;
  }

  function download() {
    if (!state.player || !viewer) return;
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
    if (!state.player || !viewer || !navigator.clipboard || !window.ClipboardItem) {
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
