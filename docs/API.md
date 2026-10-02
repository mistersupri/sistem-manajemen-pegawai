# REST API

Semua endpoint aplikasi ada di `/api/v1`. Antarmuka web memakai API yang sama, jadi semua aturan izin, cakupan unit, audit, dan validasi berlaku sama untuk klien lain.

## Autentikasi

1. `POST /api/v1/auth/login` dengan `{"username": "...", "password": "..."}`. Respons: `{"mfaRequired": false, "mustChangePassword": false, "isAdmin": true}` dan cookie `simpeg_session` (httpOnly, SameSite=Lax, Secure di produksi).
2. Bila `mfaRequired` bernilai `true`, kirim `POST /api/v1/auth/mfa` dengan `{"code": "123456"}` memakai cookie yang sama.
3. `POST /api/v1/auth/logout` mengakhiri sesi.

Token sesi hanya ada di cookie; database menyimpan hash SHA-256-nya. Akun dikunci 15 menit setelah 5 kali gagal. Percobaan login juga dibatasi per username (10 per 5 menit) dan per IP (300 per 5 menit).

## Aturan umum

- **CSRF**: permintaan selain GET/HEAD/OPTIONS wajib membawa header `Origin` yang sama dengan host aplikasi. Peramban mengirimnya otomatis; klien lain harus menambahkannya.
- **Izin**: kolom "Izin" di tabel di bawah adalah izin minimal. Data di luar cakupan unit pengguna dijawab `404` (bukan `403`) agar keberadaan data tidak bocor.
- **Format galat** seragam:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Periksa kembali isian yang ditandai.", "fields": { "email": "Email tidak valid" } } }
  ```
  Kode: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `LOCKED` (423), `VALIDATION_ERROR` (422), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).
- **Pagination**: `?page=1&pageSize=25` (maksimal 100 atau 200 tergantung endpoint). Respons daftar: `{ "total", "page", "pageSize", "rows" }`.
- **Idempotensi**: transaksi absensi wajah/kiosk/dinas luar wajib membawa `idempotencyKey` (8 sampai 100 karakter, unik per percobaan). Mengirim ulang kunci yang sama oleh pengguna yang sama mengembalikan hasil pertama; dipakai pengguna lain dijawab `409`.
- **Waktu**: semua instan dalam ISO 8601 UTC; tanggal kerja `YYYY-MM-DD` dan jam `HH:MM` mengikuti zona waktu instansi (atau unit). `GET /api/v1/time` memberi waktu server untuk tampilan jam.
- **Data sensitif**: secret perangkat, template wajah, NIK, dan secret MFA tidak pernah dikirim ke klien. NIK hanya muncul bila pengguna punya `employee.read_sensitive` dan setiap ekspor ber-NIK tercatat di audit log.
- **Unduhan** (ekspor, template, lampiran, foto) dijawab sebagai berkas dengan `Cache-Control: private, no-store`.

## Endpoint

Tabel ini dibuat dari berkas `src/app/api/**/route.ts`.

| Metode | Path | Izin |
|---|---|---|
| GET | `/api/health` | publik |
| POST | `/api/v1/absen/{token}` | publik, token titik absen |
| POST | `/api/v1/absen/{token}/dinas-luar` | publik, token titik absen yang melayani dinas luar |
| GET | `/api/v1/attendance/export` | attendance.export (`format=kalender&month=YYYY-MM` untuk Excel kalender) |
| POST | `/api/v1/attendance/face` | attendance.self |
| POST | `/api/v1/attendance/field-duty` | attendance.self |
| POST | `/api/v1/attendance/kiosk` | kiosk.operate |
| POST | `/api/v1/attendance/manual` | attendance.manual_entry |
| GET | `/api/v1/attendance/photo/{id}` | login |
| POST | `/api/v1/attendance/recalculate` | attendance.recalculate |
| GET | `/api/v1/attendance/records` | attendance.report |
| GET | `/api/v1/attendance/trace` | attendance.monitor atau attendance.self |
| GET | `/api/v1/audit` | audit.read |
| POST | `/api/v1/auth/login` | publik |
| POST | `/api/v1/auth/logout` | publik |
| POST | `/api/v1/auth/mfa` | publik |
| POST | `/api/v1/biometrics/{id}/verify` | biometric.manage |
| GET | `/api/v1/corrections` | correction.request atau correction.review |
| POST | `/api/v1/corrections` | correction.request |
| POST | `/api/v1/corrections/admin` | correction.review |
| GET | `/api/v1/corrections/{id}` | correction.request atau correction.review |
| GET | `/api/v1/corrections/{id}/attachment` | correction.request atau correction.review |
| POST | `/api/v1/corrections/{id}/cancel` | correction.request |
| POST | `/api/v1/corrections/{id}/review` | correction.review |
| GET | `/api/v1/dashboard` | dashboard.view atau attendance.self |
| GET | `/api/v1/devices` | device.read |
| POST | `/api/v1/devices` | device.manage |
| GET | `/api/v1/devices/adapters` | device.read |
| POST | `/api/v1/devices/import` | device.sync |
| POST | `/api/v1/devices/map-pin` | employee.write atau device.manage |
| GET | `/api/v1/devices/raw` | device.read |
| POST | `/api/v1/devices/runs/{id}/retry` | device.sync |
| GET | `/api/v1/devices/unmatched` | device.read |
| GET | `/api/v1/devices/{id}` | device.read |
| PATCH | `/api/v1/devices/{id}` | device.manage |
| DELETE | `/api/v1/devices/{id}` | device.manage |
| POST | `/api/v1/devices/{id}/reconcile` | device.sync |
| POST | `/api/v1/devices/{id}/status` | device.manage |
| POST | `/api/v1/devices/{id}/sync` | device.sync |
| POST | `/api/v1/devices/{id}/test` | device.sync |
| GET | `/api/v1/employees` | employee.read |
| POST | `/api/v1/employees` | employee.write |
| GET | `/api/v1/employees/export` | employee.export |
| POST | `/api/v1/employees/import/commit` | employee.import |
| POST | `/api/v1/employees/import/preview` | employee.import |
| GET | `/api/v1/employees/import/{token}` | employee.import |
| GET | `/api/v1/employees/template` | employee.import |
| GET | `/api/v1/employees/{id}` | employee.read |
| PATCH | `/api/v1/employees/{id}` | employee.write |
| POST | `/api/v1/employees/{id}/account` | employee.write |
| GET | `/api/v1/employees/{id}/face` | login |
| POST | `/api/v1/employees/{id}/face` | biometric.manage atau biometric.enroll_self |
| DELETE | `/api/v1/employees/{id}/face` | biometric.manage |
| POST | `/api/v1/employees/{id}/reset-password` | employee.write |
| POST | `/api/v1/employees/{id}/status` | employee.deactivate |
| GET | `/api/v1/holidays` | schedule.read atau attendance.self |
| POST | `/api/v1/holidays` | schedule.manage |
| PATCH | `/api/v1/holidays/{id}` | schedule.manage (`{ disabled }`) |
| DELETE | `/api/v1/holidays/{id}` | schedule.manage |
| POST | `/api/v1/holidays/import` | schedule.manage (multipart `file` .ics/.csv, `year`) |
| POST | `/api/v1/holidays/sync` | schedule.manage, cakupan seluruh unit (`{ year }`) |
| GET | `/api/v1/leave` | leave.request atau leave.approve atau leave.manage |
| POST | `/api/v1/leave` | leave.request |
| GET | `/api/v1/leave/balances` | leave.manage atau leave.request |
| PUT | `/api/v1/leave/balances` | leave.manage |
| POST | `/api/v1/leave/balances/generate` | leave.manage |
| GET | `/api/v1/leave/calendar` | leave.request atau leave.approve atau leave.manage |
| GET | `/api/v1/leave/types` | login (cakupan dicek di layanan) |
| POST | `/api/v1/leave/types` | leave.manage |
| PATCH | `/api/v1/leave/types/{id}` | leave.manage |
| GET | `/api/v1/leave/{id}` | login |
| GET | `/api/v1/leave/{id}/attachment` | login |
| POST | `/api/v1/leave/{id}/cancel` | login |
| POST | `/api/v1/leave/{id}/decision` | leave.approve atau leave.manage |
| GET | `/api/v1/logo` | publik |
| POST | `/api/v1/logo` | settings.manage |
| DELETE | `/api/v1/logo` | settings.manage |
| POST | `/api/v1/me/mfa` | login |
| POST | `/api/v1/me/password` | login |
| GET | `/api/v1/notifications` | login (cakupan dicek di layanan) |
| POST | `/api/v1/notifications/read` | login (cakupan dicek di layanan) |
| GET | `/api/v1/roles` | user.manage atau role.manage |
| POST | `/api/v1/roles` | role.manage |
| PUT | `/api/v1/roles/{id}/permissions` | role.manage |
| GET | `/api/v1/schedules` | schedule.read atau attendance.self |
| POST | `/api/v1/schedules` | schedule.manage |
| GET | `/api/v1/schedules/assignments` | schedule.read |
| POST | `/api/v1/schedules/assignments` | schedule.manage |
| POST | `/api/v1/schedules/assignments/bulk` | schedule.manage |
| PATCH | `/api/v1/schedules/assignments/{id}` | schedule.manage |
| GET | `/api/v1/schedules/grid` | schedule.read |
| PUT | `/api/v1/schedules/grid` | schedule.manage |
| GET | `/api/v1/schedules/{id}` | schedule.read |
| PATCH | `/api/v1/schedules/{id}` | schedule.manage |
| POST | `/api/v1/schedules/{id}/status` | schedule.manage |
| GET | `/api/v1/settings` | settings.manage |
| PATCH | `/api/v1/settings` | settings.manage |
| GET | `/api/v1/stations` | device.read |
| POST | `/api/v1/stations` | device.manage |
| PATCH | `/api/v1/stations/{id}` | device.manage |
| DELETE | `/api/v1/stations/{id}` | device.manage (hanya bila belum ada transaksi) |
| POST | `/api/v1/stations/{id}/token` | device.manage |
| GET | `/api/v1/time` | publik |
| GET | `/api/v1/units` | unit.read atau unit.manage |
| POST | `/api/v1/units` | unit.manage |
| PATCH | `/api/v1/units/{id}` | unit.manage |
| DELETE | `/api/v1/units/{id}` | unit.manage |
| GET | `/api/v1/users` | user.manage |
| POST | `/api/v1/users` | user.manage |
| POST | `/api/v1/users/{id}/reset-mfa` | user.manage |
| POST | `/api/v1/users/{id}/reset-password` | user.manage |
| POST | `/api/v1/users/{id}/roles` | user.manage |
| DELETE | `/api/v1/users/{id}/roles/{urId}` | user.manage |
| POST | `/api/v1/users/{id}/status` | user.manage |
