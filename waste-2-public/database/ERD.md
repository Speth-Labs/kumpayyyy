# ERD Terpadu Smart Waste

Dokumen ini menggambarkan satu alur data yang dipakai portal web warga dan aplikasi Android Admin/Petugas. Kedua client mengakses REST API PHP yang sama; keduanya tidak membuka koneksi MySQL secara langsung.

## Arsitektur akses data

```mermaid
flowchart LR
    web["Web warga: frontend"] -->|REST API| api["PHP REST API: backend-php/index.php"]
    android["Android Admin dan Petugas"] -->|REST API| api
    api -->|SQL baca dan tulis| db["MySQL: smart_waste"]
    api -->|Foto dan bukti kerja| uploads["Berkas: backend-php/uploads"]
```

Contohnya, warga membuat laporan dari web lalu laporan yang sama dibaca dan diproses Admin/Petugas dari aplikasi Android. Perubahan status, foto bukti, dan arsip disimpan melalui API ke database bersama.

## ERD database bersama

```mermaid
erDiagram
    users["users"] {
        bigint id PK
        varchar username UK
        varchar nama
        varchar email
        varchar role
        varchar foto_profil
        boolean aktif
    }
    adminProfile["admin"] {
        bigint id_admin PK
        bigint user_id UK
        varchar nama_admin
        varchar email
        boolean aktif
    }
    petugas["petugas"] {
        bigint id PK
        bigint user_id UK
        varchar nama
        varchar zona_tugas
        boolean status_aktif
        datetime diarsipkan_pada
    }
    authTokens["auth_tokens"] {
        bigint id PK
        bigint user_id
        char token_hash UK
        datetime expires_at
    }
    loginAttempts["auth_login_attempts"] {
        bigint id PK
        char identity_hash
        datetime attempted_at
    }
    googleChallenges["google_login_challenges"] {
        char nonce_hash PK
        datetime expires_at
    }
    sampah["sampah"] {
        bigint id PK
        varchar kode_laporan UK
        bigint id_user
        bigint petugas_id
        bigint kendaraan_id
        bigint tpa_id
        varchar jenis
        decimal berat_kg
        varchar status
        varchar foto
        varchar foto_bukti_lokasi
    }
    riwayatStatus["riwayat_status"] {
        bigint id PK
        bigint sampah_id
        bigint diubah_oleh
        varchar status
        varchar catatan
        datetime dibuat_pada
    }
    buktiSelesai["konfirmasi_penyelesaian"] {
        bigint id PK
        bigint sampah_id UK
        bigint petugas_id
        varchar foto_bukti
        varchar status
        bigint direview_oleh
    }
    laporanArsip["laporan_arsip"] {
        bigint sampah_id PK
        bigint diarsipkan_oleh
        datetime diarsipkan_pada
    }
    catatanArsip["catatan_admin_arsip"] {
        bigint sampah_id PK
        bigint diarsipkan_oleh
        datetime diarsipkan_pada
    }
    arsipPetugas["petugas_laporan_arsip"] {
        bigint sampah_id PK
        bigint user_id PK
        datetime diarsipkan_pada
    }
    kendaraan["kendaraan"] {
        bigint id PK
        varchar plat_nomor UK
        decimal kapasitas_kg
        decimal muatan_kg
        varchar kondisi
    }
    perbaikan["kendaraan_perbaikan"] {
        bigint id PK
        bigint kendaraan_id
        bigint petugas_user_id
        varchar penyebab
        varchar status
        bigint disetujui_oleh
    }
    riwayatPerbaikan["kendaraan_perbaikan_riwayat"] {
        bigint id PK
        bigint perbaikan_id
        bigint actor_user_id
        varchar aksi
        datetime dibuat_pada
    }
    tpa["tpa"] {
        bigint id PK
        varchar nama
        decimal kapasitas_ton
        decimal terisi_ton
    }
    pengosongan["permintaan_pengosongan"] {
        bigint id PK
        varchar jenis_target
        bigint target_id
        bigint diminta_oleh
        bigint ditinjau_oleh
        varchar status
    }
    laporanHarian["laporan_harian"] {
        bigint id PK
        date tanggal
        int total_sampah
        decimal total_berat_kg
    }
    schemaVersion["smartwaste_schema_version"] {
        int version PK
        datetime applied_at
    }

    users ||..o| adminProfile : akun_admin
    users o|..o| petugas : akun_petugas
    users ||..o{ authTokens : sesi
    users o|..o{ sampah : pelapor
    users o|..o{ riwayatStatus : mengubah_status
    users ||..o{ laporanArsip : mengarsipkan
    users ||..o{ catatanArsip : membuat_catatan_arsip
    users ||..o{ arsipPetugas : mengarsipkan_tugas
    users ||..o{ perbaikan : melaporkan_perbaikan
    users o|..o{ perbaikan : menyetujui_perbaikan
    users o|..o{ riwayatPerbaikan : melakukan_aksi
    users ||..o{ pengosongan : mengajukan
    users o|..o{ pengosongan : meninjau
    petugas o|..o{ sampah : menangani
    petugas o|..o{ buktiSelesai : mengirim_bukti
    kendaraan o|..o{ sampah : kendaraan_tugas
    kendaraan ||..o{ perbaikan : memiliki_perbaikan
    tpa o|..o{ sampah : tujuan_laporan
    sampah ||..o{ riwayatStatus : memiliki_riwayat
    sampah ||..o| buktiSelesai : memiliki_bukti_akhir
    sampah ||..o| laporanArsip : memiliki_arsip_admin
    sampah ||..o| catatanArsip : memiliki_catatan_arsip
    sampah ||..o{ arsipPetugas : memiliki_arsip_petugas
    perbaikan ||..o{ riwayatPerbaikan : memiliki_riwayat
```

