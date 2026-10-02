const express = require('express');
const { db, getSettings } = require('../db');
const { requirePegawai } = require('../auth');
const T = require('../time');
const A = require('../attendance');
const face = require('../face');
const { saveDataUrl, removeFile } = require('../uploads');
const { rekap } = require('./attendance');

const router = express.Router();

function me(req) {
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(req.user.employee_id);
}

router.get('/pegawai', requirePegawai, (req, res) => {
  const emp = me(req);
  const today = T.fmtDate(new Date());
  const { shift, libur } = A.getShiftForDate(emp, today);
  const todayRec = A.getRecord(emp.id, today);
  // Absen masuk shift malam kemarin yang belum pulang
  const openRec = db.prepare(`SELECT * FROM attendance WHERE employee_id = ? AND tanggal = ? AND jam_masuk IS NOT NULL
    AND jam_pulang IS NULL`).get(emp.id, T.addDays(today, -1));
  const recent = db.prepare(`SELECT a.*, s.kode AS shift_kode FROM attendance a LEFT JOIN shifts s ON s.id = a.shift_id
    WHERE a.employee_id = ? ORDER BY a.tanggal DESC LIMIT 7`).all(emp.id);
  const summary = rekap({ dari: `${today.slice(0, 7)}-01`, sampai: today, unit: '', q: emp.nip })
    .find((r) => r.nip === emp.nip);
  const upcoming = T.dateRange(today, T.addDays(today, 6)).map((d) => ({ tanggal: d, ...A.getShiftForDate(emp, d) }));
  const pending = db.prepare("SELECT COUNT(*) AS n FROM clarifications WHERE employee_id = ? AND status = 'menunggu'").get(emp.id).n;
  res.render('pegawai/dashboard', {
    title: 'Beranda', emp, today, shift, libur, todayRec, openRec, recent, summary, upcoming, pending,
  });
});

router.get('/pegawai/riwayat', requirePegawai, (req, res) => {
  const emp = me(req);
  const bulan = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.bulan || '') ? req.query.bulan : T.fmtDate(new Date()).slice(0, 7);
  const [y, m] = bulan.split('-').map(Number);
  const last = `${bulan}-${T.pad(new Date(y, m, 0).getDate())}`;
  const records = db.prepare(`SELECT a.*, s.kode AS shift_kode, s.jam_masuk AS shift_masuk, s.jam_pulang AS shift_pulang
    FROM attendance a LEFT JOIN shifts s ON s.id = a.shift_id
    WHERE a.employee_id = ? AND a.tanggal BETWEEN ? AND ? ORDER BY a.tanggal DESC`).all(emp.id, `${bulan}-01`, last);
  const summary = rekap({ dari: `${bulan}-01`, sampai: last, unit: '', q: emp.nip }).find((r) => r.nip === emp.nip);
  // Hari kerja tanpa catatan absensi ditampilkan juga agar pegawai bisa langsung mengajukan klarifikasi.
  const today = T.fmtDate(new Date());
  const ada = new Set(records.map((r) => r.tanggal));
  const kosong = T.dateRange(`${bulan}-01`, last < today ? last : T.addDays(today, -1))
    .filter((d) => !ada.has(d) && !A.getShiftForDate(emp, d).libur && A.getShiftForDate(emp, d).shift)
    .map((d) => ({ tanggal: d, kosong: true }));
  const rows = records.concat(kosong).sort((x, y) => (x.tanggal < y.tanggal ? 1 : -1));
  res.render('pegawai/riwayat', { title: 'Riwayat Absensi', emp, bulan, records: rows, summary });
});

function hasFace(emp) {
  return face.samplesOf(emp).length > 0;
}

router.get('/pegawai/absen', requirePegawai, (req, res) => {
  const emp = me(req);
  // Tombol yang ditonjolkan: pulang bila sudah absen masuk (hari ini atau shift malam kemarin)
  const today = T.fmtDate(new Date());
  const rec = A.getRecord(emp.id, today);
  const yRec = A.getRecord(emp.id, T.addDays(today, -1));
  const nextMode = (rec && rec.jam_masuk && !rec.jam_pulang) || (!rec && yRec && yRec.jam_masuk && !yRec.jam_pulang) ? 'pulang' : 'masuk';
  res.render('pegawai/absen', {
    title: 'Absen Wajah', emp, hasFace: hasFace(emp), enabled: getSettings().self_checkin === '1', nextMode, rec,
  });
});

