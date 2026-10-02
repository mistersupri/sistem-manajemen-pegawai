const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db, setSetting, getSettings } = require('../db');
const { requireAdmin } = require('../auth');
const T = require('../time');
const face = require('../face');
const { recordAttendance, getShiftForDate, AttendanceError, parseCoord } = require('../attendance');
const { saveDataUrl, removeFile, UPLOAD_DIR } = require('../uploads');

const router = express.Router();

router.get('/admin', requireAdmin, (req, res) => {
  const today = T.fmtDate(new Date());
  const employees = db.prepare("SELECT * FROM employees WHERE status = 'aktif' ORDER BY nama").all();
  const records = db.prepare(`SELECT a.*, e.nama, e.nip, e.unit_kerja, s.kode AS shift_kode, s.warna AS shift_warna, s.jam_masuk AS shift_masuk, s.jam_pulang AS shift_pulang
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

  const klarifikasi = db.prepare(`SELECT c.id, c.tanggal, c.jenis, c.created_at, e.nama FROM clarifications c
    JOIN employees e ON e.id = c.employee_id WHERE c.status = 'menunggu' ORDER BY c.created_at LIMIT 5`).all();
  const mesinGagal = db.prepare('SELECT id, nama, last_sync_at, last_sync_status FROM devices WHERE last_sync_ok = 0').all();
  const terjadwal = employees.length - libur;
  const hadirCount = records.filter((r) => ['hadir', 'terlambat', 'dinas_luar'].includes(r.status)).length;
  res.render('admin/dashboard', {
    title: 'Dashboard', today, totalAktif: employees.length, counts, records, belumAbsen, libur, pending, tanpaWajah,
    klarifikasi, mesinGagal, terjadwal, hadirCount, terlambat: records.filter((r) => r.status === 'terlambat'),
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

// Logo instansi: PNG/JPG/WebP maks 1 MB, disimpan di uploads/branding/
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });

function imageExt(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}

router.post('/admin/pengaturan/logo', requireAdmin, (req, res, next) => {
  logoUpload.single('logo')(req, res, (err) => {
    if (err) {
      res.flash('danger', err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran logo maksimal 1 MB.' : 'Gagal mengunggah logo.');
      return res.redirect('/admin/pengaturan');
    }
    next();
  });
}, (req, res) => {
  const ext = req.file && imageExt(req.file.buffer);
  if (!ext) {
    res.flash('danger', 'Logo harus berupa gambar PNG, JPG, atau WebP.');
    return res.redirect('/admin/pengaturan');
  }
  const dir = path.join(UPLOAD_DIR, 'branding');
  fs.mkdirSync(dir, { recursive: true });
  const rel = `branding/logo-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, rel), req.file.buffer);
  const old = getSettings().logo;
  setSetting('logo', rel);
  if (old) removeFile(old);
  res.flash('success', 'Logo instansi diperbarui.');
  res.redirect('/admin/pengaturan');
});

router.post('/admin/pengaturan/logo/hapus', requireAdmin, (req, res) => {
  const old = getSettings().logo;
  setSetting('logo', '');
  if (old) removeFile(old);
  res.flash('success', 'Logo dihapus. Nama instansi akan tampil sebagai teks.');
  res.redirect('/admin/pengaturan');
});

// Mode Kiosk: perangkat absensi bersama dengan pengenalan wajah otomatis
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
      shift: rec.shift ? `${rec.shift.nama}, ${rec.shift.jam_masuk} sampai ${rec.shift.jam_pulang}` : null,
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
