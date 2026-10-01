const express = require('express');
const { db } = require('../db');
const { requireAdmin, requirePegawai } = require('../auth');
const T = require('../time');
const A = require('../attendance');
const { attachmentUpload, relPath, removeFile } = require('../uploads');

const router = express.Router();

const JENIS = {
  lupa_absen_masuk: 'Lupa / gagal absen masuk',
  lupa_absen_pulang: 'Lupa / gagal absen pulang',
  lupa_absen: 'Lupa absen masuk & pulang',
  terlambat: 'Keterlambatan',
  pulang_cepat: 'Pulang lebih cepat',
  izin: 'Izin',
  sakit: 'Sakit',
  cuti: 'Cuti',
  dinas_luar: 'Dinas luar / tugas kantor',
  lainnya: 'Lainnya',
};

// Status absensi yang diusulkan saat klarifikasi disetujui.
const DEFAULT_STATUS = { izin: 'izin', sakit: 'sakit', cuti: 'cuti', dinas_luar: 'dinas_luar' };
const MAX_DAYS_BACK = 31;

const STATUS_KLARIFIKASI = { menunggu: 'Menunggu', disetujui: 'Disetujui', ditolak: 'Ditolak' };

// ---------- Pegawai ----------
router.get('/pegawai/klarifikasi', requirePegawai, (req, res) => {
  const list = db.prepare('SELECT * FROM clarifications WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100')
    .all(req.user.employee_id);
  const tanggal = T.isValidDate(req.query.tanggal) ? req.query.tanggal : T.fmtDate(new Date());
  res.render('pegawai/klarifikasi', {
    title: 'Klarifikasi Absen', list, form: { tanggal, jenis: req.query.jenis || '' }, error: null,
    minDate: T.addDays(T.fmtDate(new Date()), -MAX_DAYS_BACK), maxDate: T.fmtDate(new Date()),
  });
});

