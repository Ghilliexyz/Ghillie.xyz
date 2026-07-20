// Single-page transition demo for the Ghillie cover.
// The soap-film ribbon + GHILLIE title live in ONE persistent WebGL canvas that
// never gets torn down. "Navigating" between cover / about / portfolio just
// retargets a stage transform; the render loop eases toward it every frame, so
// the bubble keeps shimmering and physically glides/rotates/scales the whole
// time. (A cross-document View Transition would freeze the canvas to a static
// snapshot, which is exactly what we're avoiding here.)

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Per-view targets the stage eases toward. x/y are world units at the z=0 plane
// (camera sits at z=5.2, so ~2 units = half the viewport), title is the GHILLIE
// plane's opacity.
const STATES = {
  cover:     { x:  0.0,  y:  0.0,  scale: 1.00, rotY:  0.00, rotZ:  0.04, title: 1, logo: 0, menu: 0, detail: 0 },
  about:     { x:  1.68, y:  0.00, scale: 0.92, rotY:  0.60, rotZ: -0.10, title: 0, logo: 1, menu: 0, detail: 0 },
  // Portfolio: the discipline picker is a DOM card deck in front of the bubble,
  // and the bubble stays CENTRED (like cover) so the deck sits inside it as a
  // glowing aura behind/around the cards. It still morphs to its restless
  // portfolio knot + violet tint (driven by `menu`, which renders no 3D labels).
  portfolio: { x:  0.0,  y:  0.00, scale: 1.00, rotY:  0.00, rotZ:  0.04, title: 0, logo: 0, menu: 1, detail: 0 },
  // Detail: opening a discipline (a sub-folder of portfolio) drops the "camera"
  // DOWN into the sub-area. The camera descending makes the world rise, so the
  // bubble slides UP and out (positive y) and recedes to a glow above the
  // showcase, keeping its portfolio knot (menu:1). `detail` swaps its violet film
  // to teal/cyan, so position AND colour shift the moment you enter a discipline.
  detail:    { x:  0.0,  y:  1.25, scale: 0.78, rotY:  0.00, rotZ:  0.04, title: 0, logo: 0, menu: 1, detail: 1 },
};

// Site accent red, reused for the menu hover highlight.
const ACCENT = new THREE.Color('#ff3c3c');

