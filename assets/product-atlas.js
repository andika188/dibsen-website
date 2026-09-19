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
})();
