# DIBSEN Website — Project Knowledge Base

> **Dokumen referensi ini dibuat pada akhir sesi kerja 19–20 September 2026.**
> Tujuannya agar sesi baru bisa langsung memahami seluruh konteks project tanpa bertanya ulang.

---

## 1. Identitas Project

| Item | Detail |
|---|---|
| **Nama** | DIBSEN — Company Portfolio Website |
| **Workspace** | `d:\absen_app\logo sipnex baru\skool_project\dibsenbestoftheworld\backup-dibsen-180926` |
| **GitHub** | `https://github.com/andika188/dibsen-website` |
| **Branch** | `main` |
| **Git User** | `andika188` / `andikadhesta2@gmail.com` |
| **Tech Stack** | HTML5 statis, CSS3, vanilla JavaScript, Three.js (WebGL) |
| **Tidak ada** framework/build tool — semua file dilayani langsung tanpa kompilasi |
| **Dev Server** | `python -m http.server 4173` (jalankan dari root project) |

---

## 2. Struktur Halaman & File Utama

```
/                       → index.html          (Homepage — 3D Hero + WebGL particles)
/about-us/              → about-us/index.html (About Us)
/contact/               → contact/index.html  (Contact)
/services/              → services/index.html (Services)
/technologies/          → technologies/index.html (Technologies)
/products/              → products/index.html (Products — paling besar, 71KB)
/case-study/            → case-study/index.html
/privacy-policy/        → privacy-policy/index.html
/privacy-policy-sipnex/ → privacy-policy-sipnex/index.html
/404.html               → Custom 404 page
```

---

## 3. Stylesheet & Versioning Cache-Bust

| File | Ukuran | Catatan |
|---|---|---|
| `assets/style.css` | ~83KB | Stylesheet utama SEMUA halaman. Versi cache-bust: `?v=spectrum26` |
| `assets/home.css` | ~49KB | Stylesheet khusus homepage |

> [!IMPORTANT]
> Setiap kali `style.css` diubah, **wajib update query string `?v=...`** di semua file HTML yang me-link-nya agar browser tidak memakai cache lama. Saat ini yang aktif: `?v=spectrum26`.

---

## 4. Fitur Visual Spesial yang Sudah Diterapkan

### 4a. Homepage — 3D WebGL Hero Particles
- **File utama**: `assets/dibsen-hero-particles.js` (Fase 3 synchronous decoder)
- **3D Engine**: Three.js (`assets/three.min.js`, ~670KB)
- **Canvas element**: `#archipelago3d`
- **Video hero homepage**: `#heroVid` — di-set `display: none` karena digantikan oleh animasi 3D particles
- **Pendukung**: `assets/dibsen-hero-shapes.js` (~3.8MB, berisi data geometri partikel)
- **Lainnya**: `assets/archipelago.js`, `assets/hero-audio.js`, `assets/hero-state.js`

> [!CAUTION]
> JANGAN hapus atau modifikasi `dibsen-hero-particles.js` dan `dibsen-hero-shapes.js` tanpa pemahaman penuh — ini adalah inti dari efek 3D partikel homepage. File `hero-state.js` mengelola state global hero.

### 4b. Subpage Video Heroes — Konsep B "35mm Film Roll Card"
Semua 5 subpage menggunakan **Konsep B** (Boxed floating 35mm film roll card dengan metadata vintage, vignette, dan hover lift).

| Halaman | Film Stock Label | Badge Text | Sudut Miring |
|---|---|---|---|
| `/about-us/` | Kodak 500T | `REC • RAJA AMPAT` | `-1.5deg` |
| `/contact/` | Vision3 250D | `CONNECT • WAISAI HQ` | `+1.4deg` |
| `/services/` | Eastman 5219 | `BUILD • PRODUCTION` | `-1.3deg` |
| `/technologies/` | Fuji Eterna | `ARCH • DEEP TECH` | `+1.5deg` |
| `/products/` | Kodak Vision3 | `LIVE • GOOGLE PLAY` | `-1.2deg` |

**CSS Classes terkait di `style.css`:**
- `.pagehead--filmroll` — wrapper section
- `.filmroll-card` — kartu utama dengan shadow dan rotasi
- `.filmroll-sprockets` — lubang sprocket film (SVG data-uri)
- `.filmroll-edge-text` — teks tepi film ("KODAK 500T", dll)
- `.filmroll-aperture` — area video di dalam frame
- `.filmroll-vignette` — efek vignette gelap di sudut
- `.filmroll-badge` — badge merah berkedip "REC"
- Modifier per halaman: `--contact`, `--services`, `--tech`, `--products`

### 4c. Services — Sticky Note Frames pada Gambar "Four Things We Actually Do"
- 4 gambar layanan diberi **frame sticky note** dengan efek melayang (shadow + slight rotation)
- Diterapkan langsung di `services/index.html` dan `style.css`

### 4d. About Us — Postage Stamp Frames pada 4 Gambar
- 4 gambar di halaman About (SIPneX, SosMedPlus, Safe Raja Ampat, DIBSEN TECH Platform) diberi **frame perangko (postage stamp)** dengan efek melayang seimbang (2x2 / 4-card balanced grid)
- Gambar diubah dari rata kiri menjadi **rata tengah**
- Diterapkan di `about-us/index.html` dan `style.css`

