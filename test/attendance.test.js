process.env.DB_PATH = ':memory:';
process.env.TZ = 'Asia/Jakarta';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../src/db');
const A = require('../src/attendance');

const shift = (kode) => db.prepare('SELECT * FROM shifts WHERE kode = ?').get(kode);

function newEmployee(nip, shiftKode) {
  const id = db.prepare('INSERT INTO employees (nip, nama, default_shift_id) VALUES (?, ?, ?)')
    .run(nip, `Pegawai ${nip}`, shift(shiftKode).id).lastInsertRowid;
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
}

test('terlambat dihitung setelah toleransi', () => {
  const emp = newEmployee('A1', 'REG'); // 07:30-16:00, toleransi 15
  let r = A.recordAttendance({ employee: emp, mode: 'masuk', now: new Date(2026, 9, 5, 7, 44), metode: 'wajah' });
  assert.equal(r.status, 'hadir');
  assert.equal(r.terlambat_menit, 0);
  r = A.recordAttendance({ employee: emp, mode: 'pulang', now: new Date(2026, 9, 5, 15, 30), metode: 'wajah' });
  assert.equal(r.pulang_cepat_menit, 30);

  const emp2 = newEmployee('A2', 'REG');
  r = A.recordAttendance({ employee: emp2, mode: 'masuk', now: new Date(2026, 9, 5, 7, 50), metode: 'wajah' });
  assert.equal(r.status, 'terlambat');
  assert.equal(r.terlambat_menit, 20);
});

test('shift malam: absen pulang esok hari masuk ke tanggal kerja sebelumnya', () => {
  const emp = newEmployee('B1', 'MALAM'); // 22:00-06:00
  let r = A.recordAttendance({ employee: emp, mode: 'masuk', now: new Date(2026, 9, 5, 21, 55), metode: 'wajah' });
  assert.equal(r.tanggal, '2026-10-05');
  r = A.recordAttendance({ employee: emp, mode: 'pulang', now: new Date(2026, 9, 6, 6, 2), metode: 'wajah' });
  assert.equal(r.tanggal, '2026-10-05');
  assert.equal(r.pulang_cepat_menit, 0);
  assert.equal(r.status, 'hadir');
});

test('shift malam: masuk terlambat lewat tengah malam tetap tanggal kemarin', () => {
  const emp = newEmployee('B2', 'MALAM');
  const r = A.recordAttendance({ employee: emp, mode: 'masuk', now: new Date(2026, 9, 6, 0, 30), metode: 'wajah' });
  assert.equal(r.tanggal, '2026-10-05');
  assert.equal(r.status, 'terlambat');
  assert.equal(r.terlambat_menit, 150);
});

test('jadwal libur & override shift per tanggal', () => {
  const emp = newEmployee('C1', 'REG');
  db.prepare('INSERT INTO shift_schedules (employee_id, tanggal, shift_id) VALUES (?, ?, NULL)').run(emp.id, '2026-10-10');
  db.prepare('INSERT INTO shift_schedules (employee_id, tanggal, shift_id) VALUES (?, ?, ?)').run(emp.id, '2026-10-11', shift('SIANG').id);
  assert.equal(A.getShiftForDate(emp, '2026-10-10').libur, true);
  assert.equal(A.getShiftForDate(emp, '2026-10-11').shift.kode, 'SIANG');
  assert.equal(A.getShiftForDate(emp, '2026-10-12').shift.kode, 'REG');
  const r = A.recordAttendance({ employee: emp, mode: 'masuk', now: new Date(2026, 9, 10, 8, 0), metode: 'wajah' });
  assert.match(r.keterangan, /hari libur/);
});

test('dispensasi klarifikasi tetap berlaku saat absen pulang', () => {
  const emp = newEmployee('D1', 'REG');
  A.recordAttendance({ employee: emp, mode: 'masuk', now: new Date(2026, 9, 7, 8, 30), metode: 'wajah' });
  A.upsertManual(emp, { tanggal: '2026-10-07', status: 'hadir', dispensasi: true, metode: 'klarifikasi' });
  const r = A.recordAttendance({ employee: emp, mode: 'pulang', now: new Date(2026, 9, 7, 16, 5), metode: 'wajah' });
  assert.equal(r.terlambat_menit, 0);
  assert.equal(r.status, 'hadir');
});

test('upsert manual: status izin tidak dihitung ulang', () => {
  const emp = newEmployee('E1', 'REG');
  const r = A.upsertManual(emp, { tanggal: '2026-10-08', jam_masuk: null, jam_pulang: null, status: 'sakit' });
  assert.equal(r.status, 'sakit');
});

test('jarak haversine', () => {
  const d = A.haversineMeters(-6.175392, 106.827153, -6.176392, 106.827153);
  assert.ok(d > 100 && d < 120);
});