router.get('/pegawai/dinas-luar', requirePegawai, (req, res) => {
  const emp = me(req);
  const recent = db.prepare(`SELECT * FROM attendance WHERE employee_id = ? AND (metode_masuk = 'dinas_luar' OR metode_pulang = 'dinas_luar')
    ORDER BY tanggal DESC LIMIT 10`).all(emp.id);
  res.render('pegawai/dinas_luar', { title: 'Absen Dinas Luar', emp, hasFace: hasFace(emp), recent });
});

function apiError(res, status, message) {
  return res.status(status).json({ error: message });
}

/** Proses absen pegawai sendiri (wajah biasa atau dinas luar). */
function selfAttendance(req, res, dinasLuar) {
  const emp = me(req);
  const settings = getSettings();
  const b = req.body;
  const mode = b.mode === 'pulang' ? 'pulang' : 'masuk';
  if (!dinasLuar && settings.self_checkin !== '1') return apiError(res, 403, 'Absen mandiri dinonaktifkan oleh admin. Gunakan kiosk absensi.');
  if (!hasFace(emp)) return apiError(res, 400, 'Wajah Anda belum terdaftar. Daftarkan wajah terlebih dahulu.');

  const descriptor = face.parseDescriptor(b.descriptor);
  if (!descriptor) return apiError(res, 400, 'Wajah tidak terdeteksi pada foto.');
  const v = face.verify(emp, descriptor);
  if (!v.ok) return apiError(res, 403, `Wajah tidak cocok dengan data ${emp.nama} (kemiripan ${face.similarity(v.distance)}%).`);

  const lat = A.parseCoord(b.lat, 90);
  const lng = A.parseCoord(b.lng, 180);
  if (dinasLuar && (lat === null || lng === null)) return apiError(res, 400, 'Lokasi GPS wajib untuk absen dinas luar.');
  if (!b.photo) return apiError(res, 400, 'Foto wajib dilampirkan.');

  if (!dinasLuar && settings.enforce_geofence === '1' && settings.office_lat !== '' && settings.office_lng !== '') {
    if (lat === null || lng === null) return apiError(res, 400, 'Aktifkan GPS untuk absen. Lokasi diperlukan.');
    const dist = A.haversineMeters(lat, lng, +settings.office_lat, +settings.office_lng);
    const radius = +settings.office_radius || 200;
    if (dist > radius) {
      return apiError(res, 403, `Anda berada ${Math.round(dist)} m dari kantor (maks ${radius} m). Gunakan menu Dinas Luar jika sedang bertugas di luar.`);
    }
  }

  let foto;
  try {
    foto = saveDataUrl(b.photo, `${dinasLuar ? 'dinas-luar' : 'absensi'}/${emp.id}`);
  } catch (err) {
    return apiError(res, 400, err.message);
  }
  const keterangan = dinasLuar ? `Dinas luar${b.keterangan ? `: ${String(b.keterangan).trim().slice(0, 300)}` : ''}` : null;
  try {
    const rec = A.recordAttendance({
      employee: emp, mode, metode: dinasLuar ? 'dinas_luar' : 'wajah', foto, lat, lng,
      alamat: b.alamat ? String(b.alamat).slice(0, 500) : null,
      skor: face.similarity(v.distance), status: dinasLuar && mode === 'masuk' ? 'dinas_luar' : undefined, keterangan,
    });
    res.json({
      ok: true, mode, jam: (mode === 'masuk' ? rec.jam_masuk : rec.jam_pulang).slice(11, 16), status: rec.status,
      status_label: A.STATUS_LABEL[rec.status], terlambat_menit: rec.terlambat_menit, pulang_cepat_menit: rec.pulang_cepat_menit,
      similarity: face.similarity(v.distance), tanggal: rec.tanggal,
    });
  } catch (err) {
    removeFile(foto);
    if (err instanceof A.AttendanceError) return apiError(res, 409, err.message);
    throw err;
  }
}

router.post('/api/pegawai/absen', requirePegawai, (req, res) => selfAttendance(req, res, false));
router.post('/api/pegawai/dinas-luar', requirePegawai, (req, res) => selfAttendance(req, res, true));

module.exports = router;
