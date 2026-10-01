const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Pakai SQLite bawaan Node.js (node:sqlite) agar tidak perlu kompilasi modul native
// (Visual Studio / build tools) saat npm install. Sembunyikan peringatan "experimental".
const emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...args) {
  if (String(warning && warning.message ? warning.message : warning).includes('SQLite')) return;
  return emitWarning.call(this, warning, ...args);
};
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = emitWarning;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'absensi.db');
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

// Cache prepared statement agar pemanggilan berulang tetap cepat.
const stmtCache = new Map();
const rawPrepare = db.prepare.bind(db);
db.prepare = (sql) => {
  let st = stmtCache.get(sql);
  if (!st) {
    st = rawPrepare(sql);
    stmtCache.set(sql, st);
  }
  return st;
};

// db.transaction(fn) -> fungsi yang menjalankan fn di dalam transaksi (mendukung transaksi bersarang).
let txDepth = 0;
db.transaction = (fn) => (...args) => {
  const sp = `sp${txDepth}`;
  db.exec(txDepth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
  txDepth++;
  try {
    const result = fn(...args);
    txDepth--;
    db.exec(txDepth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return result;
  } catch (err) {
    txDepth--;
    db.exec(txDepth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
    throw err;
  }
};

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  jam_masuk TEXT NOT NULL,
  jam_pulang TEXT NOT NULL,
  toleransi_menit INTEGER NOT NULL DEFAULT 0,
  warna TEXT NOT NULL DEFAULT '#0d6efd',
  aktif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nip TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  jenis_kelamin TEXT,
  jabatan TEXT,
  unit_kerja TEXT,
  email TEXT,
  telepon TEXT,
  alamat TEXT,
  tanggal_masuk TEXT,
  status TEXT NOT NULL DEFAULT 'aktif',
  default_shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  face_descriptors TEXT,
  face_photo TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','pegawai')),
  employee_id INTEGER UNIQUE REFERENCES employees(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shift_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tanggal TEXT NOT NULL,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE CASCADE,
  UNIQUE (employee_id, tanggal)
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tanggal TEXT NOT NULL,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  jam_masuk TEXT,
  jam_pulang TEXT,
  status TEXT NOT NULL DEFAULT 'hadir',
  terlambat_menit INTEGER NOT NULL DEFAULT 0,
  pulang_cepat_menit INTEGER NOT NULL DEFAULT 0,
  dispensasi INTEGER NOT NULL DEFAULT 0,
  metode_masuk TEXT,
  metode_pulang TEXT,
  foto_masuk TEXT,
  foto_pulang TEXT,
  lat_masuk REAL, lng_masuk REAL, alamat_masuk TEXT,
  lat_pulang REAL, lng_pulang REAL, alamat_pulang TEXT,
  skor_wajah_masuk REAL,
  skor_wajah_pulang REAL,
  keterangan TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (employee_id, tanggal)
);

CREATE TABLE IF NOT EXISTS clarifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  tanggal TEXT NOT NULL,
  jenis TEXT NOT NULL,
  jam_masuk_usulan TEXT,
  jam_pulang_usulan TEXT,
  alasan TEXT NOT NULL,
  lampiran TEXT,
  status TEXT NOT NULL DEFAULT 'menunggu',
  catatan_admin TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_attendance_tanggal ON attendance(tanggal);
CREATE INDEX IF NOT EXISTS idx_schedule_tanggal ON shift_schedules(tanggal);
CREATE INDEX IF NOT EXISTS idx_clarif_status ON clarifications(status);
`);

const DEFAULT_SETTINGS = {
  nama_instansi: 'Instansi Saya',
  face_threshold: '0.5',
  office_lat: '',
  office_lng: '',
  office_radius: '200',
  enforce_geofence: '0',
  self_checkin: '1',
  liveness: '0',
  timezone_label: 'WIB',
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

if (!db.prepare('SELECT 1 FROM shifts LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO shifts (kode, nama, jam_masuk, jam_pulang, toleransi_menit, warna) VALUES (?,?,?,?,?,?)');
  ins.run('REG', 'Reguler', '07:30', '16:00', 15, '#0d6efd');
  ins.run('PAGI', 'Shift Pagi', '06:00', '14:00', 10, '#198754');
  ins.run('SIANG', 'Shift Siang', '14:00', '22:00', 10, '#fd7e14');
  ins.run('MALAM', 'Shift Malam', '22:00', '06:00', 10, '#6f42c1');
}

if (!db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get()) {
  const pass = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')")
    .run(process.env.ADMIN_USERNAME || 'admin', bcrypt.hashSync(pass, 10));
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value == null ? '' : String(value));
}

module.exports = { db, getSettings, setSetting };
