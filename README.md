# 📋 Absensi QR — Absensi Kegiatan Berbasis QR Code

Aplikasi web absensi untuk **acara formal** (seminar, pelantikan, wisuda, gala dinner) dan **rapat**.
Bisa dipakai di banyak perangkat sekaligus dengan data yang tersinkron **realtime**, dan **gratis** di-hosting
dengan **GitHub Pages** + **Supabase**.

> Tanpa proses build: cukup HTML + JavaScript modern. Upload ke GitHub, isi konfigurasi, langsung jalan.

---

## ✨ Fitur

| Kategori | Fitur |
|---|---|
| **Dua mode absensi** | 🎫 **QR Peserta**: setiap peserta punya e-ticket QR unik dan panitia memindai di pintu masuk.<br>🖥️ **QR Acara**: satu QR tampil di layar, peserta memindai lalu mengisi formulir di HP sendiri. |
| **Kustomisasi** | Nama acara, logo, banner, 4 warna tema, 8 pilihan font, kategori peserta berwarna (VIP, Undangan, dll.) |
| **Form builder** | Tambah, hapus, dan urutkan field (drag & drop). Tipe: teks, paragraf, angka, email, no. HP, tanggal, dropdown, pilihan ganda, centang, **tanda tangan digital**, **foto** |
| **Template** | 4 template bawaan (Rapat, Seminar, Formal, Kosong) dan bisa menyimpan template sendiri |
| **Multi-device** | Undang operator dengan kode/QR/link. Semua perangkat bisa scan bersamaan dan **anti-duplikat** di level database |
| **Realtime** | Jumlah hadir, daftar terakhir masuk, layar sambutan, dan laporan ter-update otomatis tanpa refresh |
| **Scanner cepat** | Kamera HP/laptop, **scanner barcode USB/Bluetooth**, pencarian manual, layar hijau/kuning/merah + bunyi + getar |
| **Offline** | Scan tetap jalan saat internet putus, lalu disinkronkan otomatis saat online kembali |
| **Anti titip absen** | QR acara bisa berganti tiap X detik, dibatasi 1 kali per perangkat, dan dicegah ganda berdasarkan NIP/email |
| **Peserta** | Input manual, import Excel/CSV, e-ticket PNG, unduh semua e-ticket (ZIP), kirim via WhatsApp/email |
| **Desain kartu** | Kartu potret/lanskap, pilih data peserta yang dicetak (NIM, fakultas, dll.), foto peserta, teks tambahan, cetak semua kartu ke PDF A4 |
| **Layar tampilan** | Mode kiosk/proyektor: QR besar, jumlah hadir raksasa, "Selamat datang, [nama]!" |
| **Laporan** | Statistik, grafik kedatangan per jam, per kategori, per meja dan per operator. Ekspor **Excel**, **CSV**, **PDF** (dengan kop logo & tanda tangan) |
| **Lainnya** | PWA (bisa di-install di HP), mode gelap, Bahasa Indonesia, responsif |

---

## 🚀 Cara Memasang (± 15 menit)

### Langkah 1 — Buat database di Supabase (gratis)

1. Daftar/masuk di **https://supabase.com** → **New project**.
   Isi nama project dan password database, lalu pilih region terdekat (mis. *Southeast Asia (Singapore)*).
2. Setelah project siap, buka menu **SQL Editor** → **New query**.
3. Buka file [`supabase/schema.sql`](supabase/schema.sql), **salin semua isinya**, tempel, lalu klik **Run**.
   Harus muncul *Success. No rows returned*.
   Skrip ini membuat tabel, keamanan (RLS), fungsi, realtime, dan storage logo sekaligus.
4. Buka **Project Settings → API**, lalu catat:
   - **Project URL**, mis. `https://abcdxyz.supabase.co`
   - **anon public key** (atau **Publishable key**)

> ⚠️ Jangan pernah memakai **service_role / secret key** di aplikasi ini.

### Langkah 2 — Atur login (Authentication)

