const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../auth');
const T = require('../time');
const A = require('../attendance');
const { removeFile } = require('../uploads');
const { ExcelJS, addSheet, sendWorkbook, sendCsv } = require('../excel');

const router = express.Router();

function filters(q) {
  const today = T.fmtDate(new Date());
  const f = {
    dari: T.isValidDate(q.dari) ? q.dari : `${today.slice(0, 7)}-01`,
    sampai: T.isValidDate(q.sampai) ? q.sampai : today,
    unit: q.unit || '',
    status: A.STATUS_LABEL[q.status] ? q.status : '',
    q: String(q.q || '').trim(),
  };
  if (f.dari > f.sampai) [f.dari, f.sampai] = [f.sampai, f.dari];
  return f;
}

function queryAttendance(f) {
  const where = ['a.tanggal BETWEEN ? AND ?'];
  const params = [f.dari, f.sampai];
  if (f.unit) { where.push('e.unit_kerja = ?'); params.push(f.unit); }
  if (f.status) { where.push('a.status = ?'); params.push(f.status); }
  if (f.q) { where.push('(e.nama LIKE ? OR e.nip LIKE ?)'); params.push(`%${f.q}%`, `%${f.q}%`); }
  return db.prepare(`SELECT a.*, e.nama, e.nip, e.jabatan, e.unit_kerja,
      s.kode AS shift_kode, s.nama AS shift_nama, s.jam_masuk AS shift_masuk, s.jam_pulang AS shift_pulang, s.warna AS shift_warna
    FROM attendance a JOIN employees e ON e.id = a.employee_id LEFT JOIN shifts s ON s.id = a.shift_id
    WHERE ${where.join(' AND ')} ORDER BY a.tanggal DESC, e.nama`).all(...params);
}

function units() {
  return db.prepare("SELECT DISTINCT unit_kerja FROM employees WHERE unit_kerja IS NOT NULL AND unit_kerja <> '' ORDER BY unit_kerja")
    .all().map((r) => r.unit_kerja);
}

/** Rekap per pegawai, termasuk jumlah hari kerja terjadwal tanpa catatan absensi (tanpa keterangan). */
function rekap(f) {
  const params = [];
  let where = "e.status = 'aktif'";
  if (f.unit) { where += ' AND e.unit_kerja = ?'; params.push(f.unit); }
  if (f.q) { where += ' AND (e.nama LIKE ? OR e.nip LIKE ?)'; params.push(`%${f.q}%`, `%${f.q}%`); }
  const employees = db.prepare(`SELECT * FROM employees e WHERE ${where} ORDER BY e.unit_kerja, e.nama`).all(...params);
  const today = T.fmtDate(new Date());
  const days = T.dateRange(f.dari, f.sampai < today ? f.sampai : today);
  const scheds = {};
  for (const r of db.prepare('SELECT employee_id, tanggal, shift_id FROM shift_schedules WHERE tanggal BETWEEN ? AND ?').all(f.dari, f.sampai)) {
    scheds[`${r.employee_id}|${r.tanggal}`] = r.shift_id;
  }
  const workday = Object.fromEntries(days.map((d) => [d, A.isWorkday(d)]));
  const recs = {};
  for (const r of db.prepare('SELECT * FROM attendance WHERE tanggal BETWEEN ? AND ?').all(f.dari, f.sampai)) {
    (recs[r.employee_id] = recs[r.employee_id] || {})[r.tanggal] = r;
  }
  return employees.map((e) => {
    const row = {
      nip: e.nip, nama: e.nama, unit_kerja: e.unit_kerja || '', jabatan: e.jabatan || '',
      hari_kerja: 0, hadir: 0, terlambat: 0, dinas_luar: 0, izin: 0, sakit: 0, cuti: 0, alpa: 0, tanpa_keterangan: 0,
      total_terlambat: 0, total_pulang_cepat: 0, tidak_absen_pulang: 0,
    };
    const mine = recs[e.id] || {};
    for (const d of days) {
      const key = `${e.id}|${d}`;
      const scheduled = key in scheds ? scheds[key] !== null : !!e.default_shift_id && workday[d];
      const r = mine[d];
      if (scheduled) row.hari_kerja++;
      if (r) {
        row[r.status]++;
        row.total_terlambat += r.terlambat_menit;
        row.total_pulang_cepat += r.pulang_cepat_menit;
        if (r.jam_masuk && !r.jam_pulang && d < today && ['hadir', 'terlambat', 'dinas_luar'].includes(r.status)) row.tidak_absen_pulang++;
      } else if (scheduled) {
        row.tanpa_keterangan++;
      }
    }
    row.total_hadir = row.hadir + row.terlambat + row.dinas_luar;
    row.persen = row.hari_kerja ? Math.round((row.total_hadir / row.hari_kerja) * 100) : 0;
    return row;
  });
}

