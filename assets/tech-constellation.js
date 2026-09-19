/* ==========================================================================
   DIBSEN TECH — peta sistem halaman Teknologi
   "Tiga ekosistem. Satu standar kepercayaan." — dan sekarang gambarnya
   benar-benar mengatakan itu.

   Versi sebelumnya: 7 bola icosahedron polos yang disebar acak + 7 garis
   bezier 1px + 90 titik bintang. Tidak ada strukturnya, tidak ada
   hubungannya dengan judul di atasnya, dan karena semua node ukurannya
   nyaris sama tanpa hierarki, hasilnya terbaca seperti gambar tempel.

   Versi ini: tiga KLASTER, masing-masing memakai warna produknya sendiri
   (SIPneX hijau, SosMedPlus peach, Safe Raja Ampat oranye). Tiap klaster
   punya satu hub + tiga satelit. Ketiga hub mengalirkan pulsa data ke SATU
   inti terang di tengah — itulah "satu standar kepercayaan"-nya. Jadi
   strukturnya sendiri yang bercerita, bukan cuma dekorasi.

   Yang menaikkan kelasnya secara teknis:
   - node = sumber cahaya, bukan lingkaran datar: inti solid + dua lapis
     sprite glow additive (ketat & terang, lebar & lembut)
   - link = tabung tipis ber-vertex-color yang memudar di ujung klaster dan
     menguat mendekati inti (arah aliran terbaca tanpa panah)
   - pulsa data berjalan di setiap link, fase diacak per link
   - inti dibungkus cangkang wireframe icosahedron yang berputar pelan
     berlawanan arah + cincin tipis + halo besar
   - parallax mengikuti kursor, medan partikel 2 lapis untuk kedalaman
   - label HTML (bukan teks WebGL) yang diproyeksikan tiap frame: tajam,
     ikut font brand, dan tetap terbaca screen reader

   Semua warna dibaca dari CSS custom property yang sudah ada, jadi kalau
   palet produk berubah di style.css, widget ini ikut tanpa disentuh.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('tech-constellation');
  if (!canvas || !window.THREE) return;

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var low = innerWidth < 720 || (navigator.deviceMemory && navigator.deviceMemory <= 4);

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: !low, powerPreference: 'high-performance' });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, low ? 1.25 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  /* --- palet: ambil dari CSS supaya satu sumber kebenaran --- */
  function cssColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return new THREE.Color(v || fallback);
  }
  var C_SIPNEX = cssColor('--pc-sipnex', '#85BD5B');
  var C_SOSMED = cssColor('--pc-sosialmedia', '#E6A877');
  var C_SAFE   = cssColor('--pc-saferajaampat', '#FC9700');
  var C_CORE   = cssColor('--magenta-lit', '#F2609B');
  var C_CORE2  = cssColor('--violet-lit', '#A85FD8');

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 10.5);
  var root = new THREE.Group();
  scene.add(root);

  /* --- tekstur glow: radial gradient digambar sekali di canvas 2D.
     Inilah yang membuat node terbaca sebagai sumber cahaya, bukan bulatan
     yang diwarnai. --- */
  /* peak = alpha di titik pusat. Sengaja DI BAWAH 1: dengan additive
     blending, halo ketat + halo lembut + bola inti saling menumpuk, dan
     kalau pusatnya penuh, jumlahnya melewati 1 di ketiga kanal sehingga
     node terbakar jadi PUTIH — warna produknya hilang. Itu cacat serius
     untuk situs ini karena identitas warna produk yang justru dibawa
     node-nya. Nilai di bawah dipilih supaya penjumlahannya tetap di
     dalam gamut dan node tetap terbaca hijau/peach/oranye. */
  function glowTexture(softness, peak) {
    var s = 128, cv = document.createElement('canvas');
    cv.width = cv.height = s;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,' + peak + ')');
    g.addColorStop(softness * 0.35, 'rgba(255,255,255,' + (peak * 0.42).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    var t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  var TEX_TIGHT = glowTexture(0.35, 0.85);
  var TEX_SOFT  = glowTexture(0.95, 0.62);

  function sprite(tex, color, size, opacity) {
    var m = new THREE.SpriteMaterial({
      map: tex, color: color, transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    });
    var s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    return s;
  }

  /* --- tata letak: 3 klaster mengelilingi 1 inti.
     Posisi disusun tangan supaya seimbang secara optik (bukan simetri
     matematis yang kaku), dan tiap klaster dapat kedalaman z berbeda
     supaya parallax-nya terasa. --- */
  var CORE_POS = new THREE.Vector3(0, 0.15, 0);

  /* Tiap klaster dapat BENTUK geometri yang berbeda, bukan cuma warna
     berbeda. Ini disengaja: warna saja bukan kanal yang aman untuk
     dijadikan satu-satunya pembeda di proyek ini. Jadi klaster dibedakan
     lewat tiga kanal sekaligus — posisi (terpisah jelas), bentuk, dan
     label tertulis — dengan warna sebagai penguat, bukan penentu.

     `anchor` = titik kosong yang sengaja disediakan untuk label, dipisah
     dari `hub`. Versi pertama menaruh label tepat di hub dan hasilnya
     teks menabrak satelit serta garis link. Karena anchor ikut
     ditransformasi matriks yang sama dengan node, label tetap menempel
     benar walau scene berputar/parallax. */
  var clusters = [
    { key: 'sipnex', color: C_SIPNEX, shape: 'ico',
      hub: new THREE.Vector3(-3.0, 1.0, -0.35),
      sats: [[-4.05, 1.7, -0.7], [-4.0, 0.2, -0.15], [-2.8, 2.05, -0.5]],
      anchor: new THREE.Vector3(-3.3, -0.85, -0.35) },
    { key: 'sosialmedia', color: C_SOSMED, shape: 'octa',
      hub: new THREE.Vector3(2.95, 1.25, -0.15),
      sats: [[4.05, 1.95, -0.55], [4.15, 0.6, 0.1], [2.55, 2.2, -0.35]],
      anchor: new THREE.Vector3(3.1, 3.05, -0.15) },
    { key: 'safe', color: C_SAFE, shape: 'tetra',
      hub: new THREE.Vector3(0.5, -1.9, 0.4),
      sats: [[-0.75, -2.7, 0.15], [1.75, -2.65, 0.55], [2.05, -1.35, 0.3]],
      anchor: new THREE.Vector3(-1.95, -2.35, 0.4) }
  ];

  function shapeGeo(kind, r) {
    if (kind === 'octa') return new THREE.OctahedronGeometry(r * 1.18, 0);
    if (kind === 'tetra') return new THREE.TetrahedronGeometry(r * 1.32, 0);
    return new THREE.IcosahedronGeometry(r, 1);
  }

  var nodes = [];   // {mesh, glow, halo, basePos, phase, scale}
  var links = [];   // {curve, tube, pulses:[...]}

  /* `pickKey` menandai node ini milik klaster mana. Dipakai raycast di
     bawah supaya klik pada bentuk 3D membuka bagian produk yang benar. */
  var pickables = [];

  function addNode(pos, color, radius, glowSize, isCore, shape, pickKey) {
    var g = new THREE.Group();
    g.position.copy(pos);

    // bola inti sengaja diredupkan (0.72) dari warna aslinya: dia berada
    // TEPAT di titik paling terang kedua halo, jadi kalau dipakai warna
    // penuh, penjumlahan additive-nya yang membakar node jadi putih.
    var solid = color.clone().multiplyScalar(isCore ? 0.8 : 0.72);
    var mesh = new THREE.Mesh(
      isCore ? new THREE.IcosahedronGeometry(radius, 4) : shapeGeo(shape, radius),
      new THREE.MeshBasicMaterial({ color: solid })
    );
    g.add(mesh);

    // dua lapis halo: ketat+terang, lebar+lembut
    var tight = sprite(TEX_TIGHT, color, glowSize, isCore ? 0.6 : 0.5);
    var soft  = sprite(TEX_SOFT,  color, glowSize * 2.6, isCore ? 0.34 : 0.2);
    g.add(soft); g.add(tight);

    // Kemiringan X dikunci per bentuk dan hanya sumbu Y yang berputar.
    // Versi sebelumnya memutar X dan Y sekaligus, jadi tetrahedron dan
    // oktahedron sama-sama terbaca sebagai "wajik" pada sudut acak dan
    // kanal bentuknya hilang percuma. Dengan X dikunci, tiap klaster
    // mempertahankan siluet khasnya sepanjang animasi — sekaligus
    // gerakannya jadi lebih tenang, tidak berjungkir seperti sebelumnya.
    mesh.rotation.x = shape === 'tetra' ? 0.34 : (shape === 'octa' ? 0 : 0.5);

    /* Bentuk aslinya kecil dan sulit dibidik, apalagi di layar sentuh.
       Bola bening berjari-jari lebih besar dipasang sebagai sasaran klik:
       opacity 0 (bukan visible:false, karena raycaster melewati objek yang
       visible-nya false), depthWrite mati supaya tidak mengganggu gambar. */
    if (pickKey) {
      var hit = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(radius * 3.2, 0.42), 8, 6),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hit.userData.pickKey = pickKey;
      g.add(hit);
      pickables.push(hit);
    }

    root.add(g);
    nodes.push({ group: g, mesh: mesh, tight: tight, soft: soft,
                 base: pos.clone(), phase: Math.random() * Math.PI * 2,
                 tightBase: tight.scale.x, isCore: !!isCore });
    return g;
  }

  /* --- link: tabung tipis, warnanya bergradasi dari warna klaster (di
     ujung node) ke warna inti (di ujung inti). Karena WebGL mengabaikan
     linewidth pada THREE.Line, memakai TubeGeometry adalah satu-satunya
     cara mendapat filamen yang benar-benar terlihat dan bisa bercahaya. --- */
  function addLink(a, b, colorFrom, colorTo, thickness, lift, pulseCount, pulseSize) {
    var mid = a.clone().add(b).multiplyScalar(0.5);
    mid.z += lift;
    mid.y += lift * 0.35;
    var curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());

    var seg = low ? 26 : 44;
    var geo = new THREE.TubeGeometry(curve, seg, thickness, low ? 4 : 6, false);
    var pos = geo.attributes.position, count = pos.count;
    var radial = (low ? 4 : 6) + 1;
    var colors = new Float32Array(count * 3);
    var tmp = new THREE.Color();
    for (var i = 0; i < count; i++) {
      var t = Math.floor(i / radial) / seg;          // 0 di node, 1 di inti
      tmp.copy(colorFrom).lerp(colorTo, t * 0.85);
      var fade = 0.22 + 0.78 * Math.pow(t, 1.4);      // memudar di ujung klaster
      colors[i * 3] = tmp.r * fade;
      colors[i * 3 + 1] = tmp.g * fade;
      colors[i * 3 + 2] = tmp.b * fade;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var tube = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.62,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    root.add(tube);

    var pulses = [];
    for (var p = 0; p < pulseCount; p++) {
      var s = sprite(TEX_TIGHT, colorFrom, pulseSize, 0.9);
      root.add(s);
      pulses.push({ sprite: s, offset: p / pulseCount + Math.random() * 0.18, speed: 0.16 + Math.random() * 0.07 });
    }
    links.push({ curve: curve, tube: tube, pulses: pulses });
  }

  /* --- inti --- */
  var coreGroup = addNode(CORE_POS, C_CORE, 0.38, 2.2, true, 'ico');
  // halo raksasa yang sangat lembut — memberi kesan bloom tanpa post-processing
  coreGroup.add(sprite(TEX_SOFT, C_CORE2, 7.2, 0.13));
  // cangkang wireframe yang berputar berlawanan arah dengan root.
  // detail dinaikkan 1->2 dan opacity diturunkan supaya terbaca sebagai
  // medan energi geodesik, bukan seperti bola pantai bergaris tebal.
  var shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.95, 2),
    new THREE.MeshBasicMaterial({ color: C_CORE2, wireframe: true, transparent: true, opacity: 0.16 })
  );
  coreGroup.add(shell);
  // cincin tipis
  var ringPts = [];
  for (var ri = 0; ri <= 96; ri++) {
    var a2 = (ri / 96) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a2) * 1.42, Math.sin(a2) * 1.42, 0));
  }
  var ring = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineBasicMaterial({ color: C_CORE, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  ring.rotation.x = 1.15; ring.rotation.y = 0.22;
  coreGroup.add(ring);

  /* --- klaster --- */
  clusters.forEach(function (cl) {
    addNode(cl.hub, cl.color, 0.235, 1.35, false, cl.shape, cl.key);
    cl.sats.forEach(function (s) {
      var v = new THREE.Vector3(s[0], s[1], s[2]);
      addNode(v, cl.color, 0.13, 0.76, false, cl.shape, cl.key);
      addLink(v, cl.hub, cl.color, cl.color, 0.011, 0.18, low ? 0 : 1, 0.3);
    });
    // batang utama klaster -> inti: lebih tebal, pulsa lebih banyak & besar
    addLink(cl.hub, CORE_POS, cl.color, C_CORE, 0.02, 0.42, low ? 1 : 2, 0.5);
  });

  /* --- medan partikel 2 lapis untuk kedalaman --- */
  function particleLayer(n, spread, size, opacity, color) {
    var arr = [];
    for (var i = 0; i < n; i++) {
      arr.push((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread * 0.62, (Math.random() - 0.5) * 3.4 - 0.8);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    var pts = new THREE.Points(g, new THREE.PointsMaterial({
      color: color, size: size, transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    root.add(pts);
    return pts;
  }
  var dustFar  = particleLayer(low ? 45 : 110, 13, 0.026, 0.34, new THREE.Color('#C9AEDD'));
  var dustNear = particleLayer(low ? 18 : 42, 9.5, 0.05, 0.22, C_CORE2);

  /* --- label HTML yang diproyeksikan dari posisi 3D.
     Sengaja HTML, bukan teks di dalam WebGL: hasilnya tajam di layar
     high-DPI, ikut font brand, dan tetap ada di DOM untuk screen reader. --- */
  var labelLayer = document.querySelector('.techmap__labels');
  var labelMap = [];
  if (labelLayer) {
    clusters.forEach(function (cl) {
      var el = labelLayer.querySelector('[data-node="' + cl.key + '"]');
      if (el) labelMap.push({ el: el, pos: cl.anchor, dy: 0 });
    });
    // dy 86px menaruh nama inti di BAWAH cincinnya (jari-jari cincin 1.42
    // unit); dengan dy kecil, teksnya duduk persis di atas garis cincin.
    var coreEl = labelLayer.querySelector('[data-node="core"]');
    if (coreEl) labelMap.push({ el: coreEl, pos: CORE_POS, dy: 86 });
  }

  /* --- klik pada node 3D membuka bagian produknya di halaman ini.
     Kanvas normalnya pointer-events:none supaya tidak menghalangi apa pun;
     kelas is-pickable menyalakannya hanya kalau raycast benar-benar aktif,
     jadi kalau bagian ini gagal, halaman kembali seperti semula.
     Label HTML di atas tetap jadi jalur utama: dia bekerja tanpa WebGL,
     bisa dicapai dengan Tab, dan terbaca screen reader. --- */
  var pickRay = new THREE.Raycaster();
  var pickPt = new THREE.Vector2();
  var pickPrev = '';

  function pickAt(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return '';
    pickPt.x = ((clientX - r.left) / r.width) * 2 - 1;
    pickPt.y = -((clientY - r.top) / r.height) * 2 + 1;
    pickRay.setFromCamera(pickPt, camera);
    var hits = pickRay.intersectObjects(pickables, false);
    return hits.length ? (hits[0].object.userData.pickKey || '') : '';
  }

  function goTo(key) {
    var target = document.getElementById(key);
    if (!target) return;
    // Menulis hash lewat location supaya tombol kembali tetap berfungsi;
    // scroll-behavior:smooth dan scroll-margin-top sudah diatur di CSS.
    if (history.pushState) {
      history.pushState(null, '', '#' + key);
      target.scrollIntoView();
    } else {
      location.hash = key;
    }
    // Pindahkan fokus supaya pengguna papan ketik ikut berpindah, bukan
    // cuma tampilannya yang bergeser.
    var hadTab = target.hasAttribute('tabindex');
    if (!hadTab) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    if (!hadTab) target.addEventListener('blur', function once() {
      target.removeAttribute('tabindex');
      target.removeEventListener('blur', once);
    });
  }

  if (pickables.length) {
    canvas.classList.add('is-pickable');
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;   // di sentuh tidak ada hover
      var key = pickAt(e.clientX, e.clientY);
      if (key !== pickPrev) {
        pickPrev = key;
        canvas.style.cursor = key ? 'pointer' : '';
      }
    }, { passive: true });
    canvas.addEventListener('pointerleave', function () {
      pickPrev = ''; canvas.style.cursor = '';
    }, { passive: true });
    canvas.addEventListener('click', function (e) {
      var key = pickAt(e.clientX, e.clientY);
      if (key) goTo(key);
    });
  }

  var projV = new THREE.Vector3();
  function placeLabels() {
    if (!labelMap.length) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    for (var i = 0; i < labelMap.length; i++) {
      var L = labelMap[i];
      projV.copy(L.pos).applyMatrix4(root.matrixWorld).project(camera);
      var x = (projV.x * 0.5 + 0.5) * w;
      var y = (-projV.y * 0.5 + 0.5) * h + L.dy;
      L.el.style.transform = 'translate(-50%,-50%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      L.el.style.opacity = (projV.z < 1) ? '1' : '0';
    }
  }

  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w < 620 ? 13.6 : (w < 900 ? 11.8 : 10.5);
    camera.updateProjectionMatrix();
    root.updateMatrixWorld(true);
    placeLabels();
  }
  addEventListener('resize', resize, { passive: true });
  resize();

  /* --- parallax kursor (dimatikan saat reduced-motion) --- */
  var target = { x: 0, y: 0 }, ease = { x: 0, y: 0 };
  if (!reduced) {
    addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    }, { passive: true });
  }

  var clock = new THREE.Clock(), active = true, raf = 0;
  document.addEventListener('visibilitychange', function () {
    active = !document.hidden;
    if (active && !reduced) { clock.getDelta(); draw(); }
  });

  function frame(t) {
    // klaster bernapas pelan + parallax
    ease.x += (target.x - ease.x) * 0.04;
    ease.y += (target.y - ease.y) * 0.04;
    root.rotation.y = ease.x * 0.2 + Math.sin(t * 0.16) * 0.13;
    root.rotation.x = -ease.y * 0.1 + Math.cos(t * 0.12) * 0.05;

    shell.rotation.y = -t * 0.22;
    shell.rotation.x = t * 0.13;
    ring.rotation.z = t * 0.16;

    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.group.position.z = n.base.z + Math.sin(t * 0.75 + n.phase) * 0.12;
      n.mesh.rotation.y = t * 0.3 + n.phase;   // sumbu X sengaja dibiarkan terkunci
      // denyut halus pada halo — inti berdenyut lebih jelas
      var pulse = 1 + Math.sin(t * (n.isCore ? 1.1 : 1.7) + n.phase) * (n.isCore ? 0.09 : 0.13);
      n.tight.scale.set(n.tightBase * pulse, n.tightBase * pulse, 1);
    }

    // pulsa data mengalir di sepanjang link
    for (var k = 0; k < links.length; k++) {
      var lk = links[k];
      for (var p = 0; p < lk.pulses.length; p++) {
        var pu = lk.pulses[p];
        var u = (pu.offset + t * pu.speed) % 1;
        lk.curve.getPointAt(u, pu.sprite.position);
        // memudar di dua ujung supaya tidak "muncul-hilang" mendadak
        pu.sprite.material.opacity = 0.9 * Math.sin(Math.PI * u);
      }
    }

    dustFar.rotation.y = t * 0.012;
    dustNear.rotation.y = -t * 0.02;

    root.updateMatrixWorld(true);
    renderer.render(scene, camera);
    placeLabels();
  }

  function draw() {
    if (!active || reduced) return;
    frame(clock.getElapsedTime());
    raf = requestAnimationFrame(draw);
  }

  if (reduced) {
    // tetap tampilkan komposisinya — satu frame diam, bukan kanvas kosong
    // (versi lama langsung return dan meninggalkan area kosong sama sekali)
    frame(2.4);
  } else {
    draw();
  }
})();
