/* ============================================================================
   DIBSEN Archipelago — the hero world.

   A procedurally sculpted Raja Ampat: limestone karst islands rising out of a
   shallow reef sea, flown through as the visitor scrolls. Nothing here is a
   downloaded model — every island, the water and the sky are generated in code
   at load, so the whole hero costs one script and no asset budget.

   WHAT THE REFERENCE PHOTOGRAPHS ACTUALLY SHOW (and what this file reproduces):
   · The silhouette is NOT a smooth dome. Karst rises in near-vertical walls
     grooved by vertical rain fluting, and rounds over only at the very top.
   · There is a hard WAVE-CUT NOTCH exactly at the waterline. That undercut is
     the single most recognisable feature of these islands — remove it and they
     read as boulders.
   · The rock is dark grey limestone, wet and algae-stained near the water,
     warmer where the sun catches it. It is NEVER the colour of a brand palette.
     Product colour belongs to the annotation layer, never to the stone.
   · Dense forest canopy sits on the top third with a ragged, noisy boundary.
   · The water is deep teal offshore and turns turquoise in the shallows that
     ring every island — that colour break is what makes the place read as reef.

   Progressive enhancement is preserved: if WebGL is missing the script exits and
   the poster/video hero underneath stays exactly as it was.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('archipelago3d');
  if (!canvas || !window.THREE) return;

  var stage = document.getElementById('stage');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var low = window.innerWidth < 900 ||
    (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !low, powerPreference: 'high-performance' });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Filmic tone mapping. Without it a linear blue-hour render crushes
  // everything not directly lit into near-black — which is exactly how the
  // first recorded pass looked: the islands became flat silhouettes. ACES
  // lifts the mid-tones and rolls highlights off instead of clipping them,
  // which is what keeps a dark scene readable.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;

  var lang = (document.documentElement.getAttribute('data-lang') === 'en') ? 'en' : 'id';

  // ---- palette -------------------------------------------------------------
  // Product accents (used ONLY by annotation, never by the rock).
  var C_TEAL = 0x3FB5AF, C_GOLD = 0xFBD800, C_ORANGE = 0xF47B1A;
  var INK = 0xF6EFF8;

  // Blue hour over the reef: dark enough to belong to this site, but the hues
  // are the real ones — teal water, mauve haze, warm low sun.
  // Sky colours measured from the dusk plate (E4), sampled in five horizontal
  // bands from horizon to zenith: #d1a27a glow, #d4b8a3 low, #887c8f mid,
  // #575474 upper, #383b5e zenith. The old zenith was noticeably darker and
  // more purple than the real thing.
  // 2026-09-04: lifted from the original measured-off-the-plate values. Those
  // were correct for the still frame, but this same trio is also the fog
  // blend target for both the sea and the island plates (see uFogColor below),
  // and at hero viewing distance fog is a large fraction of the final pixel —
  // so a dark, desaturated fog color was quietly darkening everything it
  // touched, not just the empty air. Measured before/after with the headless
  // render harness: island crop L* 25.4 -> 29-31, full-frame L* 27.5 -> ~34-35.
  var ZENITH = new THREE.Color(0x41446B);
  var HORIZON = new THREE.Color(0xBDAEB4);
  var SUNGLOW = new THREE.Color(0xF0BE94);
  var FOG = new THREE.Color(0x96859E);
  var FOG_DENSITY = 0.013;

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG.getHex(), FOG_DENSITY);
  renderer.setClearColor(ZENITH.getHex(), 1);

  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);

  // ---- deterministic value noise ------------------------------------------
  function hash3(x, y, z) {
    var n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  function noise3(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = x - xi, yf = y - yi, zf = z - zi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    function g(a, b, c) { return hash3(xi + a, yi + b, zi + c); }
    var x00 = g(0, 0, 0) + (g(1, 0, 0) - g(0, 0, 0)) * u;
    var x10 = g(0, 1, 0) + (g(1, 1, 0) - g(0, 1, 0)) * u;
    var x01 = g(0, 0, 1) + (g(1, 0, 1) - g(0, 0, 1)) * u;
    var x11 = g(0, 1, 1) + (g(1, 1, 1) - g(0, 1, 1)) * u;
    var y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }
  function fbm(x, y, z) {
    return noise3(x, y, z) * 0.6 + noise3(x * 2.3, y * 2.3, z * 2.3) * 0.27 + noise3(x * 4.9, y * 4.9, z * 4.9) * 0.13;
  }

  // ---- sky -----------------------------------------------------------------
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(320, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uZenith: { value: ZENITH }, uHorizon: { value: HORIZON }, uGlow: { value: SUNGLOW },
        tCloud: { value: loadDetail('cloud') }
      },
      vertexShader: [
        'varying vec3 vPos;',
        'void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow;',
        'uniform sampler2D tCloud;',
        'varying vec3 vPos;',
        'const float PI = 3.14159265;',
        'void main(){',
        '  vec3 dir = normalize(vPos);',
        '  float t = clamp(dir.y * 1.35 + 0.06, 0.0, 1.0);',
        '  vec3 col = mix(uHorizon, uZenith, pow(t, 0.62));',
        '  float sun = pow(max(0.0, dot(dir, normalize(vec3(-0.85, 0.10, 0.35)))), 12.0);',
        '  col += uGlow * sun * 0.42;',
        '  float band = exp(-abs(dir.y) * 11.0) * 0.13;',   // thin haze right on the horizon
        '  col += uGlow * band;',
        // Real high cloud. Cylindrical mapping: it stretches badly at the
        // zenith, which does not matter because the camera never looks up —
        // it flies just above the water and looks along the horizon.
        '  vec2 cuv = vec2(atan(dir.z, dir.x) / (2.0 * PI) * 2.6, dir.y * 1.35);',
        '  float cl = texture2D(tCloud, cuv).r - 0.5;',
        // fade the structure out into the horizon haze and up toward the zenith,
        // so it only lives in the band the eye actually reads
        '  float cw = smoothstep(0.0, 0.16, dir.y) * (1.0 - smoothstep(0.35, 0.85, dir.y));',
        '  col += (uHorizon * 0.55 + uGlow * 0.45) * cl * 1.15 * cw;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    })
  ));

  // ---- island placement ----------------------------------------------------
  // The flight path runs z = 26 - p*58. Each product island sits ~7 units beyond
  // where the camera reaches at the end of its caption window, so the camera
  // spends the whole caption approaching it rather than leaving it behind.
  var products = [
    {
      key: 'sipnex', color: C_TEAL, pos: [-7.4, 0, -8], radius: 3.1, height: 4.6,
      logo: 'assets/logos/sipnex.png', title: 'SIPNEX  ·  01',
      // NOT "BPBD Raja Ampat": SIPneX is a multi-tenant SaaS sold to companies
      // and to district/provincial government anywhere, not one agency's app.
      sub: { id: 'SaaS MULTI-TENANT · INSTANSI & PERUSAHAAN', en: 'MULTI-TENANT SaaS · GOVERNMENT & ENTERPRISE' }
    },
    {
      key: 'social', color: C_GOLD, pos: [8.2, 0, -22], radius: 3.4, height: 4.1,
      logo: 'assets/logos/sosialmedia.png', title: 'SOSMEDPLUS  ·  02',
      sub: { id: 'HEDERA · HTS + HCS · AI STUDIO', en: 'HEDERA · HTS + HCS · AI STUDIO' }
    },
    {
      key: 'safe', color: C_ORANGE, pos: [-7.8, 0, -38], radius: 2.9, height: 3.8,
      logo: 'assets/logos/safe-raja-ampat-mark.png', title: 'SAFE RAJA AMPAT  ·  03',
      sub: { id: 'OFFLINE-FIRST · 0°14′S 130°E', en: 'OFFLINE-FIRST · 0°14′S 130°E' }
    }
  ];

  // ---- islands: photographed plates, standing in real 3D space -------------
  // The sculpted karst is gone. Twelve documented iterations never arrived, and
  // the method was the ceiling, not the effort: karst is dissolution chemistry
  // over millions of years, and a radius profile plus noise does not reproduce
  // it. These are keyed cutouts of real rock (assets/plates.js) drawn as
  // camera-facing quads.
  //
  // WHY A FLAT QUAD IS ACCEPTABLE HERE, WHICH IS THE ONE THING THAT DECIDES IT
  // The camera flies down -z and looks down -z, so an island is only ever on
  // screen while it is still AHEAD. Once the camera draws level with one, it
  // leaves the frame. It is never circled and never looked back at, so the far
  // side is never owed. Rotating the quad about its vertical axis to face the
  // camera covers the bearing change during the approach; a rock reads
  // plausibly from any horizontal angle, which is why this is the standard way
  // to stand vegetation and rock in a game world.
  //
  // What survives from the sculpted version: they are still objects in the
  // scene, so they scale, occlude and fog correctly; and they are still
  // raycast, so hover and click still work — alpha-tested against the plate, so
  // only the rock itself is clickable and not its transparent corners.
  var PLATES = window.DIBSEN_PLATES || {};
  var usePlates = !!(PLATES.tower && PLATES.dome && PLATES.blade);

  var plateTex = {}, plateAlpha = {};
  function plateTexture(kind) {
    if (!plateTex[kind]) {
      var t = new THREE.TextureLoader().load(PLATES[kind].src);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      plateTex[kind] = t;
    }
    return plateTex[kind];
  }
  // A small alpha lookup so a click on a transparent corner is not a click on
  // the island. Read once per plate off a canvas; the source is a data: URI so
  // nothing here taints, which also keeps it working over file://.
  function loadPlateAlpha(kind) {
    var img = new Image();
    img.onload = function () {
      var W = 96, H = Math.max(8, Math.round(96 / PLATES[kind].aspect));
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var cx = cv.getContext('2d');
      if (!cx) return;
      cx.drawImage(img, 0, 0, W, H);
      try {
        var d = cx.getImageData(0, 0, W, H).data;
        var arr = new Uint8Array(W * H);
        for (var i = 0; i < W * H; i++) arr[i] = d[i * 4 + 3];
        plateAlpha[kind] = { w: W, h: H, a: arr };
      } catch (e) { /* no lookup: hover falls back to the whole quad */ }
    };
    img.src = PLATES[kind].src;
  }
  var plateAlphaViews = {};   // kind -> one lookup per atlas view
  function alphaAt(kind, uv, viewIdx) {
    var L = plateAlpha[kind];
    var VL = plateAlphaViews[kind];
    if (VL && typeof viewIdx === 'number') {
      L = VL[Math.min(VL.length - 1, Math.max(0, Math.round(viewIdx)))] || L;
    }
    if (!L || !uv) return 1;
    var px = Math.min(L.w - 1, Math.max(0, Math.floor(uv.x * L.w)));
    var py = Math.min(L.h - 1, Math.max(0, Math.floor((1 - uv.y) * L.h)));
    return L.a[py * L.w + px] / 255;
  }

  function plateMaterial(kind) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: true, side: THREE.DoubleSide,
      uniforms: {
        tPlate: { value: plateTexture(kind) },
        uTint: { value: new THREE.Color(0xffffff) },
        uGlow: { value: 0 },
        // View atlas. With uTiles = 1 the UV maths below collapses to the
        // identity, so a single flat plate and a 13-view turntable strip run
        // through exactly the same shader — the upgrade is a uniform change,
        // not a second code path that can drift out of step with this one.
        uTiles: { value: 1 }, uIdxA: { value: 0 }, uIdxB: { value: 0 },
        uCols: { value: 1 }, uRows: { value: 1 },
        uTilePx: { value: new THREE.Vector2(1, 1) },
        uMix: { value: 0 },
        uFogColor: { value: FOG }, uFogDensity: { value: FOG_DENSITY }
      },
      vertexShader: [
        'varying vec2 vUv; varying vec3 vView;',
        'void main(){',
        '  vUv = uv;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vView = mv.xyz;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D tPlate; uniform vec3 uTint; uniform float uGlow;',
        'uniform float uTiles; uniform float uIdxA; uniform float uIdxB; uniform float uMix;',
        'uniform float uCols; uniform float uRows; uniform vec2 uTilePx;',
        'uniform vec3 uFogColor; uniform float uFogDensity;',
        'varying vec2 vUv; varying vec3 vView;',
        // The atlas is one vertical strip, view 0 at the top of the image, and
        // Three flips Y on upload — so view i lives at v = (N-i-1+y)/N.
        'vec4 tile(float i){',
        // The atlas is a grid of views, row 0 at the top, and Three flips Y on
        // upload — so view i sits at column mod(i,cols), row floor(i/cols).
        // Inset by half a texel first: without it bilinear filtering at a tile's
        // border reaches into its neighbour and prints a seam across the rock.
        '  vec2 ins = (uCols > 1.5 || uRows > 1.5) ? 0.5 / max(uTilePx, vec2(2.0)) : vec2(0.0);',
        '  float x = clamp(vUv.x, ins.x, 1.0 - ins.x);',
        '  float y = clamp(vUv.y, ins.y, 1.0 - ins.y);',
        '  float c = mod(i, uCols);',
        '  float r = floor(i / uCols);',
        '  return texture2D(tPlate, vec2((c + x) / uCols,',
        '                                (uRows - r - 1.0 + y) / uRows));',
        '}',
        'void main(){',
        // Crossfading two views naively puts a ghost rectangle around the rock:
        // a pixel solid in one view and empty in the next lands at half alpha
        // and survives the cut. So the SILHOUETTE is taken from the nearer view
        // only — neighbours differ by a few percent of width, so the snap is
        // invisible — while the surface dissolves across the pair, where the
        // change is large and a snap would read as a glitch.
        '  vec4 a = tile(uIdxA);',
        '  vec4 t = a;',
        '  if (uMix > 0.001) {',
        '    vec4 b = tile(uIdxB);',
        '    t.a = uMix < 0.5 ? a.a : b.a;',
        // premultiplied, so a transparent neighbour cannot drag the colour dark
        '    float w = mix(a.a, b.a, uMix);',
        '    t.rgb = mix(a.rgb * a.a, b.rgb * b.a, uMix) / max(w, 0.001);',
        '  }',
        '  if (t.a < 0.30) discard;',
        // dusk rock, fogged further by the scene: a small lift keeps the
        // plates reading as stone instead of collapsing to silhouette
        '  vec3 col = t.rgb * 1.6 + uTint * uGlow;',
        // the quad is transparent, so scene fog cannot reach it — apply the
        // same exp2 curve by hand or the islands float free of the air
        '  float d = length(vView);',
        '  float f = 1.0 - exp(-pow(d * uFogDensity, 2.0));',
        '  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));',
        '  gl_FragColor = vec4(col, t.a);',
        '}'
      ].join('\n')
    });
  }

  // ---- view atlases: the island answers the camera --------------------------
  // A flat plate always presents the same face, so as the camera sweeps past it
  // the island reads as a sticker on a stick. A view atlas is a turntable render
  // sampled at even angular steps; choosing the view that matches the camera's
  // bearing gives the island a real far side.
  //
  // Loaded as an ordinary image rather than inlined as base64: the hero paints
  // immediately on the flat plate and sharpens into the atlas when it arrives,
  // and over file:// — where the fetch is blocked — it simply stays flat.
  var VIEWS = window.DIBSEN_VIEWS || {};
  var viewMeshes = [];

  // Debug hook for the offline render harness: reports which view each atlas
  // island is showing, so the parallax can be verified by number and not by eye.
  window.__dbView = function () {
    return viewMeshes.map(function (m) {
      return { kind: m.userData.kind,
               x: Math.round(m.position.x * 10) / 10, z: Math.round(m.position.z * 10) / 10,
               view: Math.round(m.userData.viewIdx * 100) / 100,
               used: Math.round(m.userData.view.map.used),
               off: Math.round(m.userData.view.map.offset),
               first: Math.round(m.userData.view.map.first),
               halfW: Math.round(m.userData.halfWidth * 100) / 100,
               screen: (function () {
                 var v = new THREE.Vector3(m.position.x, m.position.y, m.position.z);
                 v.project(camera);
                 return [Math.round((v.x * 0.5 + 0.5) * renderer.domElement.clientWidth),
                         Math.round((-v.y * 0.5 + 0.5) * renderer.domElement.clientHeight),
                         Math.round(m.userData.halfWidth * 100) / 100];
               })() };
    });
  };


  // How far the island's bearing actually swings across the whole scroll,
  // measured off the camera path itself rather than guessed, so the atlas can
  // be centred on the range that gets used and never clamps at either end.
  function viewAzimuthMap(x, z, span) {
    var t = new THREE.Vector3(), prev = null, acc = 0, first = 0, lo = 0, hi = 0;
    for (var i = 0; i <= 60; i++) {
      pathAt(i / 60, t);
      var a = Math.atan2(t.x - x, t.z - z) * 180 / Math.PI;
      if (prev === null) { first = a; }
      else {
        var d = a - prev;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        acc += d;
      }
      prev = a;
      if (acc < lo) lo = acc;
      if (acc > hi) hi = acc;
    }
    var pad = Math.max(0, (span - (hi - lo)) * 0.5);
    return { first: first, offset: pad - lo, span: span, used: hi - lo };
  }

  function upgradeToAtlas(mesh, kind) {
    var V = VIEWS[kind];
    if (!V || !mesh || !mesh.material || !mesh.material.uniforms) return;
    // Over file:// an image loaded from disk counts as cross-origin, and handing
    // it to WebGL throws at upload time rather than at load time — too late to
    // catch cleanly. So the atlas is skipped there by design: local testing sees
    // the flat plate, a served site sees the turntable. Run `serve.bat` in the
    // site folder to test this locally.
    if (location.protocol === 'file:') return;
    var img = new Image();
    img.onload = function () {
      try {
      var tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter = THREE.LinearFilter;   // one strip: mipmaps would bleed
      tex.magFilter = THREE.LinearFilter;   // neighbouring views into each other
      tex.generateMipmaps = false;
      tex.needsUpdate = true;

      var u = mesh.material.uniforms;
      u.tPlate.value = tex;
      u.uTiles.value = V.views;
      u.uCols.value = V.cols || 1;
      u.uRows.value = V.rows || V.views;
      u.uTilePx.value.set(V.w, V.h);

      // The rock is a different shape from every angle, so the quad is sized to
      // hold the widest view. Keeping the quad's AREA equal to the flat plate's
      // is what stops the island jumping in visual weight at the moment the
      // atlas lands.
      var h0 = mesh.userData.plateH, ar0 = mesh.userData.plateAR;
      var h1 = h0 * Math.sqrt(ar0 / V.aspect), w1 = h1 * V.aspect;
      mesh.geometry.dispose();
      mesh.geometry = new THREE.PlaneGeometry(w1, h1);
      mesh.position.y = h1 * 0.5 - h1 * 0.115;
      mesh.userData.atlasW = w1;
      // Everything hung off this island — the camera's aim point, the label
      // leader, the bracket's height — was measured against the flat plate.
      // The rock is taller now, so those move with it.
      var pr0 = mesh.userData.product;
      if (pr0) { pr0.height = h1; pr0.bracketH = h1 * 0.80; }

      mesh.userData.view = {
        n: V.views, step: V.step, solid: V.solid || null, dir: 1,
        map: viewAzimuthMap(mesh.position.x, mesh.position.z, (V.views - 1) * V.step)
      };
      viewMeshes.push(mesh);

      // Rebuild the hover lookup per view, or a click on the narrow edge-on
      // view would still be tested against the broad face's silhouette.
      try {
        var CO = V.cols || 1, RO = V.rows || V.views;
        var W = 72, H = Math.max(8, Math.round(72 / V.aspect));
        var cv = document.createElement('canvas');
        cv.width = W * CO; cv.height = H * RO;
        var cx = cv.getContext('2d');
        if (cx) {
          cx.drawImage(img, 0, 0, W * CO, H * RO);
          var d = cx.getImageData(0, 0, W * CO, H * RO).data;
          var list = [];
          for (var v = 0; v < V.views; v++) {
            var c0 = (v % CO) * W, r0 = Math.floor(v / CO) * H;
            var arr = new Uint8Array(W * H);
            for (var yy = 0; yy < H; yy++) {
              for (var xx = 0; xx < W; xx++) {
                arr[yy * W + xx] = d[(((r0 + yy) * W * CO) + c0 + xx) * 4 + 3];
              }
            }
            list.push({ w: W, h: H, a: arr });
          }
          plateAlphaViews[kind] = list;
        }
      } catch (e) { /* cross-origin: hover keeps the flat plate's lookup */ }
      } catch (e) {
        // Anything unexpected and the island simply stays on its flat plate.
        // An upgrade must never be able to take the hero down with it.
        var uu0 = mesh.material.uniforms;
        uu0.tPlate.value = plateTexture(kind);
        uu0.uTiles.value = 1; uu0.uCols.value = 1; uu0.uRows.value = 1;
        uu0.uIdxA.value = 0; uu0.uIdxB.value = 0; uu0.uMix.value = 0;
      }
    };
    img.onerror = function () { /* stay flat; this is an upgrade, not a dependency */ };
    img.src = V.url;
  }

  // ---- fallback: the sculpted geometry, kept for when the plates are absent --
  function decodeIsland(b64) {
    if (!b64) return null;
    var bin = atob(b64), len = bin.length;
    var buf = new ArrayBuffer(len), bytes = new Uint8Array(buf);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== 'DBSI') return null;
    var dv = new DataView(buf);
    var nv = dv.getUint32(4, true), nt = dv.getUint32(8, true);
    var lo = [dv.getFloat32(12, true), dv.getFloat32(16, true), dv.getFloat32(20, true)];
    var ext = [dv.getFloat32(24, true), dv.getFloat32(28, true), dv.getFloat32(32, true)];
    var o = 36;
    var pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    for (var v = 0; v < nv; v++) {
      var bx = lo[0] + dv.getUint16(o + v * 6, true) / 65535 * ext[0];
      var by = lo[1] + dv.getUint16(o + v * 6 + 2, true) / 65535 * ext[1];
      var bz = lo[2] + dv.getUint16(o + v * 6 + 4, true) / 65535 * ext[2];
      pos[v * 3] = bx; pos[v * 3 + 1] = bz; pos[v * 3 + 2] = -by;
    }
    o += nv * 6;
    for (var w = 0; w < nv; w++) {
      nrm[w * 3] = dv.getInt8(o + w * 3) / 127;
      nrm[w * 3 + 1] = dv.getInt8(o + w * 3 + 2) / 127;
      nrm[w * 3 + 2] = -dv.getInt8(o + w * 3 + 1) / 127;
    }
    o += nv * 3;
    for (var u = 0; u < nv; u++) {
      col[u * 3] = Math.pow(dv.getUint8(o + u * 3) / 255, 2.2);
      col[u * 3 + 1] = Math.pow(dv.getUint8(o + u * 3 + 1) / 255, 2.2);
      col[u * 3 + 2] = Math.pow(dv.getUint8(o + u * 3 + 2) / 255, 2.2);
    }
    o += nv * 3;
    var idx = new Uint16Array(nt * 3);
    for (var t2 = 0; t2 < nt * 3; t2++) idx[t2] = dv.getUint16(o + t2 * 2, true);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingBox();
    return g;
  }
  var GEO = {};
  if (!usePlates) {
    var DATA = window.DIBSEN_ISLANDS || {};
    ['sipnex', 'social', 'safe'].forEach(function (k) { GEO[k] = decodeIsland(DATA[k]); });
    if (!GEO.sipnex || !GEO.social || !GEO.safe) return;
  } else {
    ['tower', 'dome', 'blade', 'blade2', 'blade3'].filter(function (k) { return !!PLATES[k]; }).forEach(loadPlateAlpha);
  }

  var rockTex = null, pitTex = null;
  function rockDetail() { if (rockTex === null) rockTex = loadDetail('rock'); return rockTex; }
  function pitDetail() { if (pitTex === null) pitTex = loadDetail('pit'); return pitTex; }
  function islandMaterial() {
    var mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.96, metalness: 0.02
    });
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.tRock = { value: rockDetail() };
      shader.uniforms.tPit = { value: pitDetail() };
      shader.uniforms.uRockScale = { value: 0.42 };
      shader.uniforms.uRockAmt = { value: 0.34 };
      shader.uniforms.uPitScale = { value: 0.085 };
      shader.vertexShader =
        'varying vec3 vWPos;\nvarying vec3 vWNrm;\n' +
        shader.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n' +
          '  vWPos = (modelMatrix * vec4(position, 1.0)).xyz;\n' +
          '  vWNrm = normalize(mat3(modelMatrix) * normal);');
      shader.fragmentShader =
        'uniform sampler2D tRock;\nuniform sampler2D tPit;\n' +
        'uniform float uRockScale;\nuniform float uRockAmt;\nuniform float uPitScale;\n' +
        'varying vec3 vWPos;\nvarying vec3 vWNrm;\n' +
        shader.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\n' +
          '  vec3 bw = abs(vWNrm); bw /= (bw.x + bw.y + bw.z + 1e-5);\n' +
          '  float rk = texture2D(tRock, vWPos.zy * uRockScale).r * bw.x' +
          ' + texture2D(tRock, vWPos.xz * uRockScale).r * bw.y' +
          ' + texture2D(tRock, vWPos.xy * uRockScale).r * bw.z;\n' +
          '  float pk = texture2D(tPit, vWPos.zy * uPitScale).r * bw.x' +
          ' + texture2D(tPit, vWPos.xz * uPitScale).r * bw.y' +
          ' + texture2D(tPit, vWPos.xy * uPitScale).r * bw.z;\n' +
          '  rk = mix(rk, rk * 0.55 + pk * 0.45, 0.62);\n' +
          '  float grn = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * 7.0, 0.0, 1.0);\n' +
          '  diffuseColor.rgb *= 1.0 + (rk - 0.5) * 2.0 * (uRockAmt * (1.0 - grn * 0.78));');
    };
    return mat;
  }

  var islandCenters = [];   // fed to the sea shader so the shallows ring each island
  var billboards = [];      // quads that must turn to face the camera each frame

  function placeIsland(kind, x, z, targetHeight, spinY) {
    var mesh;
    if (usePlates) {
      var ar = PLATES[kind].aspect;
      var w = targetHeight * ar;
      var g = new THREE.PlaneGeometry(w, targetHeight);
      // The rock is not centred inside its own plate — the crop is a rectangle,
      // the island is not. Shifting the geometry so the alpha centroid sits on
      // the anchor is what stops the annotation bracket framing open water
      // beside the island instead of the island itself.
      var cN = PLATES[kind].centroid;
      if (typeof cN === 'number') g.translate((0.5 - cN) * w, 0, 0);
      mesh = new THREE.Mesh(g, plateMaterial(kind));
      // sink it slightly so the faded wet base meets the sea rather than
      // hovering above it
      mesh.position.set(x, targetHeight * 0.5 - targetHeight * 0.115, z);
      mesh.userData.kind = kind;
      mesh.userData.plateH = targetHeight;
      mesh.userData.plateAR = ar;
      billboards.push(mesh);
      upgradeToAtlas(mesh, kind);
      // Measured from the plate's own alpha, not from the quad: the rock does
      // not fill its rectangle, and sizing the annotation bracket off the full
      // plate is what left the bracket hanging over open water beside it.
      var solidHalf = w * 0.5 * (PLATES[kind].solid || 1);
      islandCenters.push([x, z, solidHalf]);
      mesh.userData.halfWidth = solidHalf;
    } else {
      var geo = GEO[kind === 'tower' ? 'sipnex' : kind === 'dome' ? 'social' : 'safe'];
      var bb = geo.boundingBox;
      var sc = targetHeight / Math.max(0.001, bb.max.y - bb.min.y);
      mesh = new THREE.Mesh(geo, islandMaterial());
      mesh.position.set(x, 0, z);
      mesh.scale.setScalar(sc);
      mesh.rotation.y = spinY || 0;
      var hw = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5 * sc;
      islandCenters.push([x, z, hw]);
      mesh.userData.halfWidth = hw;
    }
    return mesh;
  }

  var islandGroup = new THREE.Group();
  scene.add(islandGroup);

  var KIND = { sipnex: 'tower', social: 'dome', safe: 'blade' };
  products.forEach(function (p) {
    var mesh = placeIsland(KIND[p.key], p.pos[0], p.pos[2], p.height, p.spin || 0);
    islandGroup.add(mesh);
    p.mesh = mesh;
    p.kind = KIND[p.key];
    p.halfWidth = mesh.userData.halfWidth;
    mesh.userData.product = p;   // so the atlas can resize this island's bracket
  });

  // Scenery follows the size law measured off a real Wayag cluster (1429, 108,
  // 56, 40, 10, 1 cells): one dominant mass then a fast falloff, and islets in
  // groups rather than evenly spaced.
  var kinds = ['tower', 'dome', 'blade'];
  // Scenery used to draw every 'blade' islet off the exact same plate — 26
  // repeats of one photograph, a repetition the eye catches even unconsciously
  // (see the atlas notes). blade2/blade3 are two more keyed turntable takes of
  // the same archetype; when present, a scenery islet picks among them instead
  // of always the first. Falls back to a single-entry pool where no variant
  // exists yet, so tower/dome are unaffected.
  var VARIANT_POOLS = {
    blade: ['blade', 'blade2', 'blade3'].filter(function (k) { return !!PLATES[k]; })
  };
  function pickVariant(kind, seed) {
    var pool = VARIANT_POOLS[kind];
    if (!pool || pool.length < 2) return kind;
    var ee = hash3(seed * 6.3, 9.9, 2.7);
    return pool[Math.floor(ee * pool.length) % pool.length];
  }
  var sceneryCount = low ? 14 : 26;
  var clusters = [
    [-34, 8], [30, -12], [-46, -34], [38, -52], [-28, -76], [46, -96], [-52, -112]
  ];
  for (var s2 = 0; s2 < sceneryCount; s2++) {
    var a = hash3(s2 * 3.1, 7.7, 1.9);
    var b = hash3(s2 * 1.7, 2.3, 9.1);
    var cc = hash3(s2 * 5.9, 4.1, 3.3);
    var dd = hash3(s2 * 2.7, 8.3, 5.1);
    var cl = clusters[Math.floor(a * clusters.length) % clusters.length];
    var spread = 6 + Math.pow(b, 2.2) * 46;
    var ang = cc * Math.PI * 2;
    var xx = cl[0] + Math.cos(ang) * spread;
    var zz = cl[1] + Math.sin(ang) * spread * 0.72;
    var hgt = 1.1 + 10.0 * Math.pow(dd, 3.4);
    if (Math.abs(xx) < 13) xx += (xx < 0 ? -13 : 13);
    var clash = false;
    for (var pi = 0; pi < products.length; pi++) {
      var ddx = xx - products[pi].pos[0], ddz = zz - products[pi].pos[2];
      if (ddx * ddx + ddz * ddz < 240) { clash = true; break; }
    }
    if (clash) continue;
    var baseKind = kinds[Math.floor(a * 3) % 3];
    islandGroup.add(placeIsland(pickVariant(baseKind, s2), xx, zz, hgt, cc * Math.PI * 2));
  }

  // ---- sea -----------------------------------------------------------------
  // Shallowness is baked per-vertex at build time (distance to the nearest
  // island) rather than looped in the shader — cheaper, and it lets the reef
  // colour break follow the real island layout exactly.
  var seaSeg = low ? 110 : 190;
  var seaSize = 460;
  var seaGeo = new THREE.PlaneGeometry(seaSize, seaSize, seaSeg, seaSeg);
  (function bakeShallows() {
    var pos = seaGeo.attributes.position;
    var shallow = new Float32Array(pos.count);
    for (var i = 0; i < pos.count; i++) {
      // plane is still in XY here; it becomes XZ after the mesh is rotated
      var x = pos.array[i * 3], z = pos.array[i * 3 + 1];
      var best = 0;
      for (var k = 0; k < islandCenters.length; k++) {
        var ic = islandCenters[k];
        var d = Math.sqrt((x - ic[0]) * (x - ic[0]) + (z - ic[1]) * (z - ic[1]));
        var reef = ic[2] * 3.4;                       // reef apron scales with the island
        var t = 1 - Math.max(0, Math.min(1, (d - ic[2] * 0.85) / reef));
        if (t > best) best = t;
      }
      shallow[i] = best;
    }
    seaGeo.setAttribute('aShallow', new THREE.Float32BufferAttribute(shallow, 1));
  })();

  // Detail textures from assets/water.js. If that file is missing the fallback
  // is a flat mid-grey tile, which makes every ripple term below evaluate to
  // zero — the sea then renders exactly as it did before, never broken.
  function loadDetail(key) {
    var flat = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
    flat.needsUpdate = true;
    var src = (window.DIBSEN_WATER || {})[key];
    if (!src) return flat;
    var tex = new THREE.TextureLoader().load(src);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  var seaUniforms = {
    uTime: { value: 0 },
    tRipple: { value: loadDetail('ripple') },
    tReef: { value: loadDetail('reef') },
    // Hues measured, not guessed. Sampled from a CC BY-SA aerial of the
    // Balbulol islands, SE Misool, Raja Ampat (Wikimedia Commons), classified
    // by hue/saturation over 668,000 pixels:
    //     deep  #093657   mid  #325d78   reef  #519896   canopy #455a2f
    // The measured brightness ladder deep:mid:reef is 1 : 1.83 : 2.93, and the
    // palette already here was 1 : 1.84 : 2.88 — the STRUCTURE was right. What
    // was wrong was hue: real Raja Ampat water is markedly bluer and calmer
    // than the mint-teal that was here.
    // Only hue and saturation are carried across. Brightness is deliberately
    // NOT: the reference is midday, this scene is blue hour, so pasting the
    // photograph's luminance in would break the light the whole scene is lit by.
    // 2026-09-04: brightened ~35-40% off the original measured hex values —
    // hue/saturation kept, level raised. This was the single biggest lever in
    // the dark/purple diagnosis: water crop L* 20.9 -> 28.7 from this change
    // alone (measured via headless render, see blade-ronde-2-dan-video-stok.md).
    uDeep: { value: new THREE.Color(0x256080) },
    uMid: { value: new THREE.Color(0x59AFCB) },
    uShallow: { value: new THREE.Color(0x9EE3DC) },
    uFoam: { value: new THREE.Color(0xd8f0ee) },
    // The sea fogs toward the SKY's horizon colour, not the scene fog colour —
    // otherwise the plane's far edge stays a hard cardboard line against the
    // sky. It also fogs a little denser than the world so that edge is gone
    // before it is ever reached.
    uFogColor: { value: HORIZON },
    uFogDensity: { value: FOG_DENSITY * 1.55 },
    uSky: { value: HORIZON }
  };
  var sea = new THREE.Mesh(seaGeo, new THREE.ShaderMaterial({
    uniforms: seaUniforms,
    vertexShader: [
      'uniform float uTime;',
      'attribute float aShallow;',
      'varying float vWave;',
      'varying float vShallow;',
      'varying vec3 vView;',
      'varying vec3 vWorld;',
      'void main(){',
      '  vec3 p = position;',
      '  float w = 0.0;',
      '  w += sin(p.x * 0.10 + uTime * 0.34) * 0.55;',
      '  w += sin(p.y * 0.14 - uTime * 0.27) * 0.42;',
      '  w += sin((p.x + p.y) * 0.23 + uTime * 0.52) * 0.20;',
      '  w += sin((p.x - p.y) * 0.35 - uTime * 0.43) * 0.11;',
      '  w *= 1.0 - aShallow * 0.55;',          // the reef calms the water down
      '  p.z += w;',
      '  vWave = w; vShallow = aShallow;',
      '  vWorld = (modelMatrix * vec4(p, 1.0)).xyz;',
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
      '  vView = mv.xyz;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uShallow; uniform vec3 uFoam;',
      'uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uSky;',
      'uniform sampler2D tRipple; uniform sampler2D tReef; uniform float uTime;',
      'varying float vWave; varying float vShallow; varying vec3 vView; varying vec3 vWorld;',
      'void main(){',
      '  vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.45, vShallow));',
      '  col = mix(col, uShallow, smoothstep(0.40, 0.95, vShallow));',
      '  float crest = clamp((vWave * 0.5 + 0.5 - 0.72) * 3.4, 0.0, 1.0);',
      '  col += uFoam * crest * crest * 0.30;',
      '  col += uFoam * smoothstep(0.86, 1.0, vShallow) * 0.16;',   // surf line at the rock
      // Real ripple structure, sampled twice at different scales, directions and
      // speeds. Two layers that never line up give motion that never repeats,
      // out of a single still image — no video element, so this still works
      // over file://.
      '  vec2 wp = vWorld.xz;',
      '  float r1 = texture2D(tRipple, wp * 0.055 + vec2(uTime * 0.0090, uTime * 0.0052)).r;',
      '  float r2 = texture2D(tRipple, wp * 0.031 + vec2(-uTime * 0.0061, uTime * 0.0108)).r;',
      '  float rip = (r1 + r2) - 1.0;',
      // fade the detail out with distance or it aliases into shimmer at the horizon
      '  float near = 1.0 - smoothstep(28.0, 150.0, length(vView));',
      '  rip *= near;',
      '  col *= 1.0 + rip * 0.11;',
      '  col += uSky * max(0.0, rip) * 0.20 * (1.0 - vShallow * 0.45);',
      // coral and sand read through the shallows only
      '  float rf = texture2D(tReef, wp * 0.075).r;',
      '  col = mix(col, col * (0.84 + rf * 0.38), smoothstep(0.35, 0.92, vShallow) * near);',
      // Fresnel sky reflection. Water seen at a grazing angle is a mirror, and
      // this single term is what turns a black void into a real sea surface —
      // it is the difference between the first render and a photograph.
      '  vec3 V = normalize(cameraPosition - vWorld);',
      '  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);',
      '  col = mix(col, uSky, fres * 0.55);',
      '  float d = length(vView);',
      '  float f = 1.0 - exp(-pow(d * uFogDensity, 2.0));',
      '  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  }));
  sea.rotation.x = -Math.PI / 2;
  scene.add(sea);

  // ---- backdrop ridge -----------------------------------------------------
  // A photographed layered ridgeline, keyed to an alpha plate (assets/water.js
  // -> ridgeplate). The plate was shot as dark ridges against a flat pale sky,
  // so one luminance key carries BOTH the silhouette and the depth: haze had
  // already sorted the ridges, so the nearer a ridge is, the brighter its key.
  // That single channel then drives colour as well — high key reads as nearer
  // rock, low key washes into the sky — which is why there is no per-layer
  // hand-authoring here at all.
  //
  // This replaces the three flat strips previously built from SRTM elevation
  // over Waigeo and Batanta. That data is still loaded (assets/ridge.js) and is
  // still the fallback below if the plate is unavailable — it was honest
  // terrain, but three flat bands could not compete with eight photographed
  // ones for the thing the horizon is actually for.
  (function buildRidge() {
    var plate = (window.DIBSEN_WATER || {}).ridgeplate;
    if (plate) {
      var tex = new THREE.TextureLoader().load(plate);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      var mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false,
        uniforms: {
          tPlate: { value: tex },
          uNear: { value: new THREE.Color(0x352F4A) },
          // a shade under the sky, not equal to it: distant ridge at dusk still
          // sits fractionally darker than the air above it, and matching them
          // exactly is what made the first attempt read as fog banks
          uSky: { value: new THREE.Color(HORIZON.getHex()).multiplyScalar(0.80) }
        },
        vertexShader: [
          'varying vec2 vUv;',
          'void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
        ].join('\n'),
        fragmentShader: [
          'uniform sampler2D tPlate; uniform vec3 uNear; uniform vec3 uSky;',
          'varying vec2 vUv;',
          'void main(){',
          // Only the upper part of the plate is used. Its lower half is the big
          // near ridge, and in this scene that role already belongs to the real
          // 3D islands — keeping it too gave a wall of pale dunes behind them.
          '  float k = texture2D(tPlate, vec2(vUv.x, 0.34 + vUv.y * 0.66)).r;',
          // below the key floor is open sky, and must stay open sky
          '  float a = smoothstep(0.10, 0.17, k);',
          '  if (a < 0.01) discard;',
          // the key is depth: near ridges take rock colour, far ones wash out
          '  vec3 c = mix(uSky, uNear, smoothstep(0.12, 0.95, k));',
          '  gl_FragColor = vec4(c, a * 0.96);',
          '}'
        ].join('\n')
      });
      // Wide and low. The horizontal stretch is deliberate: real distant ranges
      // read wide and flat, and it also buys coverage as the camera drifts.
      var quad = new THREE.Mesh(new THREE.PlaneGeometry(470, 86), mat);
      quad.position.set(0, 4, -210);
      quad.renderOrder = -5;
      scene.add(quad);
      return;
    }

    // Fallback: the SRTM-built strips, kept intact for when the plate is absent.
    var R = window.DIBSEN_RIDGE;
    if (!R || !R.layers || !R.layers.length) return;
    var M_TO_UNIT = 0.024, HALF_W = 230, BASE_Y = -70;
    var depths = [-120, -168, -216], hazes = [0.52, 0.72, 0.86];
    var ridgeMat = function (haze) {
      return new THREE.ShaderMaterial({
        fog: false,
        uniforms: { uRock: { value: new THREE.Color(0x3B3552) },
                    uSky: { value: HORIZON }, uHaze: { value: haze } },
        vertexShader: [
          'varying float vY;',
          'void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uRock; uniform vec3 uSky; uniform float uHaze;',
          'varying float vY;',
          'void main(){',
          '  float lowLift = smoothstep(26.0, -10.0, vY) * 0.34;',
          '  vec3 c = mix(uRock, uSky, clamp(uHaze + lowLift, 0.0, 1.0));',
          '  gl_FragColor = vec4(c, 1.0);',
          '}'
        ].join('\n')
      });
    };
    for (var L = 0; L < R.layers.length && L < depths.length; L++) {
      var prof = R.layers[L], n = prof.length;
      if (n < 2) continue;
      var pos = new Float32Array(n * 2 * 3);
      for (var i = 0; i < n; i++) {
        var x = -HALF_W + (i / (n - 1)) * HALF_W * 2, y = prof[i] * M_TO_UNIT;
        pos[i*6] = x;     pos[i*6+1] = y;      pos[i*6+2] = 0;
        pos[i*6+3] = x;   pos[i*6+4] = BASE_Y; pos[i*6+5] = 0;
      }
      var idx = [];
      for (var q = 0; q < n - 1; q++) {
        var a2 = q*2, b2 = q*2+1, c2 = (q+1)*2, d2 = (q+1)*2+1;
        idx.push(a2, b2, c2, b2, d2, c2);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(idx);
      var strip = new THREE.Mesh(g, ridgeMat(hazes[L]));
      strip.position.z = depths[L];
      strip.renderOrder = -5;
      scene.add(strip);
    }
  })();

  // ---- drifting haze between the rows of islands ---------------------------
  // Real filmed fog (assets/water.js -> fog), shot on black so its luminance is
  // already the alpha and no keying was needed. Three planes at three depths,
  // each drifting at its own speed: what separates one row of islands from the
  // next is not distance, it is the air between them.
  var hazePlanes = [];
  (function buildHaze() {
    if (!(window.DIBSEN_WATER || {}).fog) return;
    var tex = loadDetail('fog');
    var setup = [
      { z: -26,  y: 2.6, w: 150, h: 20, op: 0.16, sp: 0.0022 },
      { z: -58,  y: 3.4, w: 210, h: 26, op: 0.21, sp: 0.0015 },
      { z: -104, y: 4.2, w: 300, h: 34, op: 0.26, sp: 0.0009 }
    ];
    for (var i = 0; i < setup.length; i++) {
      var c = setup[i];
      var m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, fog: false,
        blending: THREE.NormalBlending,
        uniforms: {
          tFog: { value: tex }, uOffset: { value: 0 },
          uTint: { value: HORIZON }, uOpacity: { value: c.op }
        },
        vertexShader: [
          'varying vec2 vUv;',
          'void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
        ].join('\n'),
        fragmentShader: [
          'uniform sampler2D tFog; uniform float uOffset; uniform vec3 uTint; uniform float uOpacity;',
          'varying vec2 vUv;',
          'void main(){',
          '  float a = texture2D(tFog, vec2(vUv.x * 2.2 + uOffset, vUv.y)).r;',
          // soften both ends so a plane never shows its own edge
          '  a *= smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));',
          '  a *= smoothstep(0.0, 0.30, vUv.y) * (1.0 - smoothstep(0.62, 1.0, vUv.y));',
          '  if (a < 0.004) discard;',
          '  gl_FragColor = vec4(uTint, a * uOpacity);',
          '}'
        ].join('\n')
      });
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(c.w, c.h), m);
      mesh.position.set(0, c.y, c.z);
      mesh.renderOrder = 4;
      scene.add(mesh);
      hazePlanes.push({ mat: m, speed: c.sp });
    }
  })();

  // ---- light: a low sun at blue hour --------------------------------------
  scene.add(new THREE.HemisphereLight(0xa8b8dc, 0x24485a, 3.1));
  // Key light sits BEHIND the camera (camera flies down -z, so the key must be
  // at +z) — the previous rig had it at +22z but only 19 high and fighting a
  // strong backlit sky, so every island read as a cut-out.
  var sunLight = new THREE.DirectionalLight(0xffe0c2, 3.9);
  sunLight.position.set(-20, 26, 34);
  scene.add(sunLight);
  var fill = new THREE.DirectionalLight(0x86c4d6, 1.6);
  fill.position.set(24, 11, 10);
  scene.add(fill);
  // A soft lift from below-front so the wave-cut notch and the shadowed face
  // never go fully black — the reef bounces a lot of light in real photographs.
  var bounce = new THREE.DirectionalLight(0x5fd0c0, 0.55);
  bounce.position.set(6, -4, 14);
  scene.add(bounce);

  // ---- annotation ----------------------------------------------------------
  // Text is drawn immediately so a slow or failed image never leaves a blank
  // label; the mark is composited in and the texture refreshed once it loads.
  function makeLabelSprite(title, sub, hexColor, logoUrl) {
    var cv = document.createElement('canvas');
    cv.width = 768; cv.height = 176;
    var ctx = cv.getContext('2d');
    if (!ctx) return null;
    var hex = '#' + ('000000' + hexColor.toString(16)).slice(-6);

    function paint(img) {
      ctx.clearRect(0, 0, 768, 176);
      if (img) {
        var box = 132, ar = img.width / img.height;
        var w = ar >= 1 ? box : box * ar, h = ar >= 1 ? box / ar : box;
        ctx.drawImage(img, 8 + (box - w) / 2, 22 + (box - h) / 2, w, h);
      }
      ctx.textBaseline = 'top';
      // Legibility over BOTH pale sky and dark rock: the label floats over
      // whatever happens to be behind it, so it carries its own shadow.
      ctx.shadowColor = 'rgba(6,3,12,0.92)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 1;
      ctx.font = '500 36px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = hex;
      ctx.fillText(title, 158, 40);
      ctx.fillText(title, 158, 40);          // twice: deepens the shadow, not the glyph
      ctx.font = '400 23px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = 'rgba(246,239,248,0.92)';
      ctx.fillText(sub, 158, 92);
      ctx.fillText(sub, 158, 92);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    paint(null);

    var tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (logoUrl) {
      var img = new Image();
      img.onload = function () { paint(img); tex.needsUpdate = true; };
      img.src = logoUrl;
    }
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false,
      // The island plates write depth, so without this the label is occluded by
      // the very island it is labelling. Annotation is an overlay, like the
      // brackets it belongs with.
      depthTest: false
    }));
    sprite.scale.set(7.2, 1.65, 1);
    return sprite;
  }

  products.forEach(function (p) {
    var group = new THREE.Group();
    group.position.set(p.pos[0], 0, p.pos[2]);
    group.renderOrder = 10;      // annotation always reads over the rock
    islandGroup.add(group);
    p.marks = group;
    p.materials = [];

    var top = p.height * 0.74;   // the sculpt puts the real summit here

    var leaderMat = new THREE.LineBasicMaterial({
      color: p.color, transparent: true, opacity: 0, depthTest: false
    });
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, top, 0), new THREE.Vector3(0, top + 2.1, 0), new THREE.Vector3(2.4, top + 2.1, 0)
    ]), leaderMat));
    p.materials.push(leaderMat);

    var bracketMat = new THREE.LineBasicMaterial({
      color: INK, transparent: true, opacity: 0, depthTest: false
    });
    var w = (p.halfWidth || p.radius) * 1.22, h = p.height * 0.80;
    p.bracketW = w; p.bracketH = h;
    p.bracket = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-w, 0.1, 0), new THREE.Vector3(-w, 1.3, 0),
      new THREE.Vector3(-w, 0.1, 0), new THREE.Vector3(-w + 1.2, 0.1, 0),
      new THREE.Vector3(w, 0.1, 0), new THREE.Vector3(w, 1.3, 0),
      new THREE.Vector3(w, 0.1, 0), new THREE.Vector3(w - 1.2, 0.1, 0),
      new THREE.Vector3(-w, h, 0), new THREE.Vector3(-w, h - 1.2, 0),
      new THREE.Vector3(-w, h, 0), new THREE.Vector3(-w + 1.2, h, 0),
      new THREE.Vector3(w, h, 0), new THREE.Vector3(w, h - 1.2, 0),
      new THREE.Vector3(w, h, 0), new THREE.Vector3(w - 1.2, h, 0)
    ]), bracketMat);
    group.add(p.bracket);
    p.materials.push(bracketMat);

    var label = makeLabelSprite(p.title, p.sub[lang] || p.sub.id, p.color, p.logo);
    if (label) {
      label.position.set(4.6, top + 2.3, 0);
      label.renderOrder = 11;
      group.add(label);
      p.materials.push(label.material);
      p.label = label;
      p.labelY = top + 2.3;
      p.labelX = 4.6;
    }
    p.reveal = 0;
  });

  // No opening title card in the world: the page's own <h1> already says
  // "Dari Raja Ampat, untuk dunia" over this exact scene, and two labels saying
  // the same thing in the same seconds is what made the opening feel cluttered.
  // The scene gets the stage to itself until the first product is reached.
  var introLabel = null, introReveal = 0;

  // ---- flight path ---------------------------------------------------------
  var camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
  var lookAt = new THREE.Vector3(), islandAim = new THREE.Vector3();
  var labelProbe = new THREE.Vector3();
  // Depth-of-field focus state: sharp on the product island being approached,
  // wide open otherwise so the flight itself is never blurred (ref: analisa
  // igloo.inc Bagian 2.7 "bokeh" — the one cinematic ingredient the existing
  // 4-pass grade below didn't have yet; bloom/CA/vignette/grain already did).
  var dofFocus = new THREE.Vector3();
  var dof = { depth: 60, strength: 0 };
  function pathAt(p, out) {
    return out.set(
      Math.sin(p * Math.PI * 1.35) * 4.6,
      7.4 - p * 3.4 + Math.sin(p * Math.PI * 2.1) * 0.55,
      26 - p * 58
    );
  }
  function targetAt(p, out) {
    return out.set(
      Math.sin((p + 0.14) * Math.PI * 1.35) * 3.2,
      4.3 - p * 0.5,
      26 - p * 58 - 17
    );
  }

  var chapters = [
    { from: 0.24, to: 0.45 },
    { from: 0.48, to: 0.69 },
    { from: 0.72, to: 0.96 }
  ];
  var story = { progress: 0, smooth: 0, focus: -1, aimSmooth: 0 };

  // Eased in and out across each chapter so the camera turn toward an island is
  // never abrupt, and it returns to looking down the flight path in between.
  function aimAt(p) {
    for (var c = 0; c < chapters.length; c++) {
      if (p >= chapters[c].from && p <= chapters[c].to) {
        var k = (p - chapters[c].from) / (chapters[c].to - chapters[c].from);
        return Math.sin(Math.max(0, Math.min(1, k)) * Math.PI);
      }
    }
    return 0;
  }
  function setChapter(p) {
    var active = -1;
    for (var c = 0; c < chapters.length; c++) {
      if (p >= chapters[c].from && p <= chapters[c].to) { active = c; break; }
    }
    story.focus = active;
  }
  window.addEventListener('dibsen:archipelago', function (event) {
    var p = (event.detail && event.detail.progress) || 0;
    story.progress = p;
    setChapter(p);
    if (reduceMotion) drawFrame(0);
  });

  var pointer = { x: 0, y: 0 }, pointerTarget = { x: 0, y: 0 };
  // Raw NDC (-1..1 over the canvas itself, not the window) for raycasting
  // against the islands — kept separate from `pointer` above, which is a
  // softened, window-relative value used only to drift the camera.
  var ndc = new THREE.Vector2(-9, -9);
  window.addEventListener('pointermove', function (e) {
    pointerTarget.x = (e.clientX / window.innerWidth - 0.5) * 2;
    pointerTarget.y = (e.clientY / window.innerHeight - 0.5) * 2;
    var rect = canvas.getBoundingClientRect();
    if (rect.width && rect.height) {
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    }
    updateHover();
  }, { passive: true });
  window.addEventListener('pointerleave', function () { ndc.set(-9, -9); updateHover(); }, { passive: true });

  // ---- island hover + click: "portfolio" cards, DIBSEN style ---------------
  // Referensi igloo.inc: klik kartu portofolio memicu transisi lalu navigasi
  // (lihat claude/analisa-igloo-inc-dan-rencana.md Bagian 6.2/6.3/6.8). Bedanya:
  // portofolio DIBSEN adalah produk sendiri, bukan klien luar, jadi tujuannya
  // halaman internal (/products#id) — bukan situs lain.
  var raycaster = new THREE.Raycaster();
  var hovered = null, navigating = false;
  var transition = {
    active: false, navigated: false, startTime: 0, dur: 0.85,
    uv: new THREE.Vector2(0.5, 0.5), color: new THREE.Color(0x0E0614), href: ''
  };
  var ANCHORS = { sipnex: 'sipnex', social: 'sosialmedia', safe: 'safe' };

  function updateHover() {
    if (navigating || !canvas.classList.contains('is-ready')) return;
    var candidates = [];
    for (var i = 0; i < products.length; i++) {
      if (products[i].reveal > 0.12) candidates.push(products[i].mesh);
    }
    var hit = null;
    if (candidates.length && ndc.x > -2) {
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObjects(candidates, false);
      // A plate is a rectangle but an island is not. Walk the hits and take the
      // first that lands on actual rock, so the transparent corners of the quad
      // are not clickable.
      for (var h = 0; h < hits.length; h++) {
        var o = hits[h].object;
        if (!o.userData.kind ||
            alphaAt(o.userData.kind, hits[h].uv, o.userData.viewIdx) > 0.4) { hit = o; break; }
      }
    }
    var next = null;
    if (hit) {
      for (var j = 0; j < products.length; j++) {
        if (products[j].mesh === hit) { next = products[j]; break; }
      }
    }
    if (next !== hovered) {
      hovered = next;
      canvas.style.cursor = hovered ? 'pointer' : '';
      if (hovered) primeProducts();
    }
  }

  /* Speculation Rules di HTML hanya bekerja untuk navigasi lewat tautan <a>.
     Klik pulau bukan tautan — dia canvas + window.location.href — jadi
     halaman tujuan tidak pernah ikut disiapkan. Ini menutup celah itu:
     begitu kursor menyentuh salah satu pulau produk (sinyal niat yang cukup
     kuat), /products disiapkan penuh di latar belakang, sehingga saat iris
     wipe selesai halamannya sudah siap.

     Dijalankan SEKALI saja: ketiga pulau menuju halaman yang sama
     (/products, cuma beda anchor), jadi tidak ada unduhan berulang. Kalau
     browser belum mendukung Speculation Rules, jatuh ke <link rel=prefetch>
     yang hanya mengambil dokumen HTML-nya. */
  var primed = false;
  function primeProducts() {
    if (primed) return;
    primed = true;
    try {
      if (HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')) {
        var s = document.createElement('script');
        s.type = 'speculationrules';
        s.textContent = JSON.stringify({
          prerender: [{ urls: ['/products'], eagerness: 'immediate' }]
        });
        document.head.appendChild(s);
      } else {
        var l = document.createElement('link');
        l.rel = 'prefetch'; l.href = '/products'; l.as = 'document';
        document.head.appendChild(l);
      }
    } catch (e) { /* penyiapan halaman itu bonus, jangan sampai mengganggu scene */ }
  }

  function startTransition(p) {
    if (navigating) return;
    navigating = true;
    canvas.style.cursor = '';
    var proj = new THREE.Vector3(p.pos[0], p.height * 0.55, p.pos[2]).project(camera);
    transition.active = true;
    transition.navigated = false;
    transition.startTime = clock.getElapsedTime();
    transition.uv.set(
      Math.min(1, Math.max(0, proj.x * 0.5 + 0.5)),
      Math.min(1, Math.max(0, proj.y * 0.5 + 0.5))
    );
    // A dark, tinted close rather than a bright flash — the destination page
    // shares the same near-black ground, so the cut reads as continuous.
    transition.color.set(0x0E0614).lerp(new THREE.Color(p.color), 0.4);
    transition.href = '/products#' + (ANCHORS[p.key] || p.key);
    if (reduceMotion) {
      setTimeout(function () { window.location.href = transition.href; }, 200);
    }
  }

  canvas.addEventListener('click', function () {
    if (hovered) startTransition(hovered);
  });

  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 760 ? 54 : 42;
    camera.updateProjectionMatrix();
    if (post && post.resize) post.resize();
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  /* BUG PONSEL (diperbaiki 2026-09-05): resize() di atas berjalan SEBELUM
     kelas .webgl-live dipasang ke .stage di akhir file ini. Di layar <=900px,
     CSS memberi canvas kotak 16:9 HANYA lewat selector
     `.stage.webgl-live #archipelago3d`. Jadi saat pengukuran pertama, canvas
     masih memakai aturan dasar (position:absolute; inset:0; height:100%) di
     dalam .pin yang di ponsel sudah position:static — canvas terukur setinggi
     SELURUH stage (mis. 390x1101, potret), bukan 16:9.

     Akibatnya di ponsel: buffer render dan camera.aspect terkunci pada potret
     390x1101 (aspect 0,35), lalu .webgl-live mengubah kotak CSS-nya jadi
     390x219 (aspect 1,78) — dan resize() tidak pernah dipanggil lagi karena
     hanya terikat pada event 'resize' window. Scene potret tinggi dijejalkan
     ke kotak pendek: pulau pipih, horizon melar, komposisi hancur. Di desktop
     tidak terjadi karena .pin sticky, sehingga canvas sudah berukuran benar
     sejak pengukuran pertama.

     ResizeObserver menutup ini secara umum, bukan cuma kasus .webgl-live: ia
     ikut menangani putar layar, munculnya/hilangnya toolbar browser ponsel,
     dan perubahan tata letak lain yang tidak memicu event 'resize' window. */
  if (window.ResizeObserver) {
    try { new ResizeObserver(function () { resize(); }).observe(canvas); }
    catch (e) { /* browser lama: cukup andalkan event resize + panggilan manual */ }
  }

  // ---- post-processing -----------------------------------------------------
  // The grade is what separates "rendered" from "filmed". Four passes, all built
  // from core Three.js — no examples/jsm addons, because the page loads Three as
  // a plain UMD script and cannot import ES modules:
  //   1. scene -> full-res target
  //   2. bright-pass + horizontal blur -> quarter-res target
  //   3. vertical blur -> quarter-res target
  //   4. composite: chromatic aberration, bloom, vignette, grain, dithering
  // If anything here throws, `post` stays null and the scene renders straight to
  // the canvas exactly as before — the hero never goes black over a grade.
  var QUAD_VS = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
  ].join('\n');

  function makePost() {
    var w = Math.max(2, canvas.clientWidth), h = Math.max(2, canvas.clientHeight);
    var dpr = renderer.getPixelRatio();
    var fw = Math.floor(w * dpr), fh = Math.floor(h * dpr);
    var bw = Math.max(2, fw >> 2), bh = Math.max(2, fh >> 2);
    var opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
    var rtScene = new THREE.WebGLRenderTarget(fw, fh, opts);
    // Depth texture attached to the full scene render — a normal framebuffer
    // attachment, so it costs nothing extra to produce and needs no changes
    // to any of the scene's own shaders (islands/sea/sky stay exactly as
    // they are). This is what lets the composite pass tell near from far.
    rtScene.depthTexture = new THREE.DepthTexture(fw, fh);
    rtScene.depthTexture.type = THREE.UnsignedShortType;
    var rtA = new THREE.WebGLRenderTarget(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    var rtB = new THREE.WebGLRenderTarget(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    // A second quarter-res blur pair, reusing the same two-pass Gaussian
    // material as bloom below but fed the WHOLE scene (no bright-pass
    // threshold) — this is the out-of-focus version the composite pass
    // dissolves into wherever depth strays from the focus point.
    var rtC = new THREE.WebGLRenderTarget(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    var rtD = new THREE.WebGLRenderTarget(bw, bh, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });

    var bright = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.62 } },
      vertexShader: QUAD_VS,
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform float uThreshold; varying vec2 vUv;',
        'void main(){',
        '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
        '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
        '  float k = max(0.0, l - uThreshold) / max(0.0001, 1.0 - uThreshold);',
        '  gl_FragColor = vec4(c * k, 1.0);',
        '}'
      ].join('\n')
    });

    var blur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: QUAD_VS,
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;',
        'void main(){',
        '  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270;',
        '  s += (texture2D(tDiffuse, vUv + uDir * 1.3846).rgb + texture2D(tDiffuse, vUv - uDir * 1.3846).rgb) * 0.3162;',
        '  s += (texture2D(tDiffuse, vUv + uDir * 3.2308).rgb + texture2D(tDiffuse, vUv - uDir * 3.2308).rgb) * 0.0702;',
        '  gl_FragColor = vec4(s, 1.0);',
        '}'
      ].join('\n')
    });

    var comp = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null },
        tDepth: { value: null }, tDofBlur: { value: null },
        uNear: { value: camera.near }, uFar: { value: camera.far },
        uFocusDepth: { value: 60 }, uDofStrength: { value: 0 },
        uTime: { value: 0 }, uRes: { value: new THREE.Vector2(fw, fh) },
        uAberr: { value: 0.0020 }, uBloom: { value: 0.62 }, uGrain: { value: 0.032 },
        // Portal-close transition when a product island is clicked — a
        // dithered iris wipe expanding from the island's screen position,
        // not a real second scene (ref: analisa Bagian 6.3, adapted: we only
        // have one 3D scene, the destination is a normal page).
        uTransition: { value: 0 }, uTransitionUV: { value: new THREE.Vector2(0.5, 0.5) },
        uTransitionColor: { value: new THREE.Color(0x0E0614) }
      },
      vertexShader: QUAD_VS,
      fragmentShader: [
        'uniform sampler2D tScene; uniform sampler2D tBloom;',
        'uniform sampler2D tDepth; uniform sampler2D tDofBlur;',
        'uniform float uNear; uniform float uFar;',
        'uniform float uFocusDepth; uniform float uDofStrength;',
        'uniform float uTime; uniform vec2 uRes;',
        'uniform float uAberr; uniform float uBloom; uniform float uGrain;',
        'uniform float uTransition; uniform vec2 uTransitionUV; uniform vec3 uTransitionColor;',
        'varying vec2 vUv;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }',
        // standard perspective depth-texture -> view-space distance unpack
        'float sceneDepth(vec2 uv){',
        '  float z = texture2D(tDepth, uv).x;',
        '  float viewZ = (uNear * uFar) / ((uFar - uNear) * z - uFar);',
        '  return -viewZ;',
        '}',
        'void main(){',
        '  vec2 d = vUv - 0.5;',
        '  float r2 = dot(d, d);',
        // chromatic aberration grows with distance from centre, like a real lens
        '  vec2 off = d * uAberr * r2 * 4.0;',
        '  vec3 col;',
        '  col.r = texture2D(tScene, vUv - off).r;',
        '  col.g = texture2D(tScene, vUv).g;',
        '  col.b = texture2D(tScene, vUv + off).b;',
        // circle-of-confusion: how far this pixel's depth sits from the
        // island currently being approached. uDofStrength (= story.aimSmooth)
        // is what keeps the open flight completely sharp and only lets the
        // blur in once the camera is actually locking onto a subject.
        '  float pxDepth = sceneDepth(vUv);',
        '  float coc = clamp(abs(pxDepth - uFocusDepth) / 12.0, 0.0, 1.0) * uDofStrength;',
        '  vec3 blurred = texture2D(tDofBlur, vUv).rgb;',
        '  col = mix(col, blurred, coc);',
        '  col += texture2D(tBloom, vUv).rgb * uBloom;',
        '  float vig = smoothstep(1.05, 0.22, sqrt(r2));',
        '  col *= mix(0.82, 1.0, vig);',
        // grain doubles as a dither, which is what kills banding in the dark sky
        '  float g = hash(vUv * uRes + fract(uTime) * 71.7);',
        '  col += (g - 0.5) * uGrain;',
        '  if (uTransition > 0.0) {',
        '    vec2 aspectFix = vec2(uRes.x / max(1.0, uRes.y), 1.0);',
        '    float dist = length((vUv - uTransitionUV) * aspectFix);',
        '    float edgeNoise = (hash(vUv * uRes * 0.35 + uTransition * 13.7) - 0.5) * 0.045;',
        '    float radius = uTransition * 2.2 + edgeNoise;',
        '    float m = smoothstep(radius - 0.12, radius, dist);',
        '    col = mix(uTransitionColor, col, m);',
        '  }',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });

    var quadScene = new THREE.Scene();
    var quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), comp);
    quad.frustumCulled = false;
    quadScene.add(quad);

    return {
      rtScene: rtScene, rtA: rtA, rtB: rtB, rtC: rtC, rtD: rtD,
      bright: bright, blur: blur, comp: comp,
      scene: quadScene, cam: quadCam, quad: quad,
      resize: function () {
        var ww = Math.max(2, canvas.clientWidth), hh = Math.max(2, canvas.clientHeight);
        var p = renderer.getPixelRatio();
        var nw = Math.floor(ww * p), nh = Math.floor(hh * p);
        rtScene.setSize(nw, nh);
        rtA.setSize(Math.max(2, nw >> 2), Math.max(2, nh >> 2));
        rtB.setSize(Math.max(2, nw >> 2), Math.max(2, nh >> 2));
        rtC.setSize(Math.max(2, nw >> 2), Math.max(2, nh >> 2));
        rtD.setSize(Math.max(2, nw >> 2), Math.max(2, nh >> 2));
        comp.uniforms.uRes.value.set(nw, nh);
        comp.uniforms.uNear.value = camera.near;
        comp.uniforms.uFar.value = camera.far;
      }
    };
  }

  var post = null;
  try { post = makePost(); } catch (e) { post = null; }

  function renderGraded(t) {
    if (!post) { renderer.render(scene, camera); return; }
    post.comp.uniforms.uTransition.value = transition.active ? transition.t : 0;
    post.comp.uniforms.uTransitionUV.value.copy(transition.uv);
    post.comp.uniforms.uTransitionColor.value.copy(transition.color);
    // 1 — scene
    renderer.setRenderTarget(post.rtScene);
    renderer.clear();
    renderer.render(scene, camera);
    // 2 — bright pass, blurred horizontally
    post.quad.material = post.bright;
    post.bright.uniforms.tDiffuse.value = post.rtScene.texture;
    renderer.setRenderTarget(post.rtA);
    renderer.render(post.scene, post.cam);
    post.quad.material = post.blur;
    post.blur.uniforms.tDiffuse.value = post.rtA.texture;
    post.blur.uniforms.uDir.value.set(1 / post.rtA.width, 0);
    renderer.setRenderTarget(post.rtB);
    renderer.render(post.scene, post.cam);
    // 3 — blurred vertically
    post.blur.uniforms.tDiffuse.value = post.rtB.texture;
    post.blur.uniforms.uDir.value.set(0, 1 / post.rtA.height);
    renderer.setRenderTarget(post.rtA);
    renderer.render(post.scene, post.cam);
    // 3b — DOF blur chain: full scene (no bright-pass threshold), blurred
    // H then V into rtC/rtD, only actually mixed in when uDofStrength > 0.
    post.blur.uniforms.tDiffuse.value = post.rtScene.texture;
    post.blur.uniforms.uDir.value.set(1 / post.rtC.width, 0);
    renderer.setRenderTarget(post.rtC);
    renderer.render(post.scene, post.cam);
    post.blur.uniforms.tDiffuse.value = post.rtC.texture;
    post.blur.uniforms.uDir.value.set(0, 1 / post.rtC.height);
    renderer.setRenderTarget(post.rtD);
    renderer.render(post.scene, post.cam);
    // 4 — composite to the canvas
    post.quad.material = post.comp;
    post.comp.uniforms.tScene.value = post.rtScene.texture;
    post.comp.uniforms.tBloom.value = post.rtA.texture;
    post.comp.uniforms.tDepth.value = post.rtScene.depthTexture;
    post.comp.uniforms.tDofBlur.value = post.rtD.texture;
    post.comp.uniforms.uFocusDepth.value = dof.depth;
    post.comp.uniforms.uDofStrength.value = dof.strength;
    post.comp.uniforms.uTime.value = reduceMotion ? 0.0 : t;
    renderer.setRenderTarget(null);
    renderer.render(post.scene, post.cam);
  }

  var clock = new THREE.Clock();
  var running = true;

  function drawFrame(t) {
    story.smooth += (story.progress - story.smooth) * (reduceMotion ? 1 : 0.075);
    pointer.x += (pointerTarget.x - pointer.x) * 0.04;
    pointer.y += (pointerTarget.y - pointer.y) * 0.04;

    seaUniforms.uTime.value = t;
    for (var hz = 0; hz < hazePlanes.length; hz++) {
      hazePlanes[hz].mat.uniforms.uOffset.value = t * hazePlanes[hz].speed;
    }

    pathAt(story.smooth, camPos);
    targetAt(story.smooth, camTarget);
    camera.position.set(camPos.x + pointer.x * 1.5, camPos.y - pointer.y * 0.9, camPos.z);

    story.aimSmooth += (aimAt(story.smooth) - story.aimSmooth) * (reduceMotion ? 1 : 0.08);
    lookAt.copy(camTarget);
    if (story.focus >= 0 && story.aimSmooth > 0.001) {
      var subject = products[story.focus];
      islandAim.set(subject.pos[0], subject.height * 0.62, subject.pos[2]);
      lookAt.lerp(islandAim, story.aimSmooth * 0.85);
    }
    // The cursor also nudges WHERE the camera looks, not just where it sits —
    // a small rotational component on top of the positional drift above, which
    // is what makes the whole frame read as reactive rather than just floaty
    // (ref: igloo.inc's custom pointer-driven camera, analisa Bagian 6.5).
    // While an island is the subject the cursor must not drag the aim off it —
    // that is what pushed the product labels past the edge of the screen in the
    // first recorded pass. The influence fades out as the camera locks on.
    var aimFree = 1 - story.aimSmooth * 0.75;
    lookAt.x += pointer.x * 2.6 * aimFree;
    lookAt.y -= pointer.y * 1.5 * aimFree;
    camera.lookAt(lookAt);

    // Depth-of-field tracks the same lock-on the camera aim already uses
    // (story.aimSmooth) — sharp on the approached island, gone everywhere
    // else, fading with the same ease so the blur is never a sudden pop.
    if (story.focus >= 0) {
      var dofSubject = products[story.focus];
      dofFocus.set(dofSubject.pos[0], dofSubject.height * 0.5, dofSubject.pos[2]);
      dof.depth = camera.position.distanceTo(dofFocus);
      dof.strength = story.aimSmooth;
    } else {
      dof.strength += (0 - dof.strength) * 0.08;
    }

    // Cylindrical billboarding: yaw only, never pitch. Pitching a rock toward
    // the camera is what makes a billboard read as a sticker; yaw alone reads
    // as a rock seen from a different side.
    for (var bb2 = 0; bb2 < billboards.length; bb2++) {
      var bm = billboards[bb2];
      bm.rotation.y = Math.atan2(camera.position.x - bm.position.x,
                                 camera.position.z - bm.position.z);
    }

    // The quad still faces the camera; what changes is WHICH side of the rock is
    // printed on it. The bearing that already drives the billboard yaw above is
    // the same number that selects the view, so the two can never disagree.
    for (var vm = 0; vm < viewMeshes.length; vm++) {
      var mv = viewMeshes[vm], V = mv.userData.view;
      var az = Math.atan2(camera.position.x - mv.position.x,
                          camera.position.z - mv.position.z) * 180 / Math.PI;
      var dz2 = az - V.map.first;
      while (dz2 > 180) dz2 -= 360;
      while (dz2 < -180) dz2 += 360;
      var deg = V.map.offset + V.dir * dz2;
      if (deg < 0) deg = 0;
      if (deg > V.map.span) deg = V.map.span;
      var f = deg / V.step;
      var ia = Math.floor(f);
      if (ia > V.n - 2) ia = V.n - 2;
      if (ia < 0) ia = 0;
      var uu = mv.material.uniforms;
      uu.uIdxA.value = ia;
      uu.uIdxB.value = ia + 1;
      uu.uMix.value = Math.min(1, Math.max(0, f - ia));
      mv.userData.viewIdx = f;
      // The annotation bracket is sized from how much of the quad the rock
      // actually fills, and that changes with every view — at the edge-on view
      // the rock covers half of what it does face-on.
      if (V.solid) {
        var sA = V.solid[ia], sB = V.solid[Math.min(V.n - 1, ia + 1)];
        mv.userData.halfWidth = mv.userData.atlasW * 0.5 *
          (sA + (sB - sA) * uu.uMix.value);
        // The bracket was cut once from the flat plate's width. The rock is a
        // different width from every angle now, so redraw it — otherwise it
        // frames open water at the edge-on views, which is the same fault that
        // was fixed for the flat plates and would have come straight back.
        var pr = mv.userData.product;
        if (pr && pr.bracket) {
          var bw = mv.userData.halfWidth * 1.22, bh = pr.bracketH;
          var pa = pr.bracket.geometry.attributes.position, ar2 = pa.array;
          var pts = [[-bw, 0.1], [-bw, 1.3], [-bw, 0.1], [-bw + 1.2, 0.1],
                     [bw, 0.1], [bw, 1.3], [bw, 0.1], [bw - 1.2, 0.1],
                     [-bw, bh], [-bw, bh - 1.2], [-bw, bh], [-bw + 1.2, bh],
                     [bw, bh], [bw, bh - 1.2], [bw, bh], [bw - 1.2, bh]];
          for (var q = 0; q < pts.length; q++) {
            ar2[q * 3] = pts[q][0]; ar2[q * 3 + 1] = pts[q][1];
          }
          pa.needsUpdate = true;
        }
      }
    }

    products.forEach(function (p, index) {
      var want = story.focus === index ? 1 : 0;
      p.reveal += (want - p.reveal) * (reduceMotion ? 1 : 0.06);
      for (var m = 0; m < p.materials.length; m++) {
        var mat = p.materials[m];
        mat.opacity = p.reveal * (mat.isSpriteMaterial ? 1 : 0.8);
      }
      if (p.marks) p.marks.rotation.y = Math.sin(t * 0.12 + index) * 0.05;
      // A label pinned to one side runs off screen as soon as its island drifts
      // to that same side. Project the island and hang the label on whichever
      // side faces the middle of the frame.
      if (p.label && p.reveal > 0.01) {
        labelProbe.set(p.pos[0], p.height * 0.74, p.pos[2]).project(camera);
        var wantX = labelProbe.x > 0.06 ? -p.labelX : p.labelX;
        p.label.position.x += (wantX - p.label.position.x) * 0.08;
      }
      // The island is lit by its product colour while it is the subject — a
      // grade on the stone, not a repaint of it. Hovering adds a further,
      // separate boost so a clickable island visibly answers the cursor even
      // before the pointer touches it (the browser cursor already switches to
      // a pointer in updateHover(); this is the WebGL half of that feedback).
      var hoverBoost = hovered === p ? 0.05 : 0;
      p.hoverGlow = (p.hoverGlow || 0) + (hoverBoost - (p.hoverGlow || 0)) * (reduceMotion ? 1 : 0.15);
      if (p.mesh && p.mesh.material) {
        var mm = p.mesh.material;
        if (mm.uniforms && mm.uniforms.uGlow) {
          mm.uniforms.uTint.value.setHex(p.color);
          mm.uniforms.uGlow.value = p.reveal * 0.045 + p.hoverGlow * 1.6;
        } else if (mm.emissive) {
          mm.emissive.setHex(p.color);
          mm.emissiveIntensity = p.reveal * 0.055 + p.hoverGlow;
        }
      }
    });

    if (transition.active) {
      transition.t = Math.min(1, (t - transition.startTime) / transition.dur);
      if (transition.t >= 1 && !transition.navigated) {
        transition.navigated = true;
        window.location.href = transition.href;
      }
    }

    var introWant = (story.smooth < 0.17 && story.focus < 0) ? 1 : 0;
    introReveal += (introWant - introReveal) * (reduceMotion ? 1 : 0.06);
    if (introLabel) introLabel.material.opacity = introReveal;

    renderGraded(t);
  }

  function loop() {
    if (!running) return;
    drawFrame(clock.getElapsedTime());
    requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running && !reduceMotion) requestAnimationFrame(loop);
  });

  if (stage) stage.classList.add('webgl-live');
  canvas.classList.add('is-ready');
  // Kelas di atas baru saja MENGUBAH kotak CSS canvas (paling drastis di
  // ponsel: dari setinggi stage menjadi 16:9), jadi ukur ulang sekarang juga.
  // ResizeObserver juga akan menangkapnya, tapi panggilan langsung ini membuat
  // frame PERTAMA sudah benar — tanpa ini sempat terlihat satu frame melar.
  resize();
  // The islands become clickable only once the scene is actually live — before
  // that, pointer-events:none (set in CSS) correctly lets clicks fall through
  // to the fallback video/DOM underneath.
  canvas.style.pointerEvents = 'auto';

  if (reduceMotion) { drawFrame(0); }
  else { requestAnimationFrame(loop); }
})();