### 4e. Accessibility
- Semua efek animasi/transformasi dihormati oleh `prefers-reduced-motion` media query
- Animasi, rotasi, dan floating shadow di-reset untuk pengguna yang memilih reduced motion

---

## 5. File Video (Semua di `assets/sec/`)

| File | Ukuran | Dipakai di |
|---|---|---|
| `hero.mp4` | ~1.1MB | Homepage (hidden, diganti 3D) |
| `hero-main.mp4` | ~1.8MB | Homepage alternate |
| `about-hero.mp4` | ~916KB | About Us hero |
| `contact-hero.mp4` | ~2.9MB | Contact hero |
| `services-hero.mp4` | ~2.6MB | Services hero |
| `tech-hero.mp4` | ~2.5MB | Technologies hero |
| `products-hero.mp4` | ~2.8MB | Products hero |

> Semua video di bawah 100MB limit GitHub — aman di-commit langsung tanpa Git LFS.

---

## 6. File JavaScript Penting Lainnya

| File | Fungsi |
|---|---|
| `assets/i18n.js` (~107KB) | Internasionalisasi / multi-bahasa |
| `assets/plates.js` (~372KB) | Animasi efek visual |
| `assets/water.js` (~191KB) | Efek air / gelombang |
| `assets/product-orbit.js` | Animasi orbit produk di halaman Products |
| `assets/product-atlas.js` | Atlas/peta produk |
| `assets/tech-constellation.js` | Animasi konstelasi di halaman Technologies |
| `assets/ribbon.js` | Efek ribbon |
| `assets/ridge.js` | Efek ridge |
| `assets/views.js` | View management |
| `_shared/premium2.js` | Script shared antar halaman |
| `_shared/premium2.css` | Style shared antar halaman |

---

## 7. Produk yang Ditampilkan di Website

Website ini menampilkan portfolio produk-produk DIBSEN:
1. **SIPNEX** — Platform edukasi/sekolah (`sipnex.webp`)
2. **Safe Raja Ampat** — Aplikasi keselamatan/darurat (`safe-raja-ampat.webp`)
3. **Sosialmedia Plus** — Platform media sosial (`sosialmedia-plus.webp`)

Setiap produk memiliki screenshot-screenshot detail di folder `assets/shots/`.

Halaman **Products** memiliki fitur:
- Tombol **"Kembali ke Beranda"** dengan scroll anchor (jangan rusak!)
- Animasi orbit produk (`product-orbit.js`)
- Atlas produk (`product-atlas.js`)

---

## 8. Konfigurasi & Infrastruktur

| Item | Detail |
|---|---|
| `.htaccess` | Konfigurasi Apache (redirect, caching, dll) |
| `robots.txt` | SEO robots |
| `sitemap.xml` | Sitemap untuk search engines |
| `.gitignore` | Mengabaikan: `scratch/`, `Thumbs.db`, `Desktop.ini`, `.vscode/`, `.idea/`, `*.log` |

---

## 9. Folder `scratch/` — JANGAN COMMIT

Folder `scratch/` berisi:
- File-file test sementara (verify scripts, test click scripts)
- Profile browser Edge untuk headless testing
- Cache browser (~680MB)

Folder ini **sudah ada di `.gitignore`** dan tidak boleh di-commit ke GitHub.

---

## 10. Hal-Hal yang Harus Dijaga / Tidak Boleh Rusak

> [!WARNING]
> Daftar fitur yang WAJIB tetap berfungsi setelah perubahan apa pun:

1. **Homepage WebGL 3D particles** — Three.js canvas `#archipelago3d` harus tetap render
2. **Semua video hero subpage** harus tetap autoplay dan muted
3. **Film roll frame (Konsep B)** — sprockets, vignette, badge REC berkedip
4. **Sticky note frames** di halaman Services (4 gambar)
5. **Postage stamp frames** di halaman About (3 gambar, rata tengah)
6. **Tombol "Kembali ke Beranda"** di halaman Products — scroll anchor
7. **`prefers-reduced-motion`** — aksesibilitas tetap berjalan
8. **Navigasi antar halaman** — semua link internal harus benar
9. **Internasionalisasi** (`i18n.js`) — dukungan multi-bahasa
10. **Cache-bust version string** — update `?v=spectrum26` kalau CSS berubah

---

## 11. Tips untuk Sesi Baru

1. **Menjalankan dev server**: 
   ```powershell
   cd "d:\absen_app\logo sipnex baru\skool_project\dibsenbestoftheworld\backup-dibsen-180926"
   python -m http.server 4173
   ```
   Lalu buka `http://localhost:4173` di browser.

2. **Setelah mengubah file, commit & push ke GitHub**:
   ```powershell
   git add .
   git commit -m "deskripsi perubahan"
   git push
   ```

3. **Bahasa komunikasi**: User berbahasa Indonesia, santai dan friendly.

4. **Verifikasi setelah perubahan**: Gunakan headless browser (Edge CDP) atau buka manual di browser untuk memastikan tidak ada console error.