function initBubble(container) {
  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Touch devices have no hover and no continuous pointer, so steering the
  // bubble by dragging feels broken. On a coarse pointer we instead run a slow,
  // hands-off orbit: the bubble turntables and the star dome wheels on its own.
  // Desktop (fine pointer) keeps the original cursor-driven mouse-look.
  const autoOrbit =
    window.matchMedia('(hover: none) and (pointer: coarse)').matches && !prefersReducedMotion;
  // ?snap snaps every eased value straight to its target each frame (no
  // transition). Used for capturing settled end-state screenshots.
  const SNAP = new URLSearchParams(location.search).has('snap');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    console.error('Bubble: WebGL unavailable', err);
    return null;
  }
  // OPAQUE dark canvas: real transmission glass needs a solid background to
  // refract. On a transparent canvas Three hardcodes the glass background to
  // white, which is why the bubble was a white blob. The portfolio cards stay
  // visible because the bubble canvas is layered BEHIND them (see index.html).
  renderer.setClearColor(0x060606, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;  // filmic look, same as the glass preview
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060606);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 5.2);

  // ---- Environment: the demo's three Lightformers baked into a PMREM map ----
  // Exact preview values (red rect behind, two white at the sides).
  const pmrem = new THREE.PMREMGenerator(renderer);
  {
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x141414);
    const rect = (hex, intensity, sx, sy, pos) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(sx, sy),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity), side: THREE.DoubleSide })
      );
      m.position.set(pos[0], pos[1], pos[2]);
      m.lookAt(0, 0, 0);
      envScene.add(m);
    };
    rect(0xffffff, 5, 10, 5, [0, 5, -10]);
    rect(0xffffff, 2, 10, 5, [5, 0, 0]);
    rect(0xffffff, 2, 10, 5, [-5, 0, 0]);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  }

  // ---- Post-processing: bloom (demo: strength 0.1, radius 0.8, threshold 1) --
  const fxTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, fxTarget);
  const renderPass = new RenderPass(scene, camera);
  renderPass.clearColor = new THREE.Color(0x060606);
  renderPass.clearAlpha = 1;                 // opaque: stops Three's white glass-background
  composer.addPass(renderPass);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.1, 0.8, 1.0);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // ---- starfield: a fixed night sky at "infinity" -----------------------
  // A dome of points wrapping the camera (which sits inside it). It never drifts
  // on its own; the render loop rotates the whole dome to mirror the mouse, so
  // moving the cursor reads as a first-person camera turning its head across a
  // fixed sky - real 3D rotation through the perspective camera, so stars near
  // the edges sweep further than those you're looking straight at. Added to the
  // scene (not the stage), so the bubble's lean/idle never disturbs it.
  const starfield = new THREE.Group();
  starfield.renderOrder = -10;     // always paints behind the bubble
  {
    // Soft round star sprite (a radial-gradient dot) so points aren't squares.
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sg = sc.getContext('2d');
    const grd = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0.0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1.0, 'rgba(255,255,255,0)');
    sg.fillStyle = grd;
    sg.fillRect(0, 0, 64, 64);
    const starTex = new THREE.CanvasTexture(sc);

    // Tiny deterministic PRNG so the sky looks identical every load.
    let ss = 90071;
    const srnd = () => (ss = (ss * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    function makeLayer(count, size, minB, maxB) {
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        // Uniform direction on a sphere; small radius variation adds depth.
        const theta = srnd() * Math.PI * 2;
        const phi = Math.acos(2 * srnd() - 1);
        const R = 56 + srnd() * 10;
        const sp = Math.sin(phi);
        pos[i * 3]     = R * sp * Math.cos(theta);
        pos[i * 3 + 1] = R * Math.cos(phi);
        pos[i * 3 + 2] = R * sp * Math.sin(theta);
        // Plain white stars, scaled by a random brightness.
        const b = minB + srnd() * (maxB - minB);
        col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({
        size,
        map: starTex,
        vertexColors: true,
        transparent: true,
        depthTest: true,    // so the transmissive glass (drawn before transparents) occludes them
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });
      const pts = new THREE.Points(geo, mat);
      pts.renderOrder = -10;
      return pts;
    }

    starfield.add(makeLayer(1700, 0.10, 0.50, 1.15));  // dense, faint field
    starfield.add(makeLayer(130, 0.30, 1.30, 2.20));   // the few bright stars
  }
  scene.add(starfield);

  // ---- ribbon: real MeshPhysicalMaterial transmission glass (preview settings)
  const geometry = buildRibbon();
  const material = new THREE.MeshPhysicalMaterial({
    transmission: 1,
    roughness: 0,
    thickness: 0.25,
    ior: 1.5,
    metalness: 0,
    envMapIntensity: 1,
    side: THREE.DoubleSide,
  });
  const bubble = new THREE.Mesh(geometry, material);
  bubble.morphTargetInfluences = [0, 0]; // [about, portfolio], eased each frame

  const ribbonGroup = new THREE.Group();
  ribbonGroup.add(bubble);
  ribbonGroup.rotation.x = -0.28;

  // ---- title (faux-extruded 3D lettering) -------------------------------
  // The GHILLIE wordmark is a stack of textured planes stepped back along Z,
  // dark at the back and bright at the front, so it reads as solid 3D type
  // whose thickness becomes visible as the stage leans toward the cursor.
  // The stack must be DENSE: with only a handful of layers the gaps between
  // them show up as a visible staircase when the wordmark turns side-on (the
  // mobile auto-orbit). Many tightly-spaced layers read as one smooth solid.
  const titleTex = makeTextTexture('GHILLIE', renderer);
  const titleAspect = 1200 / 500;
  const titleWidth = 1.95;
  const titleZ = 0;     // sit in the middle of the bubble (centre of the ring)
  const titleGeo = new THREE.PlaneGeometry(titleWidth, titleWidth / titleAspect);
  const TITLE_LAYERS = 64;   // dense enough that the steps blur into a solid slab
  const titleDepth = 0.16;
  const title = new THREE.Group();
  for (let i = 0; i < TITLE_LAYERS; i++) {
    const f = TITLE_LAYERS === 1 ? 1 : i / (TITLE_LAYERS - 1); // 0 = back .. 1 = front face
    // Boosted above 1.0 at the front face so the bloom pass (threshold 1) catches
    // it and the wordmark glows white. The back of the extrude stays dim.
    const shade = (0.16 + 0.74 * f) * 2.2;
    const layer = new THREE.Mesh(
      titleGeo,
      new THREE.MeshBasicMaterial({
        map: titleTex,
        color: new THREE.Color(shade, shade, shade),
        alphaTest: 0.5,      // opaque letters, so the glass can refract them
        depthWrite: true,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    );
    layer.position.set(0, 0, titleZ + titleDepth * (f - 0.5)); // extrusion centred on titleZ
    layer.renderOrder = i;                                     // front face paints last
    title.add(layer);
  }

  // ---- logo (circular GhilliePFP) that sits in the centre of the bubble -------
  // It writes to the depth buffer (depthWrite: true) and lives on the ring's
  // centre plane (z = titleZ = 0). The ribbon depth-tests against it but doesn't
  // write depth, so the strands that swing toward the camera paint OVER the logo
  // while the strands that swing away are hidden behind it, the loop genuinely
  // threads in front of and behind the photo. A CircleGeometry (not a plane)
  // means there are no transparent corners writing stray depth around it.
  const logoTex = makeLogoTexture('/assets/img/profilePictures/GhilliePFP.png', renderer);
  const logoMat = new THREE.MeshBasicMaterial({
    map: logoTex,
    depthWrite: true,        // opaque photo, so the glass refracts it
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const logoSize = 0.92;
  const logo = new THREE.Mesh(new THREE.CircleGeometry(logoSize / 2, 64), logoMat);
  logo.position.set(0, 0, titleZ); // dead centre of the bubble
  logo.renderOrder = -1;           // draw (and write depth) before the ribbon
  logo.visible = false;

  // ---- portfolio discipline menu (3D, built on demand via api.setMenu) ---
  // Each discipline becomes a faux-extruded label, stacked in the bubble's
  // centre exactly like GHILLIE. The menu is counter-rotated to face the
  // camera so the labels stay readable while the bubble itself leans/spins,
  // and a raycaster drives hover + click straight off the 3D meshes.
  const menu = new THREE.Group();
  menu.visible = false;
  menu.position.set(0, 0, -0.28); // behind the ribbon's centre plane; hover lifts the active label forward
  let menuButtons = [];          // [{ group, frontMat, base, id }]
  let hitTargets = [];           // invisible, gap-free hit planes (raycast only these)
  let onMenuSelect = null;
  let onMenuHover = null;        // notified (id|null) whenever the hovered label changes
  let lastHoveredId = undefined; // tracks hover changes so we only fire on transitions

  // A short label rendered to its own tightly-cropped canvas (fixed font size,
  // variable width) so every discipline shares one type size.
  function makeLabelTexture(text) {
    const fontSize = 150, pad = 30;
    const font = `800 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    const w = Math.ceil(measure.measureText(text).width) + pad * 2;
    const h = fontSize + pad * 2;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.font = font;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 4);
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return { tex, aspect: w / h };
  }

  // One discipline button, a single FLAT label (the faux-3D extrusion was
  // stripped back). It sits clean and head-on; hover slides it forward, scales
  // it up and turns the bright off-white face full accent-red. Returns the
  // materials in the same { layers, frontMat } shape the render loop expects so
  // the hover/dim logic keeps working with a one-layer "stack".
  function buildButton(text) {
    const { tex, aspect } = makeLabelTexture(text);
    const height = 0.2;          // taller = bigger, easier-to-hit targets
    const width = height * aspect;
    const geo = new THREE.PlaneGeometry(width, height);
    const group = new THREE.Group();
    const base = new THREE.Color(0.92, 0.92, 0.92);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: base.clone(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const layer = new THREE.Mesh(geo, mat);
    // Same renderOrder as the ribbon so the two sort by camera distance: a
    // label sitting behind the ribbon's centre plane is painted over (it shows
    // through the translucent film), and a hovered label that lifts toward the
    // camera paints on top of the ribbon.
    layer.renderOrder = 0;
    group.add(layer);
    return { group, layers: [{ mat, base }], frontMat: mat, width, height };
  }

  function setMenu(items, onSelect, onHover) {
    onMenuSelect = onSelect;
    onMenuHover = onHover || null;
    menuButtons.forEach((b) => menu.remove(b.group));
    hitTargets.forEach((h) => menu.remove(h));
    menuButtons = [];
    hitTargets = [];
    const built = items.map((it) => ({ it, ...buildButton(String(it.label).toUpperCase()) }));
    const pitch = 0.3;
    const topY = ((built.length - 1) * pitch) / 2;
    // One uniform, generous hit width so the whole row is hoverable regardless
    // of label length; hit height == pitch so rows tile with no dead gaps.
    const hitW = Math.max(...built.map((b) => b.width)) + 0.2;
    built.forEach((b, idx) => {
      const alignX = 0;                           // centre each label in the bubble
      const baseY = topY - idx * pitch;
      b.group.position.set(alignX, baseY, 0);
      b.group.userData.id = b.it.id;
      menu.add(b.group);

      // Invisible hit plane fixed at the label's REST position. The raycaster
      // tests these (never the labels), so the hover lift/scale can't shift the
      // target out from under the cursor, no flicker at the edges. Rows tile
      // (height == pitch) so moving between labels never lands on "nothing".
      const hit = new THREE.Mesh(
        new THREE.PlaneGeometry(hitW, pitch),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
      );
      hit.position.set(alignX, baseY, 0);
      hit.userData.id = b.it.id;
      menu.add(hit);
      hitTargets.push(hit);

      // Accent tick just left of each label, revealed on hover.
      const accent = new THREE.Mesh(
        new THREE.PlaneGeometry(0.02, b.height * 0.74),
        new THREE.MeshBasicMaterial({
          color: ACCENT, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
        })
      );
      accent.position.set(-b.width / 2 - 0.06, 0, 0.03);
      accent.renderOrder = 30;
      b.group.add(accent);

      menuButtons.push({
        group: b.group,
        layers: b.layers,
        frontBase: b.frontMat.color.clone(),
        accent,
        id: b.it.id,
        baseY,
        alignX,
        hover: 0,
      });
    });
  }

  // Raycasting helpers shared by hover (in tick) and click.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let currentView = 'cover';
  let detailOpen = false;
  let menuFocus = 0; // eased 0..1: how strongly any one label is being pointed at

  function pickDiscipline(ndcX, ndcY) {
    ndc.set(ndcX, ndcY);
    raycaster.setFromCamera(ndc, camera);
    // Test only the fixed hit planes, not the labels (which lift/scale on hover).
    const hits = raycaster.intersectObjects(hitTargets, false);
    return hits.length ? hits[0].object.userData.id : null;
  }

  window.addEventListener('click', (e) => {
    if (currentView !== 'portfolio' || detailOpen || cur.menu < 0.5 || !onMenuSelect) return;
    const id = pickDiscipline(
      (e.clientX / window.innerWidth) * 2 - 1,
      -((e.clientY / window.innerHeight) * 2 - 1)
    );
    if (id) onMenuSelect(id);
  });

  // Master stage: everything moves together when we "navigate".
  const stage = new THREE.Group();
  stage.add(ribbonGroup);
  stage.add(title);
  stage.add(logo);
  stage.add(menu);
  scene.add(stage);

  // animated state (eased toward `target` each frame)
  const cur = { ...STATES.cover };
  let target = STATES.cover;

  // ---- Pointer tracking -------------------------------------------------
  // Mirror the production cover (template-bubble.js): the bubble leans toward
  // the cursor. Pointer position maps to a target tilt; the render loop eases
  // toward it each frame so the lean trails smoothly behind the mouse, layered
  // on top of the idle drift and the per-view rotation targets.
  const pointer = { x: 0, y: 0 };       // normalised cursor, -1..1
  const tilt = { x: 0, y: 0 };          // current eased tilt
  const MAX_TILT = 0.45;                // how far the bubble leans (radians)

  // Mouse-look applied to the star dome: the cursor is where the camera looks,
  // so the sky yaws/pitches like a first-person camera. Eased a touch heavier
  // than the bubble's lean so the sky feels weighty and distant.
  const look = { yaw: 0, pitch: 0 };
  const LOOK_YAW = 0.32, LOOK_PITCH = 0.20;   // radians at full cursor sweep
  // Each section is the camera pointed elsewhere, so the sky sits at a slightly
  // different angle. Subtle, because the stars are so far away.
  const VIEW_LOOK = {
    cover:     { yaw:  0,    pitch: 0 },
    about:     { yaw:  0.12, pitch: 0 },
    portfolio: { yaw: -0.12, pitch: 0 },   // exact mirror of about: sky yaws the opposite way
    detail:    { yaw: -0.12, pitch:  0.16 },   // dropping down into a discipline: camera tilts down, sky lifts
  };

  // Cursor steering is desktop-only: on touch the auto-orbit drives everything.
  if (!prefersReducedMotion && !autoOrbit) {
    window.addEventListener('pointermove', (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    });
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    composer.setSize(w, h);
  }
  resize();
  new ResizeObserver(resize).observe(container);
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock();
  function tick() {
    const t = prefersReducedMotion ? 0 : clock.getElapsedTime();

    // critically-damped-ish ease toward the active view's target
    const k = (prefersReducedMotion || SNAP) ? 1 : 0.075;
    cur.x     += (target.x     - cur.x)     * k;
    cur.y     += (target.y     - cur.y)     * k;
    cur.scale += (target.scale - cur.scale) * k;
    cur.rotY  += (target.rotY  - cur.rotY)  * k;
    cur.rotZ  += (target.rotZ  - cur.rotZ)  * k;
    cur.title += (target.title - cur.title) * k;
    cur.logo  += (target.logo  - cur.logo)  * k;
    cur.menu  += (target.menu  - cur.menu)  * k;
    cur.detail += (target.detail - cur.detail) * k;

    // Drive the ribbon's shape morph (native morph targets): 0 = about, 1 = portfolio.
    bubble.morphTargetInfluences[0] = cur.logo;
    bubble.morphTargetInfluences[1] = cur.menu;

    let orbitSpin = 0;
    const vl = VIEW_LOOK[currentView] || VIEW_LOOK.cover;
    if (autoOrbit) {
      // Mobile: a slow, automatic sway replaces cursor steering. The WHOLE
      // stage ping-pongs left<->right, the GHILLIE wordmark AND the ribbon
      // together, so they move as one, as if the camera were rocking around the
      // scene, and the star dome wheels with it. A gentle fixed tilt keeps it off
      // perfectly edge-on. (Driving the stage, not just the ribbon, is what makes
      // the title sway too instead of staying face-on to the camera.)
      orbitSpin = Math.sin(t * 0.20) * 0.6;               // ~31s per L->R->L cycle, ~34deg each way
      tilt.x += (0.12 - tilt.x) * 0.05;
      tilt.y += (0 - tilt.y) * 0.05;
      look.yaw   += ((orbitSpin * 0.5 + vl.yaw) - look.yaw)   * 0.02;
      look.pitch += ((vl.pitch)                 - look.pitch) * 0.02;
    } else {
      // ease the tilt toward the cursor so it trails smoothly behind it
      if (!prefersReducedMotion) {
        tilt.x += (pointer.y * MAX_TILT - tilt.x) * 0.06;
        tilt.y += (pointer.x * MAX_TILT - tilt.y) * 0.06;
      }
      // First-person mouse-look on the sky: rotating the fixed star dome IS the
      // camera turning its head. Cursor right -> yaw right (sky wheels left);
      // cursor down -> pitch down. Eased heavily so the distant sky feels weighty.
      look.yaw   += ((pointer.x * LOOK_YAW   + vl.yaw)   - look.yaw)   * 0.045;
      look.pitch += ((pointer.y * LOOK_PITCH + vl.pitch) - look.pitch) * 0.045;
    }
    starfield.rotation.set(look.pitch, look.yaw, 0);

    stage.position.set(cur.x, cur.y, 0);
    stage.scale.setScalar(cur.scale);
    const idle = prefersReducedMotion ? 0 : Math.sin(t * 0.12) * 0.10;
    stage.rotation.y = idle + cur.rotY + tilt.y + orbitSpin;
    stage.rotation.x = tilt.x;
    stage.rotation.z = cur.rotZ - tilt.y * 0.15;

    // Opaque title fades by scaling away (opacity no longer applies).
    title.visible = cur.title > 0.01;
    title.scale.setScalar(Math.max(0.0001, cur.title));

    // Keep the logo facing the camera; opaque photo fades by scaling in/out.
    logo.visible = cur.logo > 0.01;
    logo.scale.setScalar(Math.max(0.0001, cur.logo));
    logo.rotation.x = -stage.rotation.x;
    logo.rotation.y = -stage.rotation.y;
    logo.rotation.z = -stage.rotation.z;

    // ---- portfolio menu: face the camera, fade, hover-highlight ----------
    const menuOpacity = Math.max(0, cur.menu);
    menu.visible = cur.menu > 0.01;
    if (menu.visible) {
      // counter the stage rotation so the labels read flat to the camera
      menu.rotation.x = -stage.rotation.x;
      menu.rotation.y = -stage.rotation.y;
      menu.rotation.z = -stage.rotation.z;

      // hover only when portfolio is the live, interactive view
      const interactive = currentView === 'portfolio' && !detailOpen && cur.menu > 0.5;
      const hoveredId =
        interactive && !prefersReducedMotion ? pickDiscipline(pointer.x, -pointer.y) : null;
      document.body.style.cursor = hoveredId ? 'pointer' : '';
      // Tell the page when the hovered discipline changes so it can update the
      // live preview panel alongside the 3D menu.
      if (hoveredId !== lastHoveredId) {
        lastHoveredId = hoveredId;
        if (onMenuHover) onMenuHover(hoveredId);
      }
      menuFocus += ((hoveredId ? 1 : 0) - menuFocus) * 0.18;

      for (let i = 0; i < menuButtons.length; i++) {
        const b = menuButtons[i];
        b.hover += ((b.id === hoveredId ? 1 : 0) - b.hover) * 0.18;

        // Hovered label is pulled forward THROUGH the ribbon: the menu sits at
        // z -0.28, so lifting by up to ~0.75 carries the active label from
        // behind the film (back ≈ -0.28) to clearly in front of it (≈ +0.47).
        // Everything keeps a gentle, phase-offset idle bob so it feels alive.
        const bob = prefersReducedMotion ? 0 : Math.sin(t * 1.1 + i * 0.7) * 0.005;
        b.group.position.set(b.alignX, b.baseY + bob, b.hover * 0.75);
        b.group.scale.setScalar(1 + b.hover * 0.12);

        // the labels you're NOT pointing at dim back so the focus pops
        const bright = 1 - 0.55 * (menuFocus * (1 - b.hover));
        const last = b.layers.length - 1;
        for (let j = 0; j <= last; j++) {
          const l = b.layers[j];
          if (j === last) {
            l.mat.color.copy(b.frontBase).lerp(ACCENT, b.hover).multiplyScalar(bright);
          } else {
            l.mat.color.copy(l.base).multiplyScalar(bright);
          }
          l.mat.opacity = menuOpacity;
        }
        b.accent.material.opacity = menuOpacity * b.hover;
        b.accent.scale.y = 0.35 + 0.65 * b.hover;
      }
    } else if (document.body.style.cursor === 'pointer') {
      document.body.style.cursor = '';
    }

    composer.render();
    requestAnimationFrame(tick);
  }
  tick();

  // ---- optional live tuning panel (open the page with ?tune) -------------
  // A dependency-free slider panel so the glass can be dialled by eye instead of
  // by editing constants. Never shows for normal visitors (no ?tune in the URL).
  if (new URLSearchParams(location.search).has('tune')) buildTuneUI();
  function buildTuneUI() {
    const panel = document.createElement('div');
    panel.style.cssText =
      'position:fixed;top:12px;left:12px;z-index:99999;background:rgba(10,10,10,0.86);' +
      'border:1px solid #333;border-radius:10px;padding:12px 14px;width:240px;' +
      'font:12px/1.4 system-ui,sans-serif;color:#e1e1e1;pointer-events:auto;' +
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';
    panel.innerHTML =
      '<div style="font-weight:700;margin-bottom:6px;letter-spacing:.05em">BUBBLE GLASS TUNER</div>';

    const rows = [
      ['Roughness', 0, 1, 0.01, () => material.roughness, (v) => (material.roughness = v)],
      ['Thickness', 0, 2, 0.01, () => material.thickness, (v) => (material.thickness = v)],
      ['Transmission', 0, 1, 0.01, () => material.transmission, (v) => (material.transmission = v)],
      ['IOR', 1, 2.333, 0.01, () => material.ior, (v) => (material.ior = v)],
      ['Env intensity', 0, 3, 0.01, () => material.envMapIntensity, (v) => (material.envMapIntensity = v)],
      ['Bloom strength', 0, 3, 0.01, () => bloomPass.strength, (v) => (bloomPass.strength = v)],
      ['Bloom threshold', 0, 1, 0.01, () => bloomPass.threshold, (v) => (bloomPass.threshold = v)],
    ];

    rows.forEach(([label, min, max, step, get, set]) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin:9px 0;';
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:3px;';
      const name = document.createElement('span');
      name.textContent = label;
      const out = document.createElement('span');
      out.style.color = '#ff3c3c';
      out.textContent = (+get()).toFixed(4);
      head.append(name, out);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = min; input.max = max; input.step = step; input.value = get();
      input.style.cssText = 'width:100%;accent-color:#ff3c3c;';
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        set(v);
        out.textContent = v.toFixed(4);
      });
      wrap.append(head, input);
      panel.appendChild(wrap);
    });

    const btn = document.createElement('button');
    btn.textContent = 'Log values to console';
    btn.style.cssText =
      'margin-top:8px;width:100%;padding:6px;background:#ff3c3c;color:#fff;border:none;' +
      'border-radius:6px;cursor:pointer;font:inherit;font-weight:600;';
    btn.addEventListener('click', () => {
      console.log('Bubble glass settings:\n' + JSON.stringify({
        roughness: material.roughness,
        thickness: material.thickness,
        transmission: material.transmission,
        ior: material.ior,
        envMapIntensity: material.envMapIntensity,
        bloomStrength: bloomPass.strength,
        bloomThreshold: bloomPass.threshold,
      }, null, 2));
    });
    panel.appendChild(btn);
    document.body.appendChild(panel);
  }

  return {
    setState(name) {
      target = STATES[name] || STATES.cover;
      currentView = STATES[name] ? name : 'cover';
    },
    setMenu,
    setDetailOpen(v) { detailOpen = !!v; },
  };
}

// ---------------------------------------------------------------------------
// Geometry: a flat elliptical ribbon swept along an organic, twisting loop.
//
// MORPH TARGETS. The bubble doesn't just move between views, it changes SHAPE.
// We generate three vertex-identical variants of the ribbon (same topology, so
// they can be blended per-vertex) and store the cover->about and cover->portfolio
// position deltas as extra attributes. The vertex shader lerps the live shape
// toward whichever view is active, so the loop visibly relaxes into a fuller
// ring for ABOUT and tightens into an energetic, many-twist knot for PORTFOLIO.
// ---------------------------------------------------------------------------

// Per-view ribbon parameters. Same segU/segV everywhere keeps the vertex
// streams aligned so the shapes can morph into one another.
const RIBBON_SHAPES = {
  // Cover: the signature organic twisting oval (unchanged from the original).
  cover:     { a: 1.26, b: 0.90, ew: 0.170, eh: 0.045, twists: 2, rA: 0.070, rB: 0.035, zA: 0.15, zB: 0.07 },
  // About: calmer, rounder, fuller band, a near-circular halo to frame the photo.
  about:     { a: 1.07, b: 1.02, ew: 0.235, eh: 0.052, twists: 1, rA: 0.028, rB: 0.000, zA: 0.07, zB: 0.02 },
  // Portfolio: tighter, wavier, more twists, restless and creative.
  portfolio: { a: 1.34, b: 0.82, ew: 0.145, eh: 0.038, twists: 3, rA: 0.120, rB: 0.060, zA: 0.24, zB: 0.11 },
};

// Compute the position stream for one shape. Shared topology means index i*row+j
// always refers to the same logical vertex across every shape.
function ribbonPositions(P, segU, segV) {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const curve = (u) => {
    const r = 1.0 + P.rA * Math.sin(3 * u + 0.5) + P.rB * Math.sin(5 * u + 2.0);
    return V3(P.a * r * Math.cos(u), P.b * r * Math.sin(u),
      P.zA * Math.sin(2 * u + 1.0) + P.zB * Math.sin(4 * u - 0.6));
  };
  const positions = [];
  const up = V3(0, 0, 1);
  const T = V3(), N = V3(), B = V3(), C = V3(), C2 = V3();
  for (let i = 0; i <= segU; i++) {
    const u = (i / segU) * Math.PI * 2;
    C.copy(curve(u));
    C2.copy(curve(u + 0.0015));
    T.subVectors(C2, C).normalize();
    N.copy(up).addScaledVector(T, -up.dot(T)).normalize();
    B.crossVectors(T, N).normalize();
    const theta = P.twists * u;
    const ct = Math.cos(theta), st = Math.sin(theta);
    const ax = ct * N.x + st * B.x, ay = ct * N.y + st * B.y, az = ct * N.z + st * B.z;
    const bx = -st * N.x + ct * B.x, by = -st * N.y + ct * B.y, bz = -st * N.z + ct * B.z;
    for (let j = 0; j <= segV; j++) {
      const v = (j / segV) * Math.PI * 2;
      const cw = Math.cos(v) * P.ew, sh = Math.sin(v) * P.eh;
      positions.push(C.x + cw * ax + sh * bx, C.y + cw * ay + sh * by, C.z + cw * az + sh * bz);
    }
  }
  return positions;
}

function buildRibbon({ segU = 520, segV = 40 } = {}) {
  const base  = ribbonPositions(RIBBON_SHAPES.cover, segU, segV);
  const about = ribbonPositions(RIBBON_SHAPES.about, segU, segV);
  const port  = ribbonPositions(RIBBON_SHAPES.portfolio, segU, segV);

  const uvs = [], indices = [];
  for (let i = 0; i <= segU; i++)
    for (let j = 0; j <= segV; j++) uvs.push(i / segU, j / segV);

  const row = segV + 1;
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const p0 = i * row + j;
      const p1 = (i + 1) * row + j;
      const p2 = (i + 1) * row + (j + 1);
      const p3 = i * row + (j + 1);
      indices.push(p0, p1, p3, p1, p2, p3);
    }
  }

  // Per-shape normals so the glass shades correctly as it morphs between views.
  const normalsFor = (positions) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions.slice(), 3));
    g.setIndex(indices.slice());
    g.computeVertexNormals();
    const n = g.getAttribute('normal').array.slice();
    g.dispose();
    return n;
  };
  const nBase = normalsFor(base), nAbout = normalsFor(about), nPort = normalsFor(port);

  // Native morph targets (relative deltas): [0] = about, [1] = portfolio.
  const posA = new Float32Array(base.length), posP = new Float32Array(base.length);
  const norA = new Float32Array(base.length), norP = new Float32Array(base.length);
  for (let k = 0; k < base.length; k++) {
    posA[k] = about[k] - base[k];
    posP[k] = port[k]  - base[k];
    norA[k] = nAbout[k] - nBase[k];
    norP[k] = nPort[k]  - nBase[k];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nBase, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.morphTargetsRelative = true;
  geo.morphAttributes.position = [
    new THREE.Float32BufferAttribute(posA, 3),
    new THREE.Float32BufferAttribute(posP, 3),
  ];
  geo.morphAttributes.normal = [
    new THREE.Float32BufferAttribute(norA, 3),
    new THREE.Float32BufferAttribute(norP, 3),
  ];
  return geo;
}

function makeTextTexture(text, renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (px) => `800 ${px}px "Segoe UI", system-ui, sans-serif`;
  let fontSize = 320;
  ctx.font = font(fontSize);
  while (ctx.measureText(text).width > canvas.width * 0.86 && fontSize > 40) {
    fontSize -= 8;
    ctx.font = font(fontSize);
  }
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// A soft radial red disc used as the glow halo behind the profile photo. The
// centre is brightest (it sits behind the opaque photo, so only the ring beyond
// the photo's edge is seen) and pushed above 1.0 by the material colour so the
// bloom pass picks it up and bleeds a real red glow.
function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0.0, 'rgba(255,60,60,0.95)');
  grd.addColorStop(0.38, 'rgba(255,60,60,0.62)');
  grd.addColorStop(0.58, 'rgba(255,40,40,0.28)');
  grd.addColorStop(1.0, 'rgba(255,40,40,0.0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Loads an image and draws it circle-cropped onto a transparent canvas, so the
// logo reads as the same round avatar used by the spinglow on the about page.
// Returns immediately with an empty texture; it fills in once the image loads.
function makeLogoTexture(url, renderer) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    // cover-fit the (possibly non-square) source into the circle
    const s = Math.max(size / img.width, size / img.height);
    const w = img.width * s, h = img.height * s;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    ctx.restore();
    tex.needsUpdate = true;
  };
  img.src = url;
  return tex;
}

// ---------------------------------------------------------------------------
// Shaders (thin-film interference soap shader)
// ---------------------------------------------------------------------------
const NOISE_GLSL = /* glsl */ `
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const VERTEX_SHADER = /* glsl */ `
uniform float uTime;
uniform float uAbout;
uniform float uPortfolio;
attribute vec3 aDeltaA;
attribute vec3 aDeltaP;
varying vec3  vN;
varying vec3  vV;
varying vec3  vWPos;
varying vec2  vUv;
varying float vNoise;
${NOISE_GLSL}
void main() {
  // Blend the cover shape toward the active view's morph target.
  vec3 pos = position + aDeltaA * uAbout + aDeltaP * uPortfolio;
  float w = snoise(pos * 1.5 + uTime * 0.15);
  vNoise = w;
  pos += normal * w * 0.008;
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vWPos = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uAbout;
uniform float uPortfolio;
uniform float uDetail;
uniform samplerCube uEnv;
uniform sampler2D uBg;
uniform vec2 uResolution;
uniform float uRefract;
uniform float uEnvIntensity;
uniform float uRoughness;
uniform float uGlassMix;
uniform float uOpacity;
varying vec3  vN;
varying vec3  vV;
varying vec3  vWPos;
varying vec2  vUv;
varying float vNoise;
${NOISE_GLSL}
#define PI 3.14159265359
float thinFilm(float d, float cosR, float lambda) {
  float phase = (4.0 * PI * 1.33 * d * cosR) / lambda;
  float s = sin(phase * 0.5);
  return s * s;
}
float fbm(vec3 p) {
  float f = 0.0, amp = 0.5;
  for (int i = 0; i < 3; i++) { f += amp * snoise(p); p *= 2.02; amp *= 0.5; }
  return f;
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float cosT = abs(dot(N, V));
  float sinI = sqrt(max(0.0, 1.0 - cosT * cosT));
  float cosR = sqrt(max(0.0, 1.0 - (sinI / 1.33) * (sinI / 1.33)));
  float fres = pow(1.0 - cosT, 2.0);
  vec3 p = vWPos * 0.82;
  vec3 q = vec3(
    fbm(p + vec3(0.0, uTime * 0.07, 0.0)),
    fbm(p + vec3(2.3, uTime * 0.05, 4.1)),
    fbm(p + vec3(5.2, 1.7, uTime * 0.045))
  );
  vec3 r = vec3(
    fbm(p * 2.4 + 2.0 * q + vec3(uTime * 0.05, 0.0, 1.0)),
    fbm(p * 2.4 + 2.0 * q + vec3(3.0, uTime * 0.06, 0.0)),
    fbm(p * 2.4 + 2.0 * q + vec3(0.0, 5.0, uTime * 0.04))
  );
  float swirl = fbm(p + 2.2 * q + 0.55 * r + uTime * 0.03);
  float drain = smoothstep(-0.2, 1.1, vWPos.y);
  float d = 340.0
          + (1.0 - cosT) * 250.0
          + swirl * 300.0
          + sin(uTime * 0.18 + vWPos.y * 1.6) * 22.0
          - drain * 150.0;
  vec3 irid = vec3(
    thinFilm(d, cosR, 630.0),
    thinFilm(d, cosR, 532.0),
    thinFilm(d, cosR, 465.0)
  );
  float ilum = dot(irid, vec3(0.299, 0.587, 0.114));
  irid = mix(vec3(ilum), irid, 0.36);
  vec3 L1 = normalize(vec3( 0.85, 0.85, 0.40));
  vec3 L2 = normalize(vec3( 0.55, 0.50, 0.70));
  float lit = clamp(0.5 + 0.5 * dot(normalize(vWPos), L1), 0.0, 1.0);
  lit = pow(lit, 1.4);
  float shade = 0.14 + 0.95 * lit;
  vec3 col = vec3(0.18 + 0.22 * fres) * shade;
  col += irid * 0.26 * shade;
  float redMask = 0.5 + 0.5 * swirl;
  col += vec3(1.0, 0.235, 0.235) * shade * redMask * 0.14;
  col *= (1.0 - 0.5 * drain);

  // ---- Per-view colour shift ------------------------------------------------
  // ABOUT washes the film in a warm amber/rose; PORTFOLIO drives it electric
  // violet. The swirl modulates it so the tint flows through the film instead
  // of sitting flat, and the lit side carries more of it than the shadowed one.
  vec3 warm = vec3(1.00, 0.62, 0.34);
  vec3 cool = vec3(0.74, 0.34, 1.00);
  // Opening a discipline shifts the cool violet toward a teal/cyan, so the same
  // portfolio-knot bubble reads as a clearly different colour inside a sub-folder.
  vec3 deep = vec3(0.24, 0.92, 0.95);
  vec3 tint = warm * uAbout + mix(cool, deep, uDetail) * uPortfolio;
  float tintFlow = 0.55 + 0.45 * swirl;
  col += tint * shade * tintFlow * (0.16 + 0.40 * fres);

  col += vec3(0.55, 0.60, 0.70) * pow(fres, 3.0) * 0.5 * lit;
  float g1 = pow(max(dot(N, normalize(L1 + V)), 0.0), 130.0);
  float g2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 85.0);
  float glint = g1 * 1.0 + g2 * 0.45;
  col += vec3(glint) * (0.04 + 0.96 * lit);

  // ---- Glass refraction: the film reads as a frosted glass band ------------
  // The strand doesn't just ADD a bent copy over a still-clear view (that double
  // image is what made it look like a faint wrap). Instead it samples the scene
  // behind it along the view-space normal (so it warps), blurs a few taps so it's
  // FROSTED rather than a clean window, and lets that bent image largely REPLACE
  // the straight-through view - so you can't see cleanly past the glass.
  vec3 Nv = normalize(mat3(viewMatrix) * N);
  vec2 suv = gl_FragCoord.xy / uResolution;
  vec2 roff = Nv.xy * uRefract;
  vec2 jx = vec2(uRoughness, 0.0);
  vec2 jy = vec2(0.0, uRoughness);
  vec3 refr = vec3(
    texture2D(uBg, suv + roff * 1.05).r,
    texture2D(uBg, suv + roff       ).g,
    texture2D(uBg, suv + roff * 0.95).b) * 0.4;
  refr += texture2D(uBg, suv + roff + jx).rgb * 0.15;
  refr += texture2D(uBg, suv + roff - jx).rgb * 0.15;
  refr += texture2D(uBg, suv + roff + jy).rgb * 0.15;
  refr += texture2D(uBg, suv + roff - jy).rgb * 0.15;
  float refrLum = dot(refr, vec3(0.299, 0.587, 0.114));
  // the bent, frosted background becomes the body of the glass (still tinted by
  // the film), instead of a faint overlay on a clear strand.
  col = mix(col, col * 0.5 + refr, uGlassMix);

  // ---- Environment reflection: the star dome mirrored on the wet sheen ------
  vec3 Rdir = reflect(-V, N);
  vec3 env = textureCube(uEnv, Rdir).rgb;
  col += env * uEnvIntensity * (0.15 + 0.85 * fres);

  // overall saturation lift so the film reads more vivid
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = max(mix(vec3(luma), col, 1.35), 0.0);
  // Frosted-glass opacity: the strand must OBSCURE what's behind it (show the
  // bent, frosted version) rather than let the clear background read through, or
  // it looks like a transparent wrap again. High body alpha, near-solid at the
  // lit rim and on glints.
  float alpha = clamp(uOpacity + fres * 0.4 + glint * 0.6 + refrLum * 0.3
                      + (uAbout + uPortfolio) * 0.05 * tintFlow, 0.0, 1.0);
  alpha *= (1.0 - 0.4 * drain);
  gl_FragColor = vec4(col, alpha);
}
`;

// ---------------------------------------------------------------------------
// Boot + hash router
// ---------------------------------------------------------------------------
const stageEl = document.getElementById('bubble-stage');
const api = stageEl ? initBubble(stageEl) : null;

// Hand the API to the page script (which owns the DISCIPLINES data and the
// detail-view routing) so it can populate the 3D menu and tell us when the
// detail overlay opens/closes. The classic inline script runs first and has
// already registered its listener by the time this deferred module dispatches.
if (api) window.dispatchEvent(new CustomEvent('bubble:ready', { detail: api }));

const VIEWS = ['cover', 'about', 'portfolio'];

// Hash format: #<view>[ /<disciplineId>[ /<sub> ] ]
//   #about                        -> about view
//   #portfolio                    -> discipline menu
//   #portfolio/websites           -> Websites detail (overlays the menu)
//   #portfolio/websites/pricing   -> Websites detail, scrolled to pricing
function route() {
  const parts = (location.hash || '#cover').slice(1).split('/');
  const base = VIEWS.includes(parts[0]) ? parts[0] : 'cover';
  const detailId = base === 'portfolio' ? (parts[1] || null) : null;

  document.querySelectorAll('.view').forEach((v) => {
    let on = v.id === 'view-' + base;
    if (v.id === 'view-detail') on = !!detailId;               // detail overlay = sub-segment present
    else if (v.id === 'view-portfolio' && detailId) on = false; // detail covers the menu
    v.classList.toggle('active', on);
  });
  document.body.dataset.view = base;
  // Opening a discipline drops the bubble into its `detail` pose (slides down +
  // recolours); the bare menu keeps the centred portfolio pose.
  if (api) api.setState(detailId ? 'detail' : base);

  // Page title reflects the current section (and open discipline, if any).
  const TITLES = { cover: 'Home', about: 'About', portfolio: 'Portfolio' };
  const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const section = detailId ? titleCase(detailId) : (TITLES[base] || 'Home');
  document.title = 'Ghillie | ' + section;

  // The page script owns DISCIPLINES; tell it what to build (or to tear down).
  window.dispatchEvent(new CustomEvent('route:detail', {
    detail: { id: detailId, sub: parts[2] || null },
  }));
}

window.addEventListener('hashchange', route);
route();
