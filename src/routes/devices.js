const express = require('express');
const net = require('net');
const { db } = require('../db');
const { requireAdmin } = require('../auth');
const T = require('../time');
const fingerprint = require('../fingerprint');
const solution = require('../solution');
const { syncDevice } = require('../devices');
const { importUpload } = require('../uploads');
const { sendCsv } = require('../excel');

const router = express.Router();

function listDevices() {
  return db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM fingerprint_logs l WHERE l.device_id = d.id) AS jumlah_log,
      (SELECT MAX(waktu) FROM fingerprint_logs l WHERE l.device_id = d.id) AS log_terakhir
    FROM devices d ORDER BY d.nama`).all();
}

function pageData(extra = {}) {
  const stats = db.prepare(`SELECT COUNT(*) AS total, MIN(waktu) AS awal, MAX(waktu) AS akhir,
    COUNT(DISTINCT pin) AS pin FROM fingerprint_logs`).get();
  return {
    title: 'Mesin Fingerprint', devices: listDevices(), stats, TIPE_MESIN: fingerprint.TIPE_MESIN,
    unmatched: fingerprint.unmatchedUsers().length, result: null, edit: null, errors: [], ...extra,
  };
}

router.get('/admin/mesin', requireAdmin, (req, res) => {
  const edit = req.query.edit ? db.prepare('SELECT * FROM devices WHERE id = ?').get(req.query.edit) : null;
  res.render('admin/devices', pageData({ edit }));
});

function normalizeDevice(b) {
  const data = {
    nama: String(b.nama || '').trim(),
    tipe: fingerprint.TIPE_MESIN[b.tipe] ? b.tipe : 'lainnya',
    koneksi: b.koneksi === 'usb' ? 'usb' : 'lan',
    ip: String(b.ip || '').trim() || null,
    port: parseInt(b.port, 10) || 80,
    comm_key: String(b.comm_key ?? '0').trim() || '0',
    lokasi: String(b.lokasi || '').trim() || null,
    auto_sync_menit: Math.max(0, parseInt(b.auto_sync_menit, 10) || 0),
  };
  const errors = [];
  if (!data.nama) errors.push('Nama mesin wajib diisi.');
  if (data.koneksi === 'lan') {
    if (!data.ip || !net.isIP(data.ip)) errors.push('Alamat IP mesin tidak valid (contoh 192.168.1.201).');
    if (data.port < 1 || data.port > 65535) errors.push('Port tidak valid.');
    if (!/^\d{1,9}$/.test(data.comm_key)) errors.push('Comm Key harus berupa angka (default 0).');
    if (data.auto_sync_menit && data.auto_sync_menit < 5) errors.push('Interval tarik otomatis minimal 5 menit.');
  } else {
    data.ip = null;
    data.auto_sync_menit = 0;
  }
  return { data, errors };
}

router.post('/admin/mesin', requireAdmin, (req, res) => {
  const id = parseInt(req.body.id, 10) || null;
  const { data, errors } = normalizeDevice(req.body);
  if (errors.length) return res.status(400).render('admin/devices', pageData({ edit: { ...data, id }, errors }));
  if (id) {
    db.prepare('UPDATE devices SET nama=?, tipe=?, koneksi=?, ip=?, port=?, comm_key=?, lokasi=?, auto_sync_menit=? WHERE id=?')
      .run(data.nama, data.tipe, data.koneksi, data.ip, data.port, data.comm_key, data.lokasi, data.auto_sync_menit, id);
  } else {
    db.prepare('INSERT INTO devices (nama, tipe, koneksi, ip, port, comm_key, lokasi, auto_sync_menit) VALUES (?,?,?,?,?,?,?,?)')
      .run(data.nama, data.tipe, data.koneksi, data.ip, data.port, data.comm_key, data.lokasi, data.auto_sync_menit);
  }
  res.flash('success', `Mesin ${data.nama} disimpan.`);
  res.redirect('/admin/mesin');
});

function loadDevice(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next('route');
  req.device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id);
  if (!req.device) return res.status(404).render('error', { title: 'Tidak Ditemukan', message: 'Mesin tidak ditemukan.' });
  next();
}

router.post('/admin/mesin/:id/hapus', requireAdmin, loadDevice, (req, res) => {
  db.prepare('DELETE FROM devices WHERE id = ?').run(req.device.id);
  res.flash('success', `Mesin ${req.device.nama} dihapus. Log absensi yang sudah diimpor tetap tersimpan.`);
  res.redirect('/admin/mesin');
});

router.post('/admin/mesin/:id/tes', requireAdmin, loadDevice, async (req, res) => {
  try {
    const users = await solution.getUsers(req.device);
    res.flash('success', `Koneksi ke ${req.device.nama} (${req.device.ip}) berhasil. ${users.length} pengguna terdaftar di mesin.`);
  } catch (err) {
    res.flash('danger', `Koneksi ke ${req.device.nama} gagal: ${err.message}`);
  }
  res.redirect('/admin/mesin');
});

router.post('/admin/mesin/:id/tarik', requireAdmin, loadDevice, async (req, res) => {
  try {
    const result = await syncDevice(req.device);
    res.render('admin/devices', pageData({ result: { ...result, sumber: `Tarik data dari ${req.device.nama}` } }));
  } catch (err) {
    res.flash('danger', `Tarik data dari ${req.device.nama} gagal: ${err.message}`);
    res.redirect('/admin/mesin');
  }
});

// Impor file ekspor USB (P280 / X302 / attlog)
router.post('/admin/mesin/impor', requireAdmin, importUpload.single('file'), async (req, res) => {
  if (!req.file) {
    res.flash('danger', 'Pilih file ekspor dari mesin terlebih dahulu.');
    return res.redirect('/admin/mesin');
  }
  const deviceId = parseInt(req.body.device_id, 10) || null;
  if (deviceId && !db.prepare('SELECT 1 FROM devices WHERE id = ?').get(deviceId)) {
    res.flash('danger', 'Mesin tidak valid.');
    return res.redirect('/admin/mesin');
  }
  let parsed;
  try {
    parsed = await fingerprint.parseExportFile(req.file.buffer, req.file.originalname);
  } catch (err) {
    res.flash('danger', `Gagal membaca file: ${err.message}`);
    return res.redirect('/admin/mesin');
  }
  const result = fingerprint.importData(parsed, { deviceId, sumber: 'usb' });
  if (deviceId) {
    db.prepare(`UPDATE devices SET last_sync_at = datetime('now','localtime'), last_sync_ok = 1, last_sync_status = ? WHERE id = ?`)
      .run(`Impor file ${req.file.originalname}: ${result.baru} log baru.`, deviceId);
  }
  res.render('admin/devices', pageData({
    result: { ...result, sumber: `Impor file ${req.file.originalname}`, format: parsed.format, period: parsed.period },
  }));
});

// Pemetaan ID mesin -> pegawai
router.get('/admin/mesin/pemetaan', requireAdmin, (req, res) => {
  const employees = db.prepare("SELECT id, nip, nama, unit_kerja, id_mesin FROM employees WHERE status = 'aktif' ORDER BY nama").all();
  const shifts = db.prepare('SELECT * FROM shifts WHERE aktif = 1 ORDER BY jam_masuk').all();
  res.render('admin/device_mapping', {
    title: 'Pemetaan ID Mesin', unmatched: fingerprint.unmatchedUsers(), employees, shifts,
  });
});

router.post('/admin/mesin/pemetaan', requireAdmin, (req, res) => {
  const pins = [].concat(req.body.map_pin || []);
  const empIds = [].concat(req.body.map_emp || []);
  let n = 0;
  const errors = [];
  db.transaction(() => {
    for (let i = 0; i < pins.length; i++) {
      const pin = pins[i];
      const empId = empIds[i];
      if (!empId) continue;
      const clean = fingerprint.cleanPin(pin);
      const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(empId);
      if (!clean || !emp) continue;
      if (emp.id_mesin && emp.id_mesin !== clean) {
        errors.push(`${emp.nama} sudah memakai ID mesin ${emp.id_mesin}.`);
        continue;
      }
      if (db.prepare('SELECT 1 FROM employees WHERE id_mesin = ? AND id <> ?').get(clean, emp.id)) continue;
      db.prepare("UPDATE employees SET id_mesin = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(clean, emp.id);
      fingerprint.processPin(clean);
      n++;
    }
  })();
  res.flash(errors.length ? 'warning' : 'success', `${n} ID mesin dipetakan dan data absensinya diproses.${errors.length ? ' ' + errors.join(' ') : ''}`);
  res.redirect('/admin/mesin/pemetaan');
});

// Buat pegawai baru dari pengguna mesin yang belum terdaftar
router.post('/admin/mesin/pemetaan/buat', requireAdmin, (req, res) => {
  const { createEmployee } = require('./employees');
  const pins = [].concat(req.body.pins || []).map(fingerprint.cleanPin).filter(Boolean);
  const shiftId = parseInt(req.body.shift_id, 10) || null;
  let n = 0;
  const skipped = [];
  for (const pin of pins) {
    const u = db.prepare('SELECT * FROM fingerprint_users WHERE pin = ?').get(pin);
    if (!u || db.prepare('SELECT 1 FROM employees WHERE id_mesin = ?').get(pin)) continue;
    if (db.prepare('SELECT 1 FROM employees WHERE nip = ?').get(pin)) { skipped.push(pin); continue; }
    const nama = String(u.nama || '').replace(/[_~]+/g, ' ').trim() || `Pegawai ${pin}`;
    createEmployee({
      nip: pin, nama, jenis_kelamin: null, jabatan: null,
      unit_kerja: u.departemen ? u.departemen.replace(/_/g, ' ') : null,
      email: null, telepon: null, alamat: null, tanggal_masuk: null, status: 'aktif', id_mesin: pin,
    }, shiftId && db.prepare('SELECT 1 FROM shifts WHERE id = ?').get(shiftId) ? shiftId : null);
    n++;
  }
  res.flash(skipped.length ? 'warning' : 'success', `${n} pegawai baru dibuat dari data mesin (NIP & password awal = ID mesin; silakan lengkapi NIP aslinya).`
    + (skipped.length ? ` Dilewati karena NIP sudah dipakai: ${skipped.join(', ')}.` : ''));
  res.redirect('/admin/mesin/pemetaan');
});

// Log scan mentah
function logFilters(q) {
  const today = T.fmtDate(new Date());
  return {
    dari: T.isValidDate(q.dari) ? q.dari : T.addDays(today, -6),
    sampai: T.isValidDate(q.sampai) ? q.sampai : today,
    device_id: parseInt(q.device_id, 10) || '',
    q: String(q.q || '').trim(),
  };
}

function queryLogs(f, limit) {
  const where = ['l.waktu BETWEEN ? AND ?'];
  const params = [`${f.dari} 00:00:00`, `${f.sampai} 23:59:59`];
  if (f.device_id) { where.push('l.device_id = ?'); params.push(f.device_id); }
  if (f.q) { where.push('(l.pin = ? OR e.nama LIKE ? OR e.nip LIKE ? OR fu.nama LIKE ?)'); params.push(f.q, `%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
  return db.prepare(`SELECT l.*, d.nama AS mesin, e.id AS employee_id, e.nama AS pegawai, e.nip, fu.nama AS nama_mesin
    FROM fingerprint_logs l LEFT JOIN devices d ON d.id = l.device_id LEFT JOIN employees e ON e.id_mesin = l.pin
    LEFT JOIN fingerprint_users fu ON fu.pin = l.pin
    WHERE ${where.join(' AND ')} ORDER BY l.waktu DESC ${limit ? `LIMIT ${limit}` : ''}`).all(...params);
}