router.get('/admin/absensi', requireAdmin, (req, res) => {
  const f = filters(req.query);
  res.render('admin/attendance', { title: 'Data Absensi', f, records: queryAttendance(f), units: units() });
});

router.get('/admin/rekap', requireAdmin, (req, res) => {
  const f = filters(req.query);
  res.render('admin/rekap', { title: 'Rekap Absensi', f, rows: rekap(f), units: units() });
});

const time = (v) => (v ? v.slice(11, 16) : '');
const coord = (lat, lng) => (lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : '');

function detailRows(records) {
  return records.map((r, i) => ({
    no: i + 1,
    tanggal: r.tanggal,
    hari: T.HARI[T.parseDateTime(r.tanggal).getDay()],
    nip: r.nip,
    nama: r.nama,
    unit_kerja: r.unit_kerja || '',
    shift: r.shift_kode ? `${r.shift_kode} (${r.shift_masuk}-${r.shift_pulang})` : '-',
    jam_masuk: time(r.jam_masuk),
    jam_pulang: time(r.jam_pulang),
    status: A.STATUS_LABEL[r.status] || r.status,
    terlambat_menit: r.terlambat_menit,
    pulang_cepat_menit: r.pulang_cepat_menit,
    metode_masuk: A.METODE_LABEL[r.metode_masuk] || '',
    metode_pulang: A.METODE_LABEL[r.metode_pulang] || '',
    lokasi_masuk: coord(r.lat_masuk, r.lng_masuk),
    alamat_masuk: r.alamat_masuk || '',
    lokasi_pulang: coord(r.lat_pulang, r.lng_pulang),
    alamat_pulang: r.alamat_pulang || '',
    keterangan: r.keterangan || '',
  }));
}

