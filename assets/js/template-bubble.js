// Soap-bubble renderer for the design template.
// A real twisting soap-film RIBBON (not a tube/donut): a flat elliptical band
// that loops and twists around itself, shaded with a physically-based thin-film
// interference model so the iridescence reacts to viewing angle and film
// thickness the way a real bubble does. GHILLIE sits in the hollow centre; the
// near side of the ribbon renders in front of it, the far side behind.

import * as THREE from 'three';

function initBubble(container) {
  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    console.error('Bubble: WebGL unavailable', err);
    return;
  }
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 5.2);

  // ---- Lighting -----------------------------------------------------------
  // The bubble's iridescence is self-contained in its shader, so these lights
  // exist mainly to shade the title plane. A faint ambient keeps it legible.
  scene.add(new THREE.AmbientLight(0xffffff, 0.42));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
  keyLight.position.set(5.4, 5.4, 2.6); // up in the top-right corner of the scene
  scene.add(keyLight);
  scene.add(keyLight.target);

  // ---- Twisting ribbon geometry -----------------------------------------
  const geometry = buildRibbon();

  const uniforms = {
    uTime: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });

  const bubble = new THREE.Mesh(geometry, material);

  // Tilt so the loop reads as a 3D ribbon sitting in space.
  const group = new THREE.Group();
  group.add(bubble);
  group.rotation.x = -0.28;
  group.rotation.z = 0.04;
  scene.add(group);

  // ---- GHILLIE title, in 3D space ---------------------------------------
  // The title stays a bright unlit white (MeshBasic), recessed behind the
  // loop's centre plane so the ribbon's near strands sit in front of it.
  const titleTex = makeTextTexture('GHILLIE', renderer);
  const titleMat = new THREE.MeshBasicMaterial({
    map: titleTex,
    color: 0xdedede,
    transparent: false,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const titleAspect = 1200 / 500;
  const titleWidth = 1.95;
  const titleZ = -0.5; // recessed behind the ribbon's front strands
  const title = new THREE.Mesh(
    new THREE.PlaneGeometry(titleWidth, titleWidth / titleAspect),
    titleMat
  );
  title.position.set(0, 0, titleZ);
  scene.add(title);

  // ---- Sizing / responsiveness ------------------------------------------
  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener('resize', resize);

  // ---- Pointer tracking --------------------------------------------------
  // The bubble leans toward the cursor: pointer position is mapped to a target
  // tilt, and the group eases toward it each frame so the motion stays fluid.
  const pointer = { x: 0, y: 0 };       // normalised cursor, -1..1
  const tilt = { x: 0, y: 0 };          // current eased tilt
  const MAX_TILT = 0.45;                // how far the bubble leans (radians)

  if (!prefersReducedMotion) {
    window.addEventListener('pointermove', (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    });
  }

  // ---- Animation loop ----------------------------------------------------
  const clock = new THREE.Clock();
  const baseRotX = group.rotation.x;
  const baseRotZ = group.rotation.z;

  function tick() {
    const t = prefersReducedMotion ? 0 : clock.getElapsedTime();
    uniforms.uTime.value = t;

    if (!prefersReducedMotion) {
      // ease the tilt toward the cursor so it trails smoothly behind it
      tilt.x += (pointer.y * MAX_TILT - tilt.x) * 0.06;
      tilt.y += (pointer.x * MAX_TILT - tilt.y) * 0.06;

      // very slow drift so the iridescence keeps shifting like a living film,
      // layered on top of the cursor-driven lean
      group.rotation.y = Math.sin(t * 0.12) * 0.10 + tilt.y;
      group.rotation.x = baseRotX + tilt.x;
      group.rotation.z = baseRotZ - tilt.y * 0.15;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}

// ---------------------------------------------------------------------------
// Geometry: a flat elliptical ribbon swept along an organic loop, twisting as
// it goes. A continuous frame (Gram-Schmidt against world up) plus an integer
// number of twists keeps the band seamless where it closes on itself.
// ---------------------------------------------------------------------------
function buildRibbon({
  segU = 520,        // samples around the loop
  segV = 40,         // samples around the (flat) cross-section
  a = 1.26, b = 0.90, // loop radii (wider than tall)
  ew = 0.17,         // ribbon half-WIDTH
  eh = 0.045,        // ribbon half-THICKNESS (flat band)
  twists = 2,        // full twists around the loop (integer => seamless)
} = {}) {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  function curve(u) {
    // organic, wavy oval with gentle out-of-plane undulation
    const r = 1.0 + 0.07 * Math.sin(3 * u + 0.5) + 0.035 * Math.sin(5 * u + 2.0);
    return V3(
      a * r * Math.cos(u),
      b * r * Math.sin(u),
      0.15 * Math.sin(2 * u + 1.0) + 0.07 * Math.sin(4 * u - 0.6)
    );
  }

  const positions = [];
  const uvs = [];
  const indices = [];
  const up = V3(0, 0, 1);
  const T = V3(), N = V3(), B = V3(), C = V3(), C2 = V3();

  for (let i = 0; i <= segU; i++) {
    const u = (i / segU) * Math.PI * 2;
    C.copy(curve(u));
    C2.copy(curve(u + 0.0015));
    T.subVectors(C2, C).normalize();
    // frame perpendicular to the tangent, stable for a near-planar loop
    N.copy(up).addScaledVector(T, -up.dot(T)).normalize();
    B.crossVectors(T, N).normalize();

    const theta = twists * u;
    const ct = Math.cos(theta), st = Math.sin(theta);
    // twisted cross-section axes (flat band: wide along A, thin along Bn)
    const ax = ct * N.x + st * B.x, ay = ct * N.y + st * B.y, az = ct * N.z + st * B.z;
    const bx = -st * N.x + ct * B.x, by = -st * N.y + ct * B.y, bz = -st * N.z + ct * B.z;

    for (let j = 0; j <= segV; j++) {
      const v = (j / segV) * Math.PI * 2;
      const cw = Math.cos(v) * ew;
      const sh = Math.sin(v) * eh;
      positions.push(
        C.x + cw * ax + sh * bx,
        C.y + cw * ay + sh * by,
        C.z + cw * az + sh * bz
      );
      uvs.push(i / segU, j / segV);
    }
  }

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

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Render the title to a transparent canvas and wrap it as a texture.
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

// ---------------------------------------------------------------------------
// Shaders
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

varying vec3  vN;
varying vec3  vV;
varying vec3  vWPos;
varying vec2  vUv;
varying float vNoise;

${NOISE_GLSL}

void main() {
  vec3 pos = position;

  // subtle living wobble so the film breathes
  float w = snoise(position * 1.5 + uTime * 0.15);
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

varying vec3  vN;
varying vec3  vV;
varying vec3  vWPos;
varying vec2  vUv;
varying float vNoise;

${NOISE_GLSL}

#define PI 3.14159265359

// Reflected intensity of a thin film at one wavelength (n = 1.33). The optical
// path is 2*n*d*cos(theta_refracted); reflected interference goes as sin^2 of
// half the phase, which is what gives the soap-film colour cycle.
float thinFilm(float d, float cosR, float lambda) {
  float phase = (4.0 * PI * 1.33 * d * cosR) / lambda;
  float s = sin(phase * 0.5);
  return s * s;
}

// Fractal noise (3 octaves): the building block for the swirling film flow.
float fbm(vec3 p) {
  float f = 0.0, amp = 0.5;
  for (int i = 0; i < 3; i++) { f += amp * snoise(p); p *= 2.02; amp *= 0.5; }
  return f;
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float cosT = abs(dot(N, V));

  // refraction angle inside the film (Snell, n = 1.33)
  float sinI = sqrt(max(0.0, 1.0 - cosT * cosT));
  float cosR = sqrt(max(0.0, 1.0 - (sinI / 1.33) * (sinI / 1.33)));

  float fres = pow(1.0 - cosT, 2.0);

  // ---- Marangoni flow: the film convects, so the colour bands SWIRL --------
  // Domain-warp the thickness field with a slowly drifting fbm so the
  // iridescence churns and folds like the surface of a real soap bubble,
  // instead of sitting as static blotches.
  vec3 p = vWPos * 0.82;
  vec3 q = vec3(
    fbm(p + vec3(0.0, uTime * 0.07, 0.0)),
    fbm(p + vec3(2.3, uTime * 0.05, 4.1)),
    fbm(p + vec3(5.2, 1.7, uTime * 0.045))
  );
  // Two-level warp: q folds the field into broad liquid sweeps, r adds the
  // finer turbulence that streaks along where the film flows fastest.
  vec3 r = vec3(
    fbm(p * 2.4 + 2.0 * q + vec3(uTime * 0.05, 0.0, 1.0)),
    fbm(p * 2.4 + 2.0 * q + vec3(3.0, uTime * 0.06, 0.0)),
    fbm(p * 2.4 + 2.0 * q + vec3(0.0, 5.0, uTime * 0.04))
  );
  float swirl = fbm(p + 2.2 * q + 0.55 * r + uTime * 0.03);

  // Film thickness in nm. Angle term forms colour bands that hug the ribbon's
  // curvature; the swirling fbm sweeps multiple interference orders (full
  // rainbow) across the faces; gravity thins the film toward the top so the
  // crown drains to near-black, like a bubble about to pop.
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

  // Very subtle iridescence: collapse most of the saturation toward the film's
  // own luminance so only a faint tint of colour survives the swirl.
  float ilum = dot(irid, vec3(0.299, 0.587, 0.114));
  irid = mix(vec3(ilum), irid, 0.36);

  // ---- Key light from the TOP-RIGHT of the scene ---------------------------
  // A single dominant light up and to the right, with a soft fill just below it.
  vec3 L1 = normalize(vec3( 0.85, 0.85, 0.40)); // key, top-right corner
  vec3 L2 = normalize(vec3( 0.55, 0.50, 0.70)); // soft fill
  // Broad shading gradient: the top-right of the film is lit, the lower-left
  // falls into shadow, so the whole bubble reads as lit from that direction.
  // Strong directional gradient so the light unmistakably comes from top-right:
  // the upper-right of the film glows, the lower-left sinks into shadow.
  float lit = clamp(0.5 + 0.5 * dot(normalize(vWPos), L1), 0.0, 1.0);
  lit = pow(lit, 1.4);
  float shade = 0.14 + 0.95 * lit; // near-dark in shadow .. bright in the key light

  // Translucent pearly-grey soap film, brighter at the lit edges, carrying only
  // a whisper of colour. Visible, but near-neutral.
  vec3 col = vec3(0.18 + 0.22 * fres) * shade;
  col += irid * 0.26 * shade;

  // A hint of #ff3c3c breathing through the lit film, drifting with the swirl.
  float redMask = 0.5 + 0.5 * swirl;
  col += vec3(1.0, 0.235, 0.235) * shade * redMask * 0.14;

  // The thinnest film (drained crown) goes transparent/dark, as on a real bubble.
  col *= (1.0 - 0.5 * drain);

  // soft Fresnel rim sheen along the silhouette, only where the key light reaches
  col += vec3(0.55, 0.60, 0.70) * pow(fres, 3.0) * 0.5 * lit;

  // Glassy environment glints from the top-right key + fill: crisp white
  // specular streaks, the wet sheen of a real bubble's surface. Biased hard to
  // the lit side so highlights don't appear on the shadowed lower-left.
  float g1 = pow(max(dot(N, normalize(L1 + V)), 0.0), 130.0);
  float g2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 85.0);
  float glint = g1 * 1.0 + g2 * 0.45;
  col += vec3(glint) * (0.04 + 0.96 * lit);

  // Overall saturation lift so the film reads more vivid.
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = max(mix(vec3(luma), col, 1.35), 0.0);

  // Mostly transparent; opaque toward edges and on glints. Colour barely
  // contributes to opacity now that it is so muted.
  float alpha = clamp(0.08 + fres * 0.7 + ilum * 0.16 + glint * 0.7, 0.0, 1.0);
  alpha *= (1.0 - 0.45 * drain); // the drained crown is barely there

  gl_FragColor = vec4(col, alpha);
}
`;

const stage = document.getElementById('bubble-stage');
if (stage) initBubble(stage);
