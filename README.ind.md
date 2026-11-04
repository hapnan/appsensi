# Appsensi

[English](./README.md) | **Bahasa Indonesia**

Aplikasi web presensi kelas kampus berbasis *passkey* WebAuthn, penjadwalan ruangan & tanggal sesi kuliah, serta pemantauan daftar hadir mahasiswa secara langsung (*real-time*).

## Fitur Utama

- **Autentikasi Passkey Tanpa Kata Sandi** — Registrasi *passkey* mahasiswa (`/register`) dan *check-in* kehadiran kelas (`/attendance/$roomId`) menggunakan `@simplewebauthn/browser`.
- **Pemilih Ruangan & Tanggal Sesi** — Pemilih ruang kelas dan tanggal interaktif di `/` lengkap dengan pratinjau jadwal kuliah (*default* ruang `H.2.4`).
- **Daftar Hadir Langsung** — Pencarian cepat (`⌘K` / `Ctrl+K`), pengalih sesi untuk ruangan dengan beberapa mata kuliah dalam sehari, serta pembaruan otomatis di latar belakang.

## Teknologi

- **Framework**: [TanStack Start](https://tanstack.com/start), [TanStack Router](https://tanstack.com/router), [TanStack Query](https://tanstack.com/query), React 19, Vite 8
- **API & Validasi**: [tRPC v11](https://trpc.io) (*wrapper* `unstable_localLink` bertipe aman di peramban di atas `appsensi-server`), SuperJSON, Zod v4, T3 Env (`@t3-oss/env-core`)
- **Skema & Seeding Basis Data**: PostgreSQL, [Drizzle ORM](https://orm.drizzle.team) & Drizzle Kit
- **Backend & Autentikasi**: [`@simplewebauthn/browser`](https://simplewebauthn.dev) + [`appsensi-server`](https://github.com/hapnan/appsensi-server) (Go, Gin, GORM, `go-webauthn`)
- **UI & Perkakas**: Tailwind CSS v4, Shadcn UI / Radix UI, Lucide Icons, [Bun](https://bun.sh), [Biome](https://biomejs.dev)

## Dokumentasi

Dokumentasi teknis lengkap, diagram alur, dan spesifikasi arsitektur tersedia di direktori [`docs/`](./docs):

- **[Pusat Dokumentasi](./docs/README.md)** — Indeks lengkap seluruh dokumentasi teknis.
- **[Panduan Arsitektur Sistem](./docs/ARCHITECTURE.md)** — Desain runtime, *asset preloading* di Bun, optimasi performa, dan model keamanan.
- **[Entity Relationship Diagram (ERD)](./docs/ERD.md)** ([Visual SVG](./docs/ERD.svg)) — Kamus data lengkap untuk 11 tabel basis data, pengindeksan UUIDv7, dan aturan relasi cascade.
- **[Diagram Alur Presensi](./docs/Flow_Diagram_Attendance.md)** ([Visual SVG](./docs/Flow_Diagram_Attendance.svg)) — Rangkaian lengkap verifikasi *passkey* dan pencatatan presensi kelas.
- **[Diagram Alur Pendaftaran](./docs/Flow_Diagram_Register.md)** ([Visual SVG](./docs/Flow_Diagram_Register.svg)) — Rangkaian lengkap pendaftaran mahasiswa dan pembuatan kredensial WebAuthn.
- **[Referensi API & Kontrak](./docs/API.md)** — Spesifikasi lengkap seluruh prosedur tRPC dan endpoint pendamping WebAuthn.

## Prasyarat

- **[Bun](https://bun.sh)** `>= 1.0`
- **PostgreSQL 18+** (menggunakan fungsi bawaan `uuidv7()` pada kolom `credentials.id`)
- **[`appsensi-server`](https://github.com/hapnan/appsensi-server)** — Layanan backend berbasis Go (`Gin` + `GORM` + `go-webauthn`) yang berjalan secara *default* di `http://localhost:8080` dengan CORS aktif untuk `http://localhost:3000` (atur `ALLOWED_ORIGINS="http://localhost:3000,http://localhost:4173"` saat menjalankan `bun --bun run preview` di port `4173`):
  - **Endpoint seremoni WebAuthn (dipanggil langsung dari peramban)**:
    - `POST /register/begin` & `POST /register/finish` — Proses registrasi *passkey* (`{ email, username }`, di mana `username` sesuai dengan `students.student_id`, mis. `STU-FCS-001`)
    - `POST /login/begin` & `POST /login/finish` — Proses verifikasi *passkey* (`{ username }`) sebelum mencatat kehadiran melalui `trpc.attendance.checkIn`
  - **Endpoint REST presensi & pendaftaran (dipanggil dari peramban melalui *wrapper* lokal tRPC + Zod)**:
    - `GET /attendance/demo-catalog`, `GET /attendance/roster`, `POST /attendance/check-in`
    - `GET /registration/list`, `POST /registration/link-student`, `POST /registration/cleanup-incomplete`

## Variabel Lingkungan

Buat berkas `.env.local` (atau `.env`) di direktori utama proyek:

```dotenv
VITE_WEBAUTHN_SERVER_URL="http://localhost:8080"
# Hanya diperlukan saat menjalankan skrip CLI Drizzle (db:push, db:migrate, db:seed)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/appsensi"
```

| Variabel | Cakupan | Wajib | Default | Deskripsi |
| :--- | :--- | :---: | :--- | :--- |
| `VITE_WEBAUTHN_SERVER_URL` | Klien | Tidak | `http://localhost:8080` | URL dasar [`appsensi-server`](https://github.com/hapnan/appsensi-server) untuk seremoni WebAuthn dan prosedur tRPC lokal di peramban |
| `DATABASE_URL` | CLI / DB Tools | Untuk `db:*` | — | URL koneksi PostgreSQL untuk migrasi skema & *seeding* Drizzle (`db:push`, `db:migrate`, `db:seed`) |
| `SERVER_URL` | Server | Tidak | — | URL dasar server aplikasi (opsional) |
| `VITE_APP_TITLE` | Klien | Tidak | — | Judul aplikasi kustom (opsional) |
| `PORT` | Server | Tidak | `3000` | Port server produksi Bun (`server.ts`) |
| `HOST` | Server | Tidak | `0.0.0.0` | Alamat *bind* server produksi Bun (`server.ts`) |
| `ASSET_PRELOAD_MAX_SIZE` | Server | Tidak | `5242880` | Ukuran berkas maksimum (dalam *byte*) yang dimuat ke memori (*default* 5 MB) |
| `ASSET_PRELOAD_INCLUDE_PATTERNS` | Server | Tidak | — | Daftar pola *glob* nama berkas yang dipisahkan koma untuk dimuat ke memori |
| `ASSET_PRELOAD_EXCLUDE_PATTERNS` | Server | Tidak | — | Daftar pola *glob* nama berkas yang dikecualikan dari pemuatan memori |
| `ASSET_PRELOAD_VERBOSE_LOGGING` | Server | Tidak | `false` | Menampilkan tabel rincian aset statis saat server dimulai |
| `ASSET_PRELOAD_ENABLE_ETAG` | Server | Tidak | `true` | Mengaktifkan pembuatan ETag dan dukungan respons `304 Not Modified` |
| `ASSET_PRELOAD_ENABLE_GZIP` | Server | Tidak | `true` | Mengaktifkan kompresi Gzip untuk aset statis yang memenuhi syarat |
| `ASSET_PRELOAD_GZIP_MIN_SIZE` | Server | Tidak | `1024` | Ukuran berkas minimum (dalam *byte*) untuk kompresi Gzip |
| `ASSET_PRELOAD_GZIP_MIME_TYPES` | Server | Tidak | `text/,application/javascript,...` | Daftar tipe MIME yang memenuhi syarat untuk kompresi Gzip |

## Mulai Cepat

```bash
# 1. Instal dependensi
bun install

# 2. Terapkan skema Drizzle ke PostgreSQL
bun run db:push

# 3. Isi data awal gedung (A–I), ruang kelas, 6 fakultas, 60 mata kuliah, jadwal, dan 60 mahasiswa demo
bun run db:seed

# 4. Pastikan appsensi-server berjalan di http://localhost:8080, lalu jalankan server pengembangan
bun --bun run dev
```

Buka `http://localhost:3000` di peramban:

- `/` — Pilih ruang kelas dan tanggal sesi kuliah (*default* ruang `H.2.4` hari ini).
- `/register` — Daftarkan *passkey* untuk mahasiswa (`student_id` sebagai *username*).
- `/attendance/h.2.4` — Verifikasi *passkey* mahasiswa untuk mencatat kehadiran.

## Skrip yang Tersedia

| Perintah | Deskripsi |
| :--- | :--- |
| `bun --bun run dev` | Menjalankan server pengembangan Vite pada port `3000` |
| `bun --bun run build` | Membangun aplikasi untuk lingkungan produksi |
| `bun run start` | Menjalankan server produksi Bun (`server.ts`) |
| `bun --bun run preview` | Menjalankan pratinjau hasil *build* produksi secara lokal |
| `bun run generate-routes` | Memperbarui pohon rute TanStack Router (`tsr generate`) |
| `bun test` | Menjalankan pengujian unit dan integrasi *wrapper* tRPC-ke-REST |
| `bun --bun run check` | Menjalankan pemeriksaan pemformatan dan *linting* Biome |
| `bun --bun run lint` | Menjalankan *linter* Biome |
| `bun --bun run format` | Memformat berkas kode sumber menggunakan Biome |
| `bun run db:push` | Mendorong skema `src/db/schema.ts` langsung ke PostgreSQL |
| `bun run db:generate` | Menghasilkan berkas migrasi SQL menggunakan Drizzle Kit |
| `bun run db:migrate` | Menjalankan migrasi Drizzle yang telah dibuat |
| `bun run db:pull` | Mengambil (*introspect*) skema dari PostgreSQL |
| `bun run db:studio` | Membuka Drizzle Studio untuk menjelajahi tabel basis data |
| `bun run db:seed` | Mengisi data awal gedung, ruangan, mata kuliah, jadwal, dan mahasiswa demo |
