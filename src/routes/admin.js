const express = require('express');
const { db, setSetting } = require('../db');
const { requireAdmin } = require('../auth');
const T = require('../time');
const face = require('../face');
const { recordAttendance, getShiftForDate, AttendanceError, parseCoord } = require('../attendance');
const { saveDataUrl, removeFile } = require('../uploads');

const router = express.Router();

router.get('/admin', requireAdmin, (req, res) => {
  const today = T.fmtDate(new Date());
  const employees = db.prepare("SELECT * FROM employees WHERE status = 'aktif' ORDER BY nama").all();
  const records = db.prepare(`SELECT a.*, e.nama, e.nip, e.unit_kerja, s.kode AS shift_kode, s.warna AS shift_warna
    FROM attendance a JOIN employees e ON e.id = a.employee_id LEFT JOIN shifts s ON s.id = a.shift_id
    WHERE a.tanggal = ? ORDER BY COALESCE(a.jam_masuk, a.jam_pulang) DESC`).all(today);
  const byEmp = new Set(records.map((r) => r.employee_id));

  const counts = { hadir: 0, terlambat: 0, dinas_luar: 0, izin: 0, sakit: 0, cuti: 0, alpa: 0 };
  for (const r of records) counts[r.status] = (counts[r.status] || 0) + 1;

  const belumAbsen = [];
  let libur = 0;
  for (const e of employees) {
    const { shift, libur: isLibur } = getShiftForDate(e, today);
    if (isLibur) { libur++; continue; }
    if (!byEmp.has(e.id)) belumAbsen.push({ ...e, shift });
  }

  const pending = db.prepare("SELECT COUNT(*) AS n FROM clarifications WHERE status = 'menunggu'").get().n;
  const tanpaWajah = db.prepare("SELECT COUNT(*) AS n FROM employees WHERE status = 'aktif' AND face_descriptors IS NULL").get().n;

  res.render('admin/dashboard', {
    title: 'Dashboard', today, totalAktif: employees.length, counts, records, belumAbsen, libur, pending, tanpaWajah,
  });
});

router.get('/admin/pengaturan', requireAdmin, (req, res) => {
  res.render('admin/settings', { title: 'Pengaturan' });
});

router.post('/admin/pengaturan', requireAdmin, (req, res) => {
  const b = req.body;
  const num = (v, min, max, def) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : def;
  };
  setSetting('nama_instansi', String(b.nama_instansi || '').trim() || 'Instansi Saya');
  setSetting('face_threshold', num(b.face_threshold, 0.2, 0.8, 0.5));
  setSetting('office_lat', b.office_lat === '' ? '' : num(b.office_lat, -90, 90, ''));
  setSetting('office_lng', b.office_lng === '' ? '' : num(b.office_lng, -180, 180, ''));
  setSetting('office_radius', num(b.office_radius, 10, 100000, 200));
  setSetting('enforce_geofence', b.enforce_geofence ? '1' : '0');
  setSetting('self_checkin', b.self_checkin ? '1' : '0');
  setSetting('liveness', b.liveness ? '1' : '0');
  const hari = [].concat(b.hari_kerja || []).map(Number).filter((d) => d >= 0 && d <= 6);
  setSetting('hari_kerja', [...new Set(hari)].sort().join(','));
  setSetting('timezone_label', String(b.timezone_label || 'WIB').trim().slice(0, 10));
  res.flash('success', 'Pengaturan disimpan.');
  res.redirect('/admin/pengaturan');
});

// ---- Mode Kiosk: perangkat absensi bersama dengan pengenalan wajah otomatis ----
router.get('/kiosk', requireAdmin, (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS n FROM employees WHERE status = 'aktif' AND face_descriptors IS NOT NULL").get().n;
  res.render('kiosk', { title: 'Kiosk Absensi', totalWajah: total });
});

router.post('/api/kiosk/absen', requireAdmin, (req, res) => {
  const descriptor = face.parseDescriptor(req.body.descriptor);
  const mode = req.body.mode === 'pulang' ? 'pulang' : 'masuk';
  if (!descriptor) return res.status(400).json({ error: 'Data wajah tidak valid.' });

  const { match, distance } = face.identify(descriptor);
  if (!match) {
    return res.status(404).json({ error: 'Wajah tidak dikenali. Pastikan wajah sudah didaftarkan.', similarity: face.similarity(distance) });
  }
  let foto = null;
  if (req.body.photo) {
    try { foto = saveDataUrl(req.body.photo, `absensi/${match.id}`); } catch { foto = null; }
  }
  const lat = parseCoord(req.body.lat, 90);
  const lng = parseCoord(req.body.lng, 180);
  try {
    const rec = recordAttendance({
      employee: match, mode, metode: 'wajah', foto, lat, lng, skor: Math.round(face.similarity(distance)),
    });
    res.json({
      ok: true,
      mode,
      nama: match.nama,
      nip: match.nip,
      jabatan: match.jabatan,
      jam: (mode === 'masuk' ? rec.jam_masuk : rec.jam_pulang).slice(11, 16),
      status: rec.status,
      terlambat_menit: rec.terlambat_menit,
      pulang_cepat_menit: rec.pulang_cepat_menit,
      shift: rec.shift ? `${rec.shift.nama} (${rec.shift.jam_masuk}-${rec.shift.jam_pulang})` : null,
      similarity: face.similarity(distance),
    });
  } catch (err) {
    removeFile(foto);
    if (err instanceof AttendanceError) {
      return res.status(409).json({ error: err.message, nama: match.nama, similarity: face.similarity(distance) });
    }
    throw err;
  }
});

module.exports = router;