Diagram memuat **19 tabel** sesuai `database/schema.sql`. Garis putus-putus menunjukkan relasi logis berdasarkan kolom ID yang digunakan API. Skema MySQL aktif saat ini belum memasang constraint foreign key fisik; API yang mengelola pemeriksaan dan perubahan relasi.

## Akses data per platform

| Bagian | Data utama yang digunakan melalui API | Tugas |
|---|---|---|
| Web warga | `users`, `sampah`, `riwayat_status`, `konfirmasi_penyelesaian` | Daftar akun warga, kirim laporan/foto awal, pantau status dan bukti petugas. |
| Android Admin | `users`, `admin`, `petugas`, `sampah`, tabel arsip, `kendaraan`, tabel perbaikan, `tpa`, `permintaan_pengosongan`, `laporan_harian` | Kelola akun/operasional, verifikasi laporan dan bukti, persetujuan, arsip, kapasitas, dan statistik. |
| Android Petugas | `users`, `petugas`, `sampah`, `riwayat_status`, `konfirmasi_penyelesaian`, `petugas_laporan_arsip`, `kendaraan`, tabel perbaikan, `tpa`, `permintaan_pengosongan` | Terima tugas, ubah progres, kirim bukti lokasi/penyelesaian, dan kelola pekerjaan lapangan. |
| API bersama | `auth_tokens`, `auth_login_attempts`, `google_login_challenges`, serta seluruh tabel domain | Autentikasi, validasi peran, dan satu pintu baca/tulis untuk kedua client. |

Pemetaan ini menunjukkan akses fitur melalui API, bukan izin client untuk membaca tabel langsung.

## Relasi khusus dan penyimpanan foto

- `permintaan_pengosongan.jenis_target` menentukan arti `target_id`: ID tersebut merujuk ke `kendaraan.id` atau `tpa.id`. Relasi ini polimorfik sehingga tidak digambar sebagai foreign key langsung.
- `petugas.user_id` menghubungkan profil petugas ke akun pada `users`; kolom dapat kosong untuk profil yang belum punya akun.
- Foto laporan dan bukti disimpan sebagai berkas di `backend-php/uploads/`. Database menyimpan path pada kolom foto, bukan menyimpan gambar sebagai BLOB.
- `laporan_harian` adalah tabel rekap, sedangkan `smartwaste_schema_version` mencatat versi migrasi. Keduanya tidak memiliki relasi ID ke laporan individual.

## Berkas sumber

- Struktur tabel: [`schema.sql`](schema.sql) dan [`backend-php/database/schema.sql`](../backend-php/database/schema.sql).
- Snapshot data lokal: [`smart_waste.sql`](smart_waste.sql). Berisi data akun/laporan; jaga tetap pribadi dan jangan commit ke repositori publik.