Di Supabase: **Authentication → URL Configuration**
- **Site URL**: `https://USERNAME.github.io/NAMA-REPO/`
- **Redirect URLs**: tambahkan juga `https://USERNAME.github.io/NAMA-REPO/**`

Opsional, agar uji coba lebih cepat: **Authentication → Sign In / Providers → Email**, matikan
**Confirm email** supaya akun baru langsung bisa dipakai tanpa konfirmasi email.

### Langkah 3 — Upload ke GitHub

1. Buat repository baru di GitHub (Public), mis. `absensi-qr`.
2. Upload semua file proyek ini (atau `git push`):
   ```bash
   git init
   git add .
   git commit -m "Absensi QR"
   git branch -M main
   git remote add origin https://github.com/USERNAME/absensi-qr.git
   git push -u origin main
   ```

### Langkah 4 — Isi konfigurasi (pilih salah satu)

**Cara A: GitHub Secrets (disarankan)**
Repository → **Settings → Secrets and variables → Actions → New repository secret**:
- `SUPABASE_URL` = Project URL
- `SUPABASE_ANON_KEY` = anon / publishable key

(Opsional) Tab **Variables** → `APP_NAME` = nama aplikasi Anda.

**Cara B: Edit langsung `config.js`**
```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://abcdxyz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',
  APP_NAME: 'Absensi Kantor',
};
```

### Langkah 5 — Aktifkan GitHub Pages

Repository → **Settings → Pages** → **Source: GitHub Actions**.
Lalu buka tab **Actions** dan tunggu workflow *Deploy ke GitHub Pages* selesai (✓ hijau).
Aplikasi bisa diakses di `https://USERNAME.github.io/absensi-qr/` 🎉

Setiap kali Anda push ke `main`, aplikasi otomatis ter-update.

---

## 📖 Cara Pakai

### A. Acara formal / undangan (mode QR Peserta)
1. **Buat acara** → pilih template *Acara Formal* atau *Seminar*.
2. Tab **Tampilan**: upload logo, atur warna & font (ada pratinjau langsung).
3. Tab **Formulir**: atur kolom data peserta (jabatan, instansi, no. meja, dll.).
4. Tab **Peserta**: tambah manual atau **Import Excel** (unduh templatenya dulu).
5. Bagikan e-ticket: tombol 🎫 per peserta (PNG / link / WhatsApp), atau **Semua e-ticket (ZIP)**.
6. Tab **Operator**: bagikan kode undangan ke panitia lain.
7. Hari-H: tiap meja registrasi buka **📷 Scanner**, isi nama perangkat ("Meja 1", "Pintu Utara"), lalu tekan **Mulai scan**.
8. Pasang **🖥️ Layar tampilan** di proyektor untuk ucapan selamat datang realtime.

### B. Rapat (mode QR Acara)
1. **Buat acara** → template *Rapat Internal* (sudah ada field NIP, jabatan, tanda tangan).
2. Buka **🖥️ Layar tampilan** di proyektor/TV. QR akan berganti otomatis tiap 30 detik.
3. Peserta memindai QR dengan kamera HP, mengisi formulir, lalu kirim. Selesai.
4. Setelah rapat: **📊 Laporan → PDF**, daftar hadir lengkap dengan tanda tangan siap dicetak.

### Tips mempercepat antrean
- Pakai **beberapa perangkat scanner** sekaligus (HP panitia mana pun bisa jadi scanner).
- **Scanner barcode USB/Bluetooth** (± Rp150 rb) jauh lebih cepat dari kamera. Colok ke laptop dan langsung scan di halaman Scanner.
- Kecilkan *Lama tampilan hasil scan* di **Pengaturan** (mis. 1200 ms).
- Buka halaman scanner sebelum acara dimulai supaya data peserta tersimpan di perangkat, jadi tetap bisa scan walau internet putus.

---

## 🗂️ Struktur Proyek

