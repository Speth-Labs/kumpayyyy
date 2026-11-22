# Smart Waste Web — Waste 2 Public

Portal warga, PHP REST API, skema MySQL, dan dokumentasi ERD untuk Smart Waste. Web dan aplikasi Android menggunakan REST API yang sama; aplikasi tidak terhubung langsung ke MySQL.

## Isi proyek

- `frontend/` — portal warga.
- `backend-php/` — REST API PHP dan migrasi skema.
- `database/schema.sql` — skema kosong untuk instalasi baru.
- `database/ERD.md` dan `docs/` — ERD, kontrak API, dan panduan proyek.

Dump database berisi akun/laporan dan berkas foto warga tidak disertakan. Unggahan baru disimpan lokal di `backend-php/uploads/`; jangan commit berkas tersebut.

## Menjalankan lokal dengan XAMPP

1. Tempatkan folder ini sebagai `htdocs/Waste2` agar URL API `/Waste2/backend-php/index.php` pada frontend sesuai.
2. Jalankan Apache dan MySQL dari XAMPP. Sesuaikan port API melalui `backend-php/.env` jika MySQL tidak berjalan di port contoh.
3. Salin `backend-php/.env.example` menjadi `backend-php/.env`, lalu isi host, port, nama database, user, dan password MySQL lokal. Jangan commit `.env`.
4. Buat database `smart_waste` dan impor `database/schema.sql`, atau biarkan migrasi API menyiapkan skema saat pertama kali dipanggil.
5. Buka `http://localhost:8080/Waste2/frontend/` (sesuaikan port Apache bila berbeda).
6. Periksa koneksi API di `http://localhost:8080/Waste2/backend-php/index.php/health`.

Gunakan user database khusus dengan password kuat di luar lingkungan demo. Jangan membuka port MySQL ke internet; klien web dan Android harus memakai API PHP.