const DETAIL_COLUMNS = [
  { header: 'No', key: 'no', width: 6 },
  { header: 'Tanggal', key: 'tanggal', width: 12 },
  { header: 'Hari', key: 'hari', width: 9 },
  { header: 'NIP', key: 'nip', width: 22 },
  { header: 'Nama', key: 'nama', width: 28 },
  { header: 'Unit Kerja', key: 'unit_kerja', width: 20 },
  { header: 'Shift', key: 'shift', width: 20 },
  { header: 'Jam Masuk', key: 'jam_masuk', width: 10 },
  { header: 'Jam Pulang', key: 'jam_pulang', width: 10 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Terlambat (menit)', key: 'terlambat_menit', width: 11 },
  { header: 'Pulang Cepat (menit)', key: 'pulang_cepat_menit', width: 11 },
  { header: 'Metode Masuk', key: 'metode_masuk', width: 18 },
  { header: 'Metode Pulang', key: 'metode_pulang', width: 18 },
  { header: 'Koordinat Masuk', key: 'lokasi_masuk', width: 24 },
  { header: 'Alamat Masuk', key: 'alamat_masuk', width: 35 },
  { header: 'Koordinat Pulang', key: 'lokasi_pulang', width: 24 },
  { header: 'Alamat Pulang', key: 'alamat_pulang', width: 35 },
  { header: 'Keterangan', key: 'keterangan', width: 35 },
];

const REKAP_COLUMNS = [
  { header: 'NIP', key: 'nip', width: 22 },
  { header: 'Nama', key: 'nama', width: 28 },
  { header: 'Unit Kerja', key: 'unit_kerja', width: 20 },
  { header: 'Hari Kerja', key: 'hari_kerja', width: 9 },
  { header: 'Hadir Tepat Waktu', key: 'hadir', width: 10 },
  { header: 'Terlambat', key: 'terlambat', width: 10 },
  { header: 'Dinas Luar', key: 'dinas_luar', width: 9 },
  { header: 'Izin', key: 'izin', width: 7 },
  { header: 'Sakit', key: 'sakit', width: 7 },
  { header: 'Cuti', key: 'cuti', width: 7 },
  { header: 'Alpa', key: 'alpa', width: 7 },
  { header: 'Tanpa Keterangan', key: 'tanpa_keterangan', width: 11 },
  { header: 'Tidak Absen Pulang', key: 'tidak_absen_pulang', width: 11 },
  { header: 'Total Terlambat (menit)', key: 'total_terlambat', width: 12 },
  { header: 'Total Pulang Cepat (menit)', key: 'total_pulang_cepat', width: 12 },
  { header: '% Kehadiran', key: 'persen', width: 10 },
];

router.get('/admin/absensi/export', requireAdmin, async (req, res) => {
  const f = filters(req.query);
  const name = `absensi-${f.dari}_sd_${f.sampai}`;
  if (req.query.format === 'csv') return sendCsv(res, DETAIL_COLUMNS, detailRows(queryAttendance(f)), `${name}.csv`);
  if (req.query.format === 'rekap-csv') return sendCsv(res, REKAP_COLUMNS, rekap(f), `rekap-${name}.csv`);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistem Absensi Pegawai';
  const subtitle = `Periode ${T.fmtTanggalIndo(f.dari)} s.d. ${T.fmtTanggalIndo(f.sampai)}${f.unit ? ` · Unit: ${f.unit}` : ''}`;
  addSheet(wb, 'Rekap', REKAP_COLUMNS, rekap(f), { title: `Rekap Absensi - ${res.locals.settings.nama_instansi}`, subtitle });
  addSheet(wb, 'Detail Absensi', DETAIL_COLUMNS, detailRows(queryAttendance(f)), {
    title: `Detail Absensi - ${res.locals.settings.nama_instansi}`, subtitle,
  });
  await sendWorkbook(res, wb, `${name}.xlsx`);
});

// ---------- Input / koreksi manual ----------
router.get('/admin/absensi/input', requireAdmin, (req, res) => {
  const employees = db.prepare("SELECT id, nip, nama FROM employees WHERE status = 'aktif' ORDER BY nama").all();
  const tanggal = T.isValidDate(req.query.tanggal) ? req.query.tanggal : T.fmtDate(new Date());
  const empId = parseInt(req.query.employee_id, 10) || null;
  const rec = empId ? A.getRecord(empId, tanggal) : null;
  res.render('admin/attendance_form', { title: 'Input Absensi Manual', employees, tanggal, empId, rec, error: null });
});

router.post('/admin/absensi/input', requireAdmin, (req, res) => {
  const b = req.body;
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(b.employee_id);
  let error = null;
  if (!emp) error = 'Pilih pegawai.';
  else if (!T.isValidDate(b.tanggal)) error = 'Tanggal tidak valid.';
  else if (!A.STATUS_LABEL[b.status]) error = 'Status tidak valid.';
  else if ((b.jam_masuk && !T.isValidTime(b.jam_masuk)) || (b.jam_pulang && !T.isValidTime(b.jam_pulang))) error = 'Format jam HH:MM.';
  if (error) {
    const employees = db.prepare("SELECT id, nip, nama FROM employees WHERE status = 'aktif' ORDER BY nama").all();
    return res.status(400).render('admin/attendance_form', {
      title: 'Input Absensi Manual', employees, tanggal: b.tanggal, empId: Number(b.employee_id) || null, rec: null, error,
    });
  }
  A.upsertManual(emp, {
    tanggal: b.tanggal, jam_masuk: b.jam_masuk || null, jam_pulang: b.jam_pulang || null, status: b.status,
    keterangan: String(b.keterangan || '').trim() || null, metode: 'manual',
  });
  res.flash('success', `Absensi ${emp.nama} tanggal ${b.tanggal} disimpan.`);
  res.redirect(`/admin/absensi?dari=${b.tanggal}&sampai=${b.tanggal}`);
});

router.get('/admin/absensi/:id', requireAdmin, (req, res) => {
  const rec = db.prepare(`SELECT a.*, e.nama, e.nip, e.jabatan, e.unit_kerja, e.face_photo,
      s.kode AS shift_kode, s.nama AS shift_nama, s.jam_masuk AS shift_masuk, s.jam_pulang AS shift_pulang
    FROM attendance a JOIN employees e ON e.id = a.employee_id LEFT JOIN shifts s ON s.id = a.shift_id WHERE a.id = ?`)
    .get(req.params.id);
  if (!rec) return res.status(404).render('error', { title: 'Tidak Ditemukan', message: 'Data absensi tidak ditemukan.' });
  const klarifikasi = db.prepare('SELECT * FROM clarifications WHERE employee_id = ? AND tanggal = ? ORDER BY id DESC')
    .all(rec.employee_id, rec.tanggal);
  const emp = db.prepare('SELECT id_mesin FROM employees WHERE id = ?').get(rec.employee_id);
  const scans = emp && emp.id_mesin ? db.prepare(`SELECT l.waktu, l.sumber, d.nama AS mesin FROM fingerprint_logs l
    LEFT JOIN devices d ON d.id = l.device_id WHERE l.pin = ? AND l.waktu BETWEEN ? AND ? ORDER BY l.waktu`)
    .all(emp.id_mesin, `${rec.tanggal} 00:00:00`, `${T.addDays(rec.tanggal, 1)} 23:59:59`)
    .filter((l) => l.waktu.slice(0, 10) === rec.tanggal || (rec.jam_pulang && l.waktu <= rec.jam_pulang)) : [];
  res.render('admin/attendance_detail', { title: 'Detail Absensi', rec, klarifikasi, scans });
});

router.post('/admin/absensi/:id/hapus', requireAdmin, (req, res) => {
  const rec = db.prepare('SELECT * FROM attendance WHERE id = ?').get(req.params.id);
  if (rec) {
    db.prepare('DELETE FROM attendance WHERE id = ?').run(rec.id);
    removeFile(rec.foto_masuk);
    removeFile(rec.foto_pulang);
    res.flash('success', 'Data absensi dihapus.');
  }
  res.redirect('/admin/absensi');
});

module.exports = router;
module.exports.rekap = rekap;
