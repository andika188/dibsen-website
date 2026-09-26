(function () {
  'use strict';

  var copy = document.documentElement.lang === 'en' ? {
    suara: ['A voice that is valued.', 'A timeline shaped by your choices.'],
    karya: ['Work that can grow.', 'A place to make, share, and be found.'],
    milik: ['Ownership stays open.', 'A verifiable trail for every work.'],
    hadir: ['Attendance recorded.', 'Presence, location, and verification in one flow.'],
    lokasi: ['Location verified.', 'Geo-tagging gives every attendance its context.'],
    audit: ['The trail stays readable.', 'Activity history supports clearer decisions.'],
    aman: ['Safe to explore.', 'Local information close to where you are.'],
    lapor: ['A coordinated report.', 'One tap carries the incident and location into the right flow.'],
    respons: ['A closer response.', 'Local alerts help people act with calm.']
  } : {
    suara: ['Suara yang dihargai.', 'Linimasa yang mengikuti pilihanmu.'],
    karya: ['Karya yang bertumbuh.', 'Ruang untuk membuat, berbagi, dan ditemukan.'],
    milik: ['Kepemilikan yang terbuka.', 'Jejak karya yang dapat diverifikasi.'],
    hadir: ['Hadir tercatat.', 'Presensi, lokasi, dan verifikasi dalam satu alur.'],
    lokasi: ['Lokasi terverifikasi.', 'Geo-tagging memberi konteks pada setiap kehadiran.'],
    audit: ['Jejak tetap terbaca.', 'Riwayat aktivitas membantu keputusan yang lebih rapi.'],
    aman: ['Aman untuk menjelajah.', 'Informasi lokal yang dekat dengan keadaanmu.'],
    lapor: ['Laporan terkoordinasi.', 'Satu ketukan membawa kejadian dan lokasi ke alur yang tepat.'],
    respons: ['Respons lebih dekat.', 'Peringatan lokal membantu orang bertindak dengan tenang.']
  };

  document.querySelectorAll('[data-simulator]').forEach(function (simulator) {
    var output = simulator.querySelector('[data-sim-output]');
    var detail = simulator.querySelector('[data-sim-detail]');
    simulator.querySelectorAll('[data-sim-key]').forEach(function (button) {
      if (document.documentElement.lang === 'en') {
        var labels = {suara: 'Voice', karya: 'Work', milik: 'Ownership', hadir: 'Attendance', lokasi: 'Location', audit: 'Audit', aman: 'Safe', lapor: 'Report', respons: 'Response'};
        if (labels[button.dataset.simKey]) button.textContent = labels[button.dataset.simKey];
      }
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var next = copy[button.dataset.simKey];
        if (!next) return;
        simulator.querySelectorAll('[data-sim-key]').forEach(function (item) {
          item.classList.toggle('is-active', item === button);
          item.setAttribute('aria-pressed', String(item === button));
        });
        output.textContent = next[0];
        detail.textContent = next[1];
      });
      button.setAttribute('aria-pressed', button.classList.contains('is-active') ? 'true' : 'false');
    });
    var selected = simulator.querySelector('[data-sim-key].is-active');
    if (selected && copy[selected.dataset.simKey]) {
      output.textContent = copy[selected.dataset.simKey][0];
      detail.textContent = copy[selected.dataset.simKey][1];
    }
  });

  var atlas = document.querySelector('.atlas');
  if (atlas && 'IntersectionObserver' in window) {
    var atlasObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        atlas.classList.add('is-arrived');
        atlasObserver.unobserve(atlas);
      });
    }, { threshold: 0.12 });
    atlasObserver.observe(atlas);
  } else if (atlas) {
    atlas.classList.add('is-arrived');
  }

  // Product Atlas stacking-cards (2026-09-26, rev2): kartu 1 diam di panel
  // yang sticky, kartu 2 & 3 digeser masuk dari bawah lewat translateY()
  // sesuai progres scroll — pola yang sama persis dengan updateHeroCaption
  // di index.html (scroll listener biasa, hitung progress 0..1, set
  // transform). Alasan pindah dari position:sticky per-kartu (percobaan
  // sebelumnya): supaya dua kartu setinggi ~600px benar2 tumpang tindih,
  // offset top antar kartu sticky harus lebih besar dari tinggi kartu itu
  // sendiri (>600px) — angka itu sudah lebih besar dari viewport manapun
  // begitu ada 3 kartu, jadi teknik top-offset-beda tidak bisa dipakai di
  // sini. translateY berbasis progres tidak punya batasan itu.
  var atlasStack = document.querySelector('.atlas-stack');
  var atlasViewport = document.querySelector('.atlas-stack__viewport');
  var atlasItems = [].slice.call(document.querySelectorAll('.atlas-stack__item'));
  if (atlasStack && atlasViewport && atlasItems.length > 1) {
    var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var supportsInert = 'inert' in HTMLElement.prototype;
    var segments = atlasItems.length - 1;
    var narrowMQ = matchMedia('(max-width: 820px)');
    var updateAtlasStack = function () {
      if (reduceMotion || narrowMQ.matches) return;
      var total = atlasStack.offsetHeight - atlasViewport.offsetHeight;
      var stackTop = atlasStack.getBoundingClientRect().top + scrollY;
      var progress = total > 0 ? Math.max(0, Math.min(1, (scrollY - stackTop) / total)) : 0;
      atlasItems.forEach(function (item, i) {
        if (i === 0) return;
        var segStart = (i - 1) / segments;
        var segEnd = i / segments;
        var segProgress = Math.max(0, Math.min(1, (progress - segStart) / (segEnd - segStart)));
        item.style.transform = 'translateY(' + (1 - segProgress) * 100 + '%)';
        var prevItem = atlasItems[i - 1];
        var covered = segProgress >= 0.999;
        prevItem.classList.toggle('is-stacked-behind', covered);
        if (supportsInert) {
          if (covered && prevItem.contains(document.activeElement)) document.activeElement.blur();
          prevItem.inert = covered;
        }
      });
    };
    addEventListener('scroll', updateAtlasStack, { passive: true });
    addEventListener('resize', updateAtlasStack);
    updateAtlasStack();
  }
})();
