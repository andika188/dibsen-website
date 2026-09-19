/* ==========================================================================
   DIBSEN TECH — living ribbon backdrop
   Three slow ribbons echoing the swirl in the DIBSEN mark. The spectrum
   rotates with scroll depth, so the top of a page reads violet and the
   bottom reads amber.

   Reads its colours from the CSS custom properties, so the palette has
   exactly one source of truth (assets/style.css / the page's :root).
   ========================================================================== */
(function () {
  'use strict';

  if (document.getElementById('dt-ribbon')) return;          // never double-mount

  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // ---- palette from CSS, with a hard-coded fallback -----------------------
  function stops() {
    var cs = getComputedStyle(document.documentElement);
    var names = ['--violet', '--orchid', '--magenta', '--rose', '--coral', '--amber-warm'];
    var out = [];
    for (var i = 0; i < names.length; i++) {
      var v = cs.getPropertyValue(names[i]).trim();
      if (v) out.push(v);
    }
    return out.length >= 3
      ? out
      : ['#7B2FB2', '#CE5099', '#DB447F', '#E95675', '#F67E5C', '#FB9A60'];
  }

  var cv = document.createElement('canvas');
  cv.id = 'dt-ribbon';
  cv.setAttribute('aria-hidden', 'true');
  // z-index:-1 keeps it above the page ground (set on <html>) but under every
  // element, so no content needs a z-index of its own to stay readable.
  cv.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
  (document.body || document.documentElement).insertBefore(
    cv, (document.body || document.documentElement).firstChild);

  var ctx = cv.getContext('2d', { alpha: true });
  var COLORS = stops();
  var w = 0, h = 0, t = 0, running = true;

  // amp/thick are fractions of viewport height, so it scales with the screen
  var BANDS = [
    { amp: 0.15, freq: 1.5, thick: 0.150, speed: 0.00022, off: 0.0, alpha: 0.15 },
    { amp: 0.11, freq: 2.1, thick: 0.098, speed: 0.00034, off: 1.7, alpha: 0.12 },
    { amp: 0.19, freq: 1.1, thick: 0.212, speed: 0.00016, off: 3.4, alpha: 0.09 }
  ];

  function size() {
    // a soft, blurry layer gains nothing from a 3x buffer — cap it and save the GPU
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = window.innerWidth; h = window.innerHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function scrollFrac() {
    var max = Math.max(1, document.body.scrollHeight - window.innerHeight);
    return Math.max(0, Math.min(1, window.pageYOffset / max));
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    var sc = scrollFrac();
    var step = 14 + (w > 1600 ? 6 : 0);          // coarser samples on wide screens

    for (var bi = 0; bi < BANDS.length; bi++) {
      var b = BANDS[bi];
      var g = ctx.createLinearGradient(0, 0, w, h);
      for (var i = 0; i < COLORS.length; i++) {
        var p = (i / (COLORS.length - 1) + sc * 0.55 + bi * 0.08) % 1;
        g.addColorStop(Math.min(0.999, Math.max(0.001, p)), COLORS[i]);
      }
      ctx.strokeStyle = g;
      ctx.globalAlpha = b.alpha;
      ctx.lineWidth = h * b.thick;
      ctx.lineCap = 'round';
      ctx.beginPath();

      var yBase = h * (0.30 + bi * 0.16) + sc * h * 0.22;
      for (var x = -80; x <= w + 80; x += step) {
        var u = x / w;
        var y = yBase
          + Math.sin(u * Math.PI * b.freq + t * b.speed + b.off) * h * b.amp
          + Math.sin(u * Math.PI * b.freq * 2.3 + t * b.speed * 1.6 + b.off) * h * b.amp * 0.32;
        if (x === -80) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    if (!running) return;
    t = now;
    draw();
    requestAnimationFrame(loop);
  }

  size();
  window.addEventListener('resize', function () { size(); draw(); });

  if (reduce) {
    // honour the preference: draw one static frame, redraw only on scroll
    draw();
    window.addEventListener('scroll', draw, { passive: true });
  } else {
    // stop burning frames while the tab is in the background
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { running = false; }
      else if (!running) { running = true; requestAnimationFrame(loop); }
    });
    requestAnimationFrame(loop);
  }
})();