router.get('/admin/mesin/log', requireAdmin, (req, res) => {
  const f = logFilters(req.query);
  const logs = queryLogs(f, 2000);
  res.render('admin/device_logs', { title: 'Log Scan Fingerprint', f, logs, devices: listDevices() });
});

router.get('/admin/mesin/log/export', requireAdmin, (req, res) => {
  const f = logFilters(req.query);
  const rows = queryLogs(f).map((l) => ({
    waktu: l.waktu, pin: l.pin, nama: l.pegawai || l.nama_mesin || '', nip: l.nip || '', mesin: l.mesin || '', sumber: l.sumber,
  }));
  sendCsv(res, [
    { header: 'Waktu', key: 'waktu' }, { header: 'ID Mesin', key: 'pin' }, { header: 'Nama', key: 'nama' },
    { header: 'NIP', key: 'nip' }, { header: 'Mesin', key: 'mesin' }, { header: 'Sumber', key: 'sumber' },
  ], rows, `log-fingerprint-${f.dari}_sd_${f.sampai}.csv`);
});

// Proses ulang (mis. setelah jadwal shift diubah)
router.post('/admin/mesin/proses-ulang', requireAdmin, (req, res) => {
  const { dari, sampai } = req.body;
  if (!T.isValidDate(dari) || !T.isValidDate(sampai) || dari > sampai) {
    res.flash('danger', 'Rentang tanggal tidak valid.');
    return res.redirect('/admin/mesin');
  }
  const pins = db.prepare(`SELECT DISTINCT pin FROM fingerprint_logs WHERE waktu BETWEEN ? AND ?`)
    .all(`${T.addDays(dari, -1)} 00:00:00`, `${T.addDays(sampai, 1)} 23:59:59`).map((r) => r.pin);
  let days = 0;
  db.transaction(() => { for (const pin of pins) days += fingerprint.processPin(pin, dari, sampai).days; })();
  res.flash('success', `Proses ulang selesai: ${pins.length} ID mesin, ${days} hari absensi diperbarui.`);
  res.redirect('/admin/mesin');
});

module.exports = router;