router.post('/pegawai/klarifikasi', requirePegawai, (req, res, next) => {
  req.attachmentOwner = req.user.employee_id;
  attachmentUpload.single('lampiran')(req, res, (err) => {
    if (err) { err.userFacing = true; err.status = 400; return next(err); }
    next();
  });
}, (req, res) => {
  const b = req.body;
  const today = T.fmtDate(new Date());
  let error = null;
  if (!JENIS[b.jenis]) error = 'Pilih jenis klarifikasi.';
  else if (!T.isValidDate(b.tanggal) || b.tanggal > today || b.tanggal < T.addDays(today, -MAX_DAYS_BACK)) {
    error = `Tanggal harus antara ${MAX_DAYS_BACK} hari terakhir dan hari ini.`;
  } else if (String(b.alasan || '').trim().length < 10) error = 'Alasan minimal 10 karakter.';
  else if ((b.jam_masuk && !T.isValidTime(b.jam_masuk)) || (b.jam_pulang && !T.isValidTime(b.jam_pulang))) error = 'Format jam HH:MM.';
  else if (['lupa_absen_masuk', 'lupa_absen'].includes(b.jenis) && !b.jam_masuk) error = 'Isi jam masuk yang sebenarnya.';
  else if (['lupa_absen_pulang', 'lupa_absen'].includes(b.jenis) && !b.jam_pulang) error = 'Isi jam pulang yang sebenarnya.';
  else if (db.prepare("SELECT 1 FROM clarifications WHERE employee_id = ? AND tanggal = ? AND jenis = ? AND status = 'menunggu'")
    .get(req.user.employee_id, b.tanggal, b.jenis)) error = 'Klarifikasi yang sama untuk tanggal ini masih menunggu persetujuan.';

  if (error) {
    if (req.file) removeFile(relPath(req.file.path));
    const list = db.prepare('SELECT * FROM clarifications WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(req.user.employee_id);
    return res.status(400).render('pegawai/klarifikasi', {
      title: 'Klarifikasi Absen', list, form: b, error,
      minDate: T.addDays(today, -MAX_DAYS_BACK), maxDate: today,
    });
  }
  db.prepare(`INSERT INTO clarifications (employee_id, tanggal, jenis, jam_masuk_usulan, jam_pulang_usulan, alasan, lampiran)
    VALUES (?,?,?,?,?,?,?)`).run(req.user.employee_id, b.tanggal, b.jenis, b.jam_masuk || null, b.jam_pulang || null,
    String(b.alasan).trim(), req.file ? relPath(req.file.path) : null);
  res.flash('success', 'Klarifikasi terkirim dan menunggu persetujuan admin.');
  res.redirect('/pegawai/klarifikasi');
});

router.post('/pegawai/klarifikasi/:id/batal', requirePegawai, (req, res) => {
  const c = db.prepare("SELECT * FROM clarifications WHERE id = ? AND employee_id = ? AND status = 'menunggu'")
    .get(req.params.id, req.user.employee_id);
  if (c) {
    db.prepare('DELETE FROM clarifications WHERE id = ?').run(c.id);
    removeFile(c.lampiran);
    res.flash('success', 'Klarifikasi dibatalkan.');
  }
  res.redirect('/pegawai/klarifikasi');
});

// ---------- Admin ----------
router.get('/admin/klarifikasi', requireAdmin, (req, res) => {
  const status = STATUS_KLARIFIKASI[req.query.status] ? req.query.status : (req.query.status === 'semua' ? '' : 'menunggu');
  const list = db.prepare(`SELECT c.*, e.nama, e.nip, e.unit_kerja FROM clarifications c JOIN employees e ON e.id = c.employee_id
    ${status ? 'WHERE c.status = ?' : ''} ORDER BY c.status = 'menunggu' DESC, c.created_at DESC LIMIT 500`)
    .all(...(status ? [status] : []));
  res.render('admin/clarifications', { title: 'Klarifikasi Absen', list, status });
});

function loadClarification(id) {
  return db.prepare(`SELECT c.*, e.nama, e.nip, e.jabatan, e.unit_kerja, u.username AS reviewer
    FROM clarifications c JOIN employees e ON e.id = c.employee_id LEFT JOIN users u ON u.id = c.reviewed_by
    WHERE c.id = ?`).get(id);
}

router.get('/admin/klarifikasi/:id', requireAdmin, (req, res) => {
  const c = loadClarification(req.params.id);
  if (!c) return res.status(404).render('error', { title: 'Tidak Ditemukan', message: 'Klarifikasi tidak ditemukan.' });
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(c.employee_id);
  const rec = A.getRecord(c.employee_id, c.tanggal);
  const { shift, libur } = rec && rec.shift_id ? { shift: A.getShift(rec.shift_id), libur: false } : A.getShiftForDate(emp, c.tanggal);
  const proposal = {
    status: DEFAULT_STATUS[c.jenis] || (rec && A.FIXED_STATUS.includes(rec.status) ? rec.status : 'hadir'),
    jam_masuk: c.jam_masuk_usulan || (rec && rec.jam_masuk ? rec.jam_masuk.slice(11, 16) : ''),
    jam_pulang: c.jam_pulang_usulan || (rec && rec.jam_pulang ? rec.jam_pulang.slice(11, 16) : ''),
    dispensasi: ['terlambat', 'pulang_cepat', 'dinas_luar'].includes(c.jenis),
  };
  res.render('admin/clarification_detail', { title: 'Detail Klarifikasi', c, rec, shift, libur, proposal, error: null });
});

router.post('/admin/klarifikasi/:id/proses', requireAdmin, (req, res) => {
  const c = loadClarification(req.params.id);
  if (!c) return res.redirect('/admin/klarifikasi');
  if (c.status !== 'menunggu') {
    res.flash('warning', 'Klarifikasi ini sudah diproses.');
    return res.redirect(`/admin/klarifikasi/${c.id}`);
  }
  const b = req.body;
  const catatan = String(b.catatan_admin || '').trim() || null;
  if (b.aksi === 'tolak') {
    db.prepare(`UPDATE clarifications SET status='ditolak', catatan_admin=?, reviewed_by=?, reviewed_at=datetime('now','localtime')
      WHERE id=?`).run(catatan, req.user.id, c.id);
    res.flash('success', 'Klarifikasi ditolak.');
    return res.redirect('/admin/klarifikasi');
  }
  if (!A.STATUS_LABEL[b.status] || (b.jam_masuk && !T.isValidTime(b.jam_masuk)) || (b.jam_pulang && !T.isValidTime(b.jam_pulang))) {
    res.flash('danger', 'Status atau format jam tidak valid.');
    return res.redirect(`/admin/klarifikasi/${c.id}`);
  }
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(c.employee_id);
  const old = A.getRecord(emp.id, c.tanggal);
  const note = `Klarifikasi disetujui: ${JENIS[c.jenis]}${catatan ? ` (${catatan})` : ''}`;
  db.transaction(() => {
    A.upsertManual(emp, {
      tanggal: c.tanggal,
      jam_masuk: b.jam_masuk || null,
      jam_pulang: b.jam_pulang || null,
      status: b.status,
      dispensasi: !!b.dispensasi,
      metode: 'klarifikasi',
      keterangan: old && old.keterangan ? `${old.keterangan}; ${note}` : note,
    });
    db.prepare(`UPDATE clarifications SET status='disetujui', catatan_admin=?, reviewed_by=?, reviewed_at=datetime('now','localtime')
      WHERE id=?`).run(catatan, req.user.id, c.id);
  })();
  res.flash('success', `Klarifikasi ${c.nama} disetujui dan data absensi ${c.tanggal} diperbarui.`);
  res.redirect('/admin/klarifikasi');
});

module.exports = router;
module.exports.JENIS = JENIS;
module.exports.STATUS_KLARIFIKASI = STATUS_KLARIFIKASI;
