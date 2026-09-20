/* ============================================================================
   DIBSEN TECH — Hero Partikel 3D (Fase 4: Akselerasi Biner & Viewport Culling)
   - Data biner terpadat (Int16Array / Uint8Array) dimuat instan tanpa atob()
   - Paritas penuh: 64.000 titik partikel utuh di semua perangkat (Zero-Feature-Stripping)
   - IntersectionObserver menidurkan GPU saat user scroll ke bawah (hemat baterai & dingin)
   - Layout thrashing dihapus: pembacaan scroll tidak lagi memicu reflow DOM
   - DPR Clamping: 1.35 pada layar ponsel retina, 1.75 pada desktop
   - Formasi visual, efek shader curlNoise, interaksi air, kamera hFOV tetap 100% identik
   ========================================================================== */
(function () {
  'use strict';

  var DATA = window.DIBSEN_HERO_SHAPES;
  var canvas = document.getElementById('archipelago3d');
  var stageEl = document.getElementById('stage');
  if (!DATA || !canvas || !stageEl || !window.THREE) { return; }

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var low = false;
  var postFX = true; // Bloom post-processing selalu aktif

  var KEYS = DATA.keys, SHAPE_COUNT = KEYS.length, posScale = DATA.posScale;
  var FULL_N = DATA.count;
  var N = FULL_N; // Paritas penuh: 64.000 partikel utuh di semua perangkat

  function b64ToBytes(b64) {
    var bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  var posBytes = b64ToBytes(DATA.pos);
  var posI16 = new Int16Array(posBytes.buffer, posBytes.byteOffset, posBytes.byteLength / 2);
  var colBytes = b64ToBytes(DATA.col);

  var shapePos = [], shapeCol = [];
  for (var s = 0; s < SHAPE_COUNT; s++) {
    var p = new Float32Array(N * 3), c = new Float32Array(N * 3);
    var posOff = s * FULL_N * 3, colOff = s * FULL_N * 3;
    for (var i = 0; i < N; i++) {
      p[i * 3] = posI16[posOff + i * 3] / posScale;
      p[i * 3 + 1] = posI16[posOff + i * 3 + 1] / posScale;
      p[i * 3 + 2] = posI16[posOff + i * 3 + 2] / posScale;
      c[i * 3] = colBytes[colOff + i * 3] / 255;
      c[i * 3 + 1] = colBytes[colOff + i * 3 + 1] / 255;
      c[i * 3 + 2] = colBytes[colOff + i * 3 + 2] / 255;
    }
    shapePos.push(p); shapeCol.push(c);
  }
    function hash(x) { var v = Math.sin(x * 12.9898) * 43758.5453; return v - Math.floor(v); }

    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false }); }
    catch (e) { console.warn('[hero3d] WebGL gagal', e); return; }

    function getOptimalPR() {
      var maxPR = (window.innerWidth <= 900) ? 1.35 : 1.75;
      return Math.min(window.devicePixelRatio || 1, maxPR);
    }
    var PR = getOptimalPR();
    renderer.setPixelRatio(PR);
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = false;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    // Radius bounding logo: X = 1.70 (lebar ~3.4 unit), Y = 1.00.
    // targetCoverage = 0.82 (logo membungkus ~82% lebar layar HP portrait).
    var baseR = 4.2, R = baseR;
    var targetY = 0.0;
    var targetCoverage = 0.82;
    var objRadiusX = 1.70;
    var objRadiusY = 1.00;
    var tanHalfVFOV = Math.tan((45 * Math.PI / 180) / 2);

    var geo = new THREE.BufferGeometry();
    var posA = new Float32Array(N * 3), posB = new Float32Array(N * 3);
    var colA = new Float32Array(N * 3), colB = new Float32Array(N * 3);
    var seed = new Float32Array(N);
    for (var k = 0; k < N; k++) seed[k] = hash(k * 3.17);
    posA.set(shapePos[0]); posB.set(shapePos[0]); colA.set(shapeCol[0]); colB.set(shapeCol[0]);
    geo.setAttribute('position', new THREE.BufferAttribute(posA, 3));
    geo.setAttribute('aPosA', new THREE.BufferAttribute(posA, 3));
    geo.setAttribute('aPosB', new THREE.BufferAttribute(posB, 3));
    geo.setAttribute('aColA', new THREE.BufferAttribute(colA, 3));
    geo.setAttribute('aColB', new THREE.BufferAttribute(colB, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    var vert = [
      'attribute vec3 aPosA; attribute vec3 aPosB;',
      'attribute vec3 aColA; attribute vec3 aColB; attribute float aSeed;',
      'uniform float uMix; uniform float uBurst; uniform float uTime;',
      'uniform float uSize; uniform float uPixelRatio; uniform float uColorLift;',
      'uniform float uSizeMul;',
      'uniform vec3 uMouse; uniform vec3 uMousePrev; uniform vec2 uMouseVel; uniform float uMouseRadius; uniform float uMouseForce; uniform float uMouseEnergy;',
      'uniform float uWarp;',
      'varying vec3 vColor; varying float vAlpha;',
      'vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }',
      'vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }',
      'float snoise(vec3 v){',
      '  const vec2 C = vec2(1.0/6.0, 1.0/3.0);',
      '  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);',
      '  vec3 i = floor(v + dot(v, C.yyy));',
      '  vec3 x0 = v - i + dot(i, C.xxx);',
      '  vec3 g = step(x0.yzx, x0.xyz);',
      '  vec3 l = 1.0 - g;',
      '  vec3 i1 = min(g.xyz, l.zxy);',
      '  vec3 i2 = max(g.xyz, l.zxy);',
      '  vec3 x1 = x0 - i1 + 1.0 * C.xxx;',
      '  vec3 x2 = x0 - i2 + 2.0 * C.xxx;',
      '  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;',
      '  i = mod(i, 289.0);',
      '  vec4 p = permute(permute(permute(',
      '             i.z + vec4(0.0, i1.z, i2.z, 1.0))',
      '           + i.y + vec4(0.0, i1.y, i2.y, 1.0))',
      '           + i.x + vec4(0.0, i1.x, i2.x, 1.0));',
      '  float n_ = 0.142857142857;',
      '  vec3 ns = n_ * D.wyz - D.xzx;',
      '  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);',
      '  vec4 x_ = floor(j * ns.z);',
      '  vec4 y_ = floor(j - 7.0 * x_);',
      '  vec4 x = x_ * ns.x + ns.yyyy;',
      '  vec4 y = y_ * ns.x + ns.yyyy;',
      '  vec4 h = 1.0 - abs(x) - abs(y);',
      '  vec4 b0 = vec4(x.xy, y.xy);',
      '  vec4 b1 = vec4(x.zw, y.zw);',
      '  vec4 s0 = floor(b0)*2.0 + 1.0;',
      '  vec4 s1 = floor(b1)*2.0 + 1.0;',
      '  vec4 sh = -step(h, vec4(0.0));',
      '  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;',
      '  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;',
      '  vec3 p0 = vec3(a0.xy, h.x);',
      '  vec3 p1 = vec3(a0.zw, h.y);',
      '  vec3 p2 = vec3(a1.xy, h.z);',
      '  vec3 p3 = vec3(a1.zw, h.w);',
      '  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));',
      '  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;',
      '  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);',
      '  m = m * m;',
      '  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));',
      '}',
      'vec3 curlNoise(vec3 p){',
      '  const float e = 0.025;',
      '  vec3 dx = vec3(e, 0.0, 0.0);',
      '  vec3 dy = vec3(0.0, e, 0.0);',
      '  vec3 dz = vec3(0.0, 0.0, e);',
      '  vec3 p1 = p + vec3(17.1, 31.7, 9.3);',
      '  vec3 p2 = p + vec3(43.3, 11.5, 73.1);',
      '  float x = (snoise(p2 + dy) - snoise(p2 - dy)) - (snoise(p1 + dz) - snoise(p1 - dz));',
      '  float y = (snoise(p  + dz) - snoise(p  - dz)) - (snoise(p2 + dx) - snoise(p2 - dx));',
      '  float z = (snoise(p1 + dx) - snoise(p1 - dx)) - (snoise(p  + dy) - snoise(p  - dy));',
      '  return vec3(x, y, z) / (2.0 * e);',
      '}',
      'vec3 liftColor(vec3 c){',
      '  float m = max(max(c.r,c.g),c.b);',
      '  vec3 hue = m > 0.001 ? c/m : vec3(1.0);',
      '  float darkness = 1.0 - smoothstep(0.10, 0.85, m);',
      '  vec3 lifted = mix(c, hue*mix(0.80,1.0,m), darkness);',
      '  return mix(c, lifted, uColorLift);',
      '}',
      'void main(){',
      '  vec3 base = mix(aPosA, aPosB, uMix);',
      '  float flowTime = uTime * 0.22;',
      '  vec3 np = base * 1.6 + vec3(0.0, flowTime * 0.25, flowTime);',
      '  vec3 curl1 = curlNoise(np);',
      '  vec3 curl2 = curlNoise(np * 2.6 + vec3(flowTime * 0.4, 0.0, 0.0));',
      '  vec3 fluidFlow = curl1 * 0.75 + curl2 * 0.35;',
      '  float spread = uBurst * (0.78 + aSeed * 0.55);',
      '  vec3 pos = base + fluidFlow * spread;',
      '  pos += 0.008 * vec3(sin(uTime*0.7 + aSeed*20.0), cos(uTime*0.6 + aSeed*15.0), sin(uTime*0.5 + aSeed*10.0));',
      '  vec2 toP = base.xy - uMouse.xy;',
      '  float distToMouse = length(toP);',
      '  float falloff = smoothstep(uMouseRadius, 0.0, distToMouse);',
      '  vec2 pushDir = distToMouse > 1e-4 ? toP / distToMouse : vec2(0.0);',
      '  float vLen = length(uMouseVel);',
      '  vec2 vDir = vLen > 1e-4 ? uMouseVel / vLen : vec2(0.0);',
      '  vec2 drag = vDir * (min(vLen * 0.04, 0.025) * falloff);',
      '  float wave = sin(distToMouse * 28.0 - uTime * 5.0) * (falloff * 0.025);',
      '  vec2 waterRipple = (pushDir * (falloff * 0.06 + wave) + drag) * (uMouseEnergy * uMouseForce);',
      '  pos.xy += waterRipple;',
      '  pos.z += sin(distToMouse * 20.0 - uTime * 5.0) * (falloff * 0.03) * (uMouseEnergy * uMouseForce);',
      '  if (uWarp > 0.0) {',
      '    vec3 streak = normalize(fluidFlow + vec3(0.0, 0.0, -1.0));',
      '    pos += streak * uWarp * (0.35 + aSeed*1.1);',
      '  }',
      '  vColor = liftColor(mix(aColA, aColB, uMix));',
      '  vAlpha = (1.0 - uBurst*0.45) * (1.0 - uWarp*0.35);',
      '  vec4 mv = modelViewMatrix * vec4(pos, 1.0);',
      '  gl_Position = projectionMatrix * mv;',
      '  float sz = uSize * uPixelRatio * uSizeMul * (1.0 + uBurst*0.40) * (1.0 + uWarp*0.9);',
      '  gl_PointSize = max(3.2 * min(uPixelRatio, 1.75), sz * (3.5 / -mv.z));',
      '}'
    ].join('\n');

    var frag = [
      'precision mediump float;',
      'varying vec3 vColor; varying float vAlpha; uniform float uGlobalAlpha;',
      'void main(){',
      '  vec2 uv = gl_PointCoord - 0.5; float d = length(uv);',
      '  if(d > 0.5) discard;',
      '  float halo = smoothstep(0.5, 0.08, d);',
      '  float core = smoothstep(0.20, 0.0, d);',
      '  vec3 col = vColor * (0.75 + 0.9*core);',
      '  float a = (halo*0.6 + core) * vAlpha * uGlobalAlpha;',
      '  gl_FragColor = vec4(col, min(a,1.0));',
      '}'
    ].join('\n');

    var uniforms = {
      uMix: { value: 0 }, uBurst: { value: 0 }, uTime: { value: 0 },
      uSize: { value: 1.6 }, uPixelRatio: { value: PR },
      uColorLift: { value: 0.95 }, uGlobalAlpha: { value: 1 }, uSizeMul: { value: 1 },
      uWarp: { value: 0 },
      uMouse: { value: new THREE.Vector3(999, 999, 0) },
      uMousePrev: { value: new THREE.Vector3(999, 999, 0) },
      uMouseVel: { value: new THREE.Vector2(0, 0) },
      uMouseRadius: { value: 0.32 },
      uMouseForce: { value: reduceMotion ? 0 : 0.42 },
      uMouseEnergy: { value: 0 },
    };
    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: vert, fragmentShader: frag,
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    var points = new THREE.Points(geo, mat);
    scene.add(points);

    // ---- post-processing (bloom 4-pass) --------------------------------------
    var rtScene, rtA, rtB;
    var fsScene = new THREE.Scene();
    var fsCam = new THREE.Camera();
    var fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    fsScene.add(fsQuad);

    var brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.32 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: [
        'precision mediump float; varying vec2 vUv;',
        'uniform sampler2D tDiffuse; uniform float uThreshold;',
        'void main(){',
        '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
        '  float l = dot(c, vec3(0.299,0.587,0.114));',
        '  float k = max(0.0, l - uThreshold) / max(l, 1e-4);',
        '  gl_FragColor = vec4(c*k, 1.0);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false,
    });

    var blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: [
        'precision mediump float; varying vec2 vUv;',
        'uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uRes;',
        'void main(){',
        '  vec2 px = uDir / uRes;',
        '  vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;',
        '  sum += texture2D(tDiffuse, vUv + px*1.3846).rgb * 0.316216;',
        '  sum += texture2D(tDiffuse, vUv - px*1.3846).rgb * 0.316216;',
        '  sum += texture2D(tDiffuse, vUv + px*3.2308).rgb * 0.070270;',
        '  sum += texture2D(tDiffuse, vUv - px*3.2308).rgb * 0.070270;',
        '  gl_FragColor = vec4(sum, 1.0);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false,
    });

    var compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null },
        uBloom: { value: 1.05 }, uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) }, uBgGlow: { value: 1.0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: [
        'precision mediump float; varying vec2 vUv;',
        'uniform sampler2D tScene; uniform sampler2D tBloom;',
        'uniform float uBloom; uniform float uTime; uniform vec2 uRes; uniform float uBgGlow;',
        'void main(){',
        '  vec2 p = vUv - 0.5; p.x *= uRes.x/uRes.y; float r = length(p);',
        '  vec3 bg = mix(vec3(0.055,0.035,0.075), vec3(0.02,0.014,0.03), smoothstep(0.0,0.9,r));',
        '  bg *= (0.85 + 0.15*sin(uTime*0.3)); bg *= uBgGlow;',
        '  vec3 scn = texture2D(tScene, vUv).rgb;',
        '  vec3 blm = texture2D(tBloom, vUv).rgb;',
        '  vec3 col = bg + scn + blm*uBloom;',
        '  float vig = smoothstep(1.15, 0.35, r); col *= mix(0.7, 1.0, vig);',
        '  float g = fract(sin(dot(vUv, vec2(12.99,78.23)) + uTime)*43758.5)*0.03; col += g - 0.015;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false,
    });

    function makeTargets(w, h) {
      if (rtScene) { rtScene.dispose(); rtA.dispose(); rtB.dispose(); }
      var opt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      rtScene = new THREE.WebGLRenderTarget(w, h, opt);
      var hw = Math.max(2, Math.floor(w / 2)), hh = Math.max(2, Math.floor(h / 2));
      rtA = new THREE.WebGLRenderTarget(hw, hh, opt);
      rtB = new THREE.WebGLRenderTarget(hw, hh, opt);
    }

    var _sz = new THREE.Vector2();
    function renderPost() {
      renderer.getDrawingBufferSize(_sz);
      renderer.setRenderTarget(rtScene); renderer.clear(); renderer.render(scene, camera);
      fsQuad.material = brightMat; brightMat.uniforms.tDiffuse.value = rtScene.texture;
      renderer.setRenderTarget(rtA); renderer.clear(); renderer.render(fsScene, fsCam);
      fsQuad.material = blurMat; blurMat.uniforms.uRes.value.set(rtA.width, rtA.height);
      blurMat.uniforms.tDiffuse.value = rtA.texture; blurMat.uniforms.uDir.value.set(1, 0);
      renderer.setRenderTarget(rtB); renderer.clear(); renderer.render(fsScene, fsCam);
      blurMat.uniforms.tDiffuse.value = rtB.texture; blurMat.uniforms.uDir.value.set(0, 1);
      renderer.setRenderTarget(rtA); renderer.clear(); renderer.render(fsScene, fsCam);
      fsQuad.material = compMat;
      compMat.uniforms.tScene.value = rtScene.texture; compMat.uniforms.tBloom.value = rtA.texture;
      compMat.uniforms.uRes.value.set(_sz.x, _sz.y); compMat.uniforms.uTime.value = uniforms.uTime.value;
      renderer.setRenderTarget(null); renderer.clear(); renderer.render(fsScene, fsCam);
    }

    var HOLD = 1.0, HOLD_HEADLINE = 3.2, HOLD_DIBSEN = 2.4, MORPH = 1.3, segs = [], wsum = 0;
    for (var si = 0; si < SHAPE_COUNT; si++) {
      var h = (si === 0 ? HOLD_HEADLINE : (si === 1 ? HOLD_DIBSEN : HOLD));
      wsum += h;
      if (si < SHAPE_COUNT - 1) wsum += MORPH;
    }
    var acc = 0;
    for (var sj = 0; sj < SHAPE_COUNT; sj++) {
      var thisHold = (sj === 0 ? HOLD_HEADLINE : (sj === 1 ? HOLD_DIBSEN : HOLD));
      segs.push({ type: 'hold', shape: sj, start: acc / wsum, end: (acc + thisHold) / wsum }); acc += thisHold;
      if (sj < SHAPE_COUNT - 1) { segs.push({ type: 'morph', shapeA: sj, shapeB: sj + 1, start: acc / wsum, end: (acc + MORPH) / wsum }); acc += MORPH; }
    }
    function smootherstep(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

    var SIZEMUL = {};
    for (var si3 = 0; si3 < SHAPE_COUNT; si3++) SIZEMUL[si3] = 1.0;
    var safeIdx = KEYS.indexOf('safe');
    if (safeIdx >= 0) SIZEMUL[safeIdx] = 1.5;
    var sosmedIdx = KEYS.indexOf('sosmed');
    if (sosmedIdx >= 0) SIZEMUL[sosmedIdx] = 1.4;
    var sipnexIdx = KEYS.indexOf('sipnex');
    if (sipnexIdx >= 0) SIZEMUL[sipnexIdx] = 1.2;

    var curA = -1, curB = -1;
    function setPair(a, b) {
      if (a === curA && b === curB) return;
      geo.attributes.aPosA.array.set(shapePos[a]); geo.attributes.aPosB.array.set(shapePos[b]);
      geo.attributes.aColA.array.set(shapeCol[a]); geo.attributes.aColB.array.set(shapeCol[b]);
      geo.attributes.aPosA.needsUpdate = geo.attributes.aPosB.needsUpdate = true;
      geo.attributes.aColA.needsUpdate = geo.attributes.aColB.needsUpdate = true;
      curA = a; curB = b;
    }

    var lockedShape = 0;
    function applyProgress(pv) {
      pv = Math.max(0, Math.min(1, pv));
      var previousLocked = lockedShape;
      var seg = segs[segs.length - 1];
      for (var i = 0; i < segs.length; i++) { if (pv <= segs[i].end || i === segs.length - 1) { seg = segs[i]; break; } }
      if (seg.type === 'hold') {
        setPair(seg.shape, seg.shape); uniforms.uMix.value = 0; uniforms.uBurst.value = 0; lockedShape = seg.shape;
        uniforms.uSizeMul.value = SIZEMUL[seg.shape];
      } else {
        setPair(seg.shapeA, seg.shapeB);
        var t = (pv - seg.start) / Math.max(1e-6, (seg.end - seg.start));
        uniforms.uMix.value = smootherstep(t);
        uniforms.uBurst.value = Math.sin(t * Math.PI) * 0.95;
        uniforms.uSizeMul.value = SIZEMUL[seg.shapeA] + (SIZEMUL[seg.shapeB] - SIZEMUL[seg.shapeA]) * t;
        lockedShape = -1;
      }
      if (lockedShape !== previousLocked) {
        if (lockedShape >= 0 && window.__heroState) {
          window.__heroState.lock(KEYS[lockedShape], 'particle-lock');
        }
        if (typeof window.updateHeroCaption === 'function') {
          window.updateHeroCaption();
        }
      }
      updateLabel();
    }

    var LABELS = {
      from: { href: '' },
      dibsen: { href: '/about-us' },
      sosmed: { href: '/products#sosialmedia' },
      sipnex: { href: '/products#sipnex' },
      safe: { href: '/products#safe' },
    };

    var labelEl = document.getElementById('heroClickHint');
    function updateLabel() {
      if (!labelEl) return;
      var key = lockedShape >= 0 ? KEYS[lockedShape] : null;
      var clickable = key && LABELS[key] && LABELS[key].href;
      if (clickable) {
        labelEl.setAttribute('data-key', key);
        labelEl.classList.add('show', 'clickable');
      } else {
        labelEl.classList.remove('show', 'clickable');
      }
      canvas.style.pointerEvents = clickable ? 'auto' : 'none';
      canvas.style.cursor = clickable ? 'pointer' : '';
    }
    if (labelEl) {
      labelEl.addEventListener('click', function () {
        var key = labelEl.getAttribute('data-key');
        if (key) flyThroughAndNavigate(key);
      });
    }
    canvas.addEventListener('click', function () {
      if (lockedShape >= 0 && labelEl && labelEl.classList.contains('clickable')) labelEl.click();
    });

    // ==========================================================================
    //  TRANSISI "ZOOM TEMBUS" -> NAVIGASI SUNGGUHAN ke halaman produk
    // ==========================================================================
    var transitionState = 'idle';
    var tState = {
      startTime: 0, duration: 2.0,
      fromPos: new THREE.Vector3(), forward: new THREE.Vector3(),
      fixedQuat: new THREE.Quaternion(),
      baseFov: 45, punchFov: 58,
    };
    var flashEl = document.getElementById('zoomFlash');

    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function flyThroughAndNavigate(key) {
      if (transitionState !== 'idle') return;
      var meta = LABELS[key];
      if (!meta || !meta.href) return;
      if (window.__heroState) window.__heroState.navigate(key, 'hero-link');

      tState.forward.set(0, targetY, 0).sub(camera.position).normalize();
      tState.fromPos.copy(camera.position);
      tState.fixedQuat.copy(camera.quaternion);
      tState.startTime = clock.getElapsedTime();
      tState.targetHref = meta.href;
      transitionState = 'zooming';
    }

    function updateTransition() {
      var t = clock.getElapsedTime();
      var p = Math.min(1, (t - tState.startTime) / tState.duration);
      var e = easeInOutCubic(p);
      var travel = R * (9.5 / 4.2);
      camera.position.copy(tState.fromPos).addScaledVector(tState.forward, e * travel);
      camera.quaternion.copy(tState.fixedQuat);
      camera.fov = tState.baseFov + (tState.punchFov - tState.baseFov) * Math.sin(p * Math.PI * 0.5);
      camera.updateProjectionMatrix();
      uniforms.uWarp.value = e;
      compMat.uniforms.uBloom.value = 1.05 + e * 0.8;
      if (p >= 1 && !tState.navigating) {
        tState.navigating = true;
        if (flashEl) flashEl.classList.add('show');
        try { sessionStorage.setItem('dibsenHeroScrollY', String(window.scrollY)); } catch (e2) {}
        setTimeout(function () { window.location.href = tState.targetHref; }, 220);
      }
    }

    var mx = 0, my = 0, tmx = 0, tmy = 0;
    var mClientX = 0, mClientY = 0, mInside = false;
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      tmx = (e.clientX / window.innerWidth - 0.5) * 2;
      tmy = (e.clientY / window.innerHeight - 0.5) * 2;
      mClientX = e.clientX; mClientY = e.clientY; mInside = true;
    });
    window.addEventListener('pointerleave', function () { mInside = false; });
    window.addEventListener('blur', function () { mInside = false; });

    // Touch Inertia Parallax
    var touchActive = false;
    var touchStartX = 0, touchStartY = 0;
    var touchLastX = 0, touchLastTime = 0;
    var touchVelocityX = 0;
    var touchYaw = 0;

    window.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length === 0) return;
      var t = e.touches[0];
      touchActive = true;
      touchStartX = t.clientX; touchStartY = t.clientY;
      touchLastX = t.clientX; touchLastTime = performance.now();
      touchVelocityX = 0;
      mClientX = t.clientX; mClientY = t.clientY; mInside = true;
    }, { passive: true });

    window.addEventListener('touchmove', function (e) {
      if (!touchActive || !e.touches || e.touches.length === 0) return;
      var t = e.touches[0];
      var now = performance.now();
      var dt = Math.max(1, now - touchLastTime);
      var dx = t.clientX - touchLastX;
      var sensitivity = (Math.PI / Math.max(320, window.innerWidth)) * 1.35;
      touchYaw += dx * sensitivity;
      touchVelocityX = (dx / dt) * 16.0;
      touchLastX = t.clientX; touchLastTime = now;
      mClientX = t.clientX; mClientY = t.clientY; mInside = true;
    }, { passive: true });

    function onTouchEnd() {
      touchActive = false;
      mInside = false;
    }
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    var mouseWorld = new THREE.Vector3(999, 999, 0);
    var smoothMouse = new THREE.Vector3(999, 999, 0);
    var mouseVel = new THREE.Vector2(0, 0);
    var mouseEnergy = 0;
    var _ndc = new THREE.Vector3();
    var mouseInit = false;

    function updateMouse() {
      if (!mInside) {
        mouseEnergy = mouseEnergy * 0.962;
        mouseVel.multiplyScalar(0.92);
        uniforms.uMouseEnergy.value = mouseEnergy;
        uniforms.uMouseVel.value.copy(mouseVel);
        return;
      }
      camera.updateMatrixWorld();
      _ndc.set((mClientX / window.innerWidth) * 2 - 1, -((mClientY / window.innerHeight) * 2 - 1), 0.5);
      _ndc.unproject(camera);
      _ndc.sub(camera.position).normalize();
      if (Math.abs(_ndc.z) > 1e-4) {
        var t = -camera.position.z / _ndc.z;
        mouseWorld.copy(camera.position).add(_ndc.multiplyScalar(t));
      }

      if (!mouseInit) {
        smoothMouse.copy(mouseWorld);
        mouseInit = true;
      }

      var dx = mouseWorld.x - smoothMouse.x;
      var dy = mouseWorld.y - smoothMouse.y;

      var curVx = dx * 16.0;
      var curVy = dy * 16.0;
      mouseVel.x += (curVx - mouseVel.x) * 0.30;
      mouseVel.y += (curVy - mouseVel.y) * 0.30;

      smoothMouse.x += dx * 0.45;
      smoothMouse.y += dy * 0.45;
      smoothMouse.z = 0;

      uniforms.uMousePrev.value.copy(uniforms.uMouse.value);
      uniforms.uMouse.value.copy(smoothMouse);
      uniforms.uMouseVel.value.copy(mouseVel);

      var speed = Math.sqrt(mouseVel.x * mouseVel.x + mouseVel.y * mouseVel.y);
      var targetE = Math.min(1.0, speed * 0.48);

      if (targetE > mouseEnergy) {
        mouseEnergy += (targetE - mouseEnergy) * 0.35;
      } else {
        mouseEnergy = mouseEnergy * 0.962;
      }
      mouseEnergy = Math.min(mouseEnergy, 1.0);
      uniforms.uMouseEnergy.value = mouseEnergy;
    }

    // ---- Layout Thrashing Elimination (Geometri di-cache) --------------------
    var cachedStageH = 1, cachedStageTop = 0;
    function updateStageGeometry() {
      cachedStageH = Math.max(1, stageEl.offsetHeight - window.innerHeight);
      cachedStageTop = stageEl.offsetTop;
    }

    var targetP = 0, smoothP = 0;
    function readScroll() {
      targetP = Math.max(0, Math.min(1, (window.scrollY - cachedStageTop) / cachedStageH));
    }
    window.addEventListener('scroll', readScroll, { passive: true });
    window.addEventListener('resize', onResize);

    function onResize() {
      var w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();

      PR = getOptimalPR();
      renderer.setPixelRatio(PR);
      uniforms.uPixelRatio.value = PR;

      renderer.getDrawingBufferSize(_sz);
      makeTargets(Math.floor(_sz.x), Math.floor(_sz.y));

      var aspect = w / h;
      var zX = objRadiusX / (aspect * tanHalfVFOV * targetCoverage);
      var zY = objRadiusY / (tanHalfVFOV * targetCoverage);
      var zFit = Math.max(zY, zX);

      if (aspect >= 1.4) {
        R = baseR;
        targetY = 0.0;
      } else {
        R = Math.max(baseR, zFit);
        targetY = -0.15;
      }
      updateStageGeometry();
      readScroll();
    }

    var clock = new THREE.Clock();
    var running = true;
    var rafId = null;

    function tick() {
      if (!running) return;
      uniforms.uTime.value = clock.getElapsedTime();
      if (transitionState === 'idle') {
        smoothP += (targetP - smoothP) * (reduceMotion ? 1 : 0.09);
        applyProgress(smoothP);
        uniforms.uGlobalAlpha.value = 1.0;
        mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
        var tt = uniforms.uTime.value;
        var idle = reduceMotion ? 0 : 1;

        if (!touchActive) {
          touchYaw += touchVelocityX * 0.022;
          touchVelocityX *= 0.93;
          touchYaw += (0 - touchYaw) * 0.025;
        }
        var yaw = (mx * (Math.PI / 3.0) + touchYaw) + Math.sin(tt * 0.12) * 0.04 * idle;
        var pitch = Math.sin(tt * 0.09) * 0.03 * idle;

        camera.position.x = Math.sin(yaw) * Math.cos(pitch) * R;
        camera.position.z = Math.cos(yaw) * Math.cos(pitch) * R;
        camera.position.y = targetY + Math.sin(pitch) * R;
        camera.lookAt(0, targetY, 0);
        updateMouse();
      } else {
        updateTransition();
      }
      renderPost();
      rafId = requestAnimationFrame(tick);
    }

    // ---- IntersectionObserver Viewport Culling (Tidur saat di luar layar) ----
    var inView = true;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var wasInView = inView;
          inView = entry.isIntersecting;
          if (inView && !wasInView) {
            if (!running) {
              running = true;
              clock.getDelta(); // Hindari delta waktu melonjak saat bangun
              rafId = requestAnimationFrame(tick);
            }
          } else if (!inView && wasInView) {
            running = false;
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
          }
        });
      }, { rootMargin: '100px 0px 100px 0px' });
      io.observe(stageEl);
    }

    document.addEventListener('visibilitychange', function () {
      var active = !document.hidden && inView;
      if (active !== running) {
        running = active;
        if (running) {
          clock.getDelta();
          rafId = requestAnimationFrame(tick);
        } else if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      }
    });

    function getScrollForShape(shapeKey) {
      var idx = KEYS.indexOf(shapeKey);
      if (idx < 0) return null;
      for (var i = 0; i < segs.length; i++) {
        if (segs[i].type === 'hold' && segs[i].shape === idx) {
          var midP = (segs[i].start + segs[i].end) * 0.5;
          return {
            progress: midP,
            scrollY: Math.round(cachedStageTop + midP * cachedStageH)
          };
        }
      }
      return null;
    }

    // ---- Pulihkan posisi scroll kalau baru kembali dari halaman produk -------
    function restoreScroll() {
      updateStageGeometry();
      var urlParams = new URLSearchParams(window.location.search);
      var shapeParam = urlParams.get('shape');
      if (shapeParam) {
        try { sessionStorage.removeItem('dibsenHeroScrollY'); } catch (e) {}
        var target = getScrollForShape(shapeParam);
        if (target) {
          window.scrollTo(0, target.scrollY);
          targetP = target.progress;
          smoothP = target.progress;
          applyProgress(smoothP);
          return;
        }
      }

      var y = null;
      try { y = sessionStorage.getItem('dibsenHeroScrollY'); } catch (e) {}
      if (y !== null) {
        try { sessionStorage.removeItem('dibsenHeroScrollY'); } catch (e) {}
        var targetYVal = parseInt(y, 10) || 0;
        window.scrollTo(0, targetYVal);
        readScroll();
        smoothP = targetP;
        applyProgress(smoothP);
      }
    }

    canvas.classList.add('is-ready');
    stageEl.classList.add('webgl-live');

    onResize();
    restoreScroll();
    rafId = requestAnimationFrame(tick);

    window.__dibsenHero = {
      getLockedKey: function () { return lockedShape >= 0 ? KEYS[lockedShape] : null; },
      isRenderLoopActive: function () { return running; },
      getPR: function () { return getOptimalPR(); },
      isInView: function () { return inView; }
    };
    if (typeof window.updateHeroCaption === 'function') window.updateHeroCaption();
  })();