```
absensi-qr/
├── index.html                 # Halaman utama (SPA)
├── config.js                  # Konfigurasi Supabase
├── sw.js / manifest.webmanifest  # PWA & cache offline
├── css/app.css                # Semua gaya tampilan
├── assets/                    # Ikon aplikasi
├── js/
│   ├── main.js                # Router & layout
│   ├── lib/
│   │   ├── api.js             # Semua akses Supabase (data, RPC, realtime, storage)
│   │   ├── ui.js              # Helper DOM, modal, toast, format tanggal
│   │   ├── theme.js           # Tema, font, template bawaan
│   │   ├── form.js            # Renderer formulir dinamis
│   │   ├── qr.js              # Generator QR & e-ticket
│   │   ├── offline.js         # Antrean offline (IndexedDB)
│   │   ├── exporter.js        # Ekspor Excel/CSV/PDF
│   │   └── vendor.js          # Pemuat library dari CDN
│   ├── components/
│   │   ├── form-builder.js    # Penyusun formulir drag & drop
│   │   └── participants.js    # Manajemen peserta
│   └── pages/                 # login, dashboard, editor, scanner, display, report, public-form, ticket, join
├── supabase/schema.sql        # Skema database lengkap
└── .github/workflows/deploy.yml  # Deploy otomatis ke GitHub Pages
```

---

## 🔒 Keamanan

- Semua tabel dilindungi **Row Level Security**: pengguna hanya bisa melihat acara tempat ia menjadi anggota.
- Peran: **Pemilik** (semua akses), **Admin** (ubah acara & peserta), **Operator scan** (hanya scan, layar, dan laporan).
- Check-in lewat fungsi database `check_in` yang **atomik**, jadi dua perangkat yang memindai orang yang sama di detik yang sama tetap tercatat satu kali.
- Formulir publik lewat fungsi `submit_public_attendance` yang memvalidasi kode QR, jam buka/tutup, field wajib, dan duplikat, tanpa membuka tabel ke publik.
- Token QR peserta berupa string acak 32 karakter (tidak bisa ditebak). Jika bocor: **Peserta → ⋯ → Buat ulang semua QR**.

---

## ❓ FAQ & Kendala

**Kamera tidak menyala?**
Kamera browser hanya jalan di **HTTPS** (GitHub Pages sudah HTTPS) atau `localhost`. Izinkan akses kamera saat diminta.
Di iPhone gunakan Safari, di Android gunakan Chrome.

**Muncul "Konfigurasi belum diisi"?**
`config.js` masih kosong. Isi sesuai Langkah 4, atau cek apakah GitHub Secrets sudah benar lalu jalankan ulang workflow.

**Login berhasil tapi diarahkan ke localhost / halaman salah?**
Periksa **Site URL** & **Redirect URLs** di Supabase (Langkah 2).

**Project Supabase "paused"?**
Project gratis akan di-pause jika tidak dipakai ± 1 minggu. Buka dashboard Supabase lalu klik **Restore**.
Buka aplikasi beberapa hari sebelum acara untuk memastikan semuanya aktif.

**Kapasitas gratis cukup?**
Supabase free tier: database 500 MB, storage 1 GB, 200 koneksi realtime bersamaan. Itu cukup untuk ribuan peserta per acara.
Tanda tangan disimpan sebagai gambar kecil (± 5–15 KB).

**Mencoba di komputer sendiri?**
```bash
python3 -m http.server 8080
# buka http://localhost:8080
```
(Tambahkan `http://localhost:8080/**` ke Redirect URLs di Supabase.)

**Ingin memindahkan library CDN ke server sendiri?**
Unduh file library, lalu timpa URL-nya di `config.js`:
```js
window.APP_CDN = { supabase: './vendor/supabase.js', /* ... */ };
```
Daftar lengkap ada di `js/lib/vendor.js`.

---

## 🧩 Teknologi

- Frontend: HTML, CSS, JavaScript ES Modules (tanpa framework & tanpa build)
- Backend: [Supabase](https://supabase.com) (PostgreSQL, Auth, Realtime, Storage)
- Library (dimuat dari CDN saat dibutuhkan): supabase-js, qrcode-generator, html5-qrcode, SheetJS, jsPDF + AutoTable, JSZip, SortableJS
- Hosting: GitHub Pages + GitHub Actions

Lisensi: MIT. Bebas dipakai dan dimodifikasi.
