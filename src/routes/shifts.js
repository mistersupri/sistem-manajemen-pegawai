const express = require('express');
const { db } = require('../db');
const { requireAdmin } = require('../auth');
const T = require('../time');
const { importUpload } = require('../uploads');
const { isWorkday } = require('../attendance');
const { ExcelJS, readTable, addSheet, sendWorkbook } = require('../excel');

const router = express.Router();

// ---------- Master shift ----------
function normalizeShift(b) {
  const data = {
    kode: String(b.kode || '').trim().toUpperCase(),
    nama: String(b.nama || '').trim(),
    jam_masuk: String(b.jam_masuk || '').trim(),
    jam_pulang: String(b.jam_pulang || '').trim(),
    toleransi_menit: parseInt(b.toleransi_menit, 10) || 0,
    warna: /^#[0-9a-f]{6}$/i.test(b.warna || '') ? b.warna : '#0d6efd',
    aktif: b.aktif ? 1 : 0,
  };
  const errors = [];
  if (!/^[A-Z0-9_-]{1,10}$/.test(data.kode)) errors.push('Kode shift 1-10 karakter (huruf/angka).');
  if (['L', 'LIBUR'].includes(data.kode)) errors.push('Kode "L"/"LIBUR" dipakai untuk hari libur.');
  if (!data.nama) errors.push('Nama shift wajib diisi.');
  if (!T.isValidTime(data.jam_masuk) || !T.isValidTime(data.jam_pulang)) errors.push('Jam harus format HH:MM.');
  if (data.jam_masuk === data.jam_pulang) errors.push('Jam masuk dan jam pulang tidak boleh sama.');
  if (data.toleransi_menit < 0 || data.toleransi_menit > 240) errors.push('Toleransi 0-240 menit.');
  return { data, errors };
}

router.get('/admin/shift', requireAdmin, (req, res) => {
  const list = db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM employees e WHERE e.default_shift_id = s.id) AS jumlah_pegawai
    FROM shifts s ORDER BY s.aktif DESC, s.jam_masuk`).all();
  const edit = req.query.edit ? db.prepare('SELECT * FROM shifts WHERE id = ?').get(req.query.edit) : null;
  res.render('admin/shifts', { title: 'Shift Kerja', list, edit, errors: [] });
});

router.post('/admin/shift', requireAdmin, (req, res) => {
  const id = parseInt(req.body.id, 10) || null;
  const { data, errors } = normalizeShift(req.body);
  if (db.prepare('SELECT 1 FROM shifts WHERE kode = ? AND id IS NOT ?').get(data.kode, id)) errors.push('Kode shift sudah dipakai.');
  if (errors.length) {
    const list = db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM employees e WHERE e.default_shift_id = s.id) AS jumlah_pegawai
      FROM shifts s ORDER BY s.aktif DESC, s.jam_masuk`).all();
    return res.status(400).render('admin/shifts', { title: 'Shift Kerja', list, edit: { ...data, id }, errors });
  }
  if (id) {
    db.prepare('UPDATE shifts SET kode=?, nama=?, jam_masuk=?, jam_pulang=?, toleransi_menit=?, warna=?, aktif=? WHERE id=?')
      .run(data.kode, data.nama, data.jam_masuk, data.jam_pulang, data.toleransi_menit, data.warna, data.aktif, id);
  } else {
    db.prepare('INSERT INTO shifts (kode, nama, jam_masuk, jam_pulang, toleransi_menit, warna, aktif) VALUES (?,?,?,?,?,?,?)')
      .run(data.kode, data.nama, data.jam_masuk, data.jam_pulang, data.toleransi_menit, data.warna, data.aktif);
  }
  res.flash('success', `Shift ${data.nama} disimpan.`);
  res.redirect('/admin/shift');
});

router.post('/admin/shift/:id/hapus', requireAdmin, (req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS n FROM attendance WHERE shift_id = ?').get(req.params.id).n;
  if (used) {
    db.prepare('UPDATE shifts SET aktif = 0 WHERE id = ?').run(req.params.id);
    res.flash('warning', 'Shift sudah dipakai di data absensi, sehingga hanya dinonaktifkan.');
  } else {
    db.prepare('DELETE FROM shifts WHERE id = ?').run(req.params.id);
    res.flash('success', 'Shift dihapus.');
  }
  res.redirect('/admin/shift');
});

// ---------- Jadwal shift (per pegawai per tanggal) ----------
function monthDays(bulan) {
  const [y, m] = bulan.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return T.dateRange(`${bulan}-01`, `${bulan}-${T.pad(last)}`);
}

function validMonth(v) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v || '') ? v : T.fmtDate(new Date()).slice(0, 7);
}

function scheduleData(bulan, unit) {
  const days = monthDays(bulan);
  const params = [];
  let where = "e.status = 'aktif'";
  if (unit) { where += ' AND e.unit_kerja = ?'; params.push(unit); }
  const employees = db.prepare(`SELECT e.id, e.nip, e.nama, e.unit_kerja, e.default_shift_id FROM employees e
    WHERE ${where} ORDER BY e.unit_kerja, e.nama`).all(...params);
  const rows = db.prepare('SELECT employee_id, tanggal, shift_id FROM shift_schedules WHERE tanggal BETWEEN ? AND ?')
    .all(days[0], days[days.length - 1]);
  const map = {};
  for (const r of rows) map[`${r.employee_id}|${r.tanggal}`] = r.shift_id === null ? 'L' : r.shift_id;
  const shifts = db.prepare('SELECT * FROM shifts ORDER BY jam_masuk').all();
  const workday = Object.fromEntries(days.map((d) => [d, isWorkday(d)]));
  const libur = Object.fromEntries(db.prepare('SELECT tanggal, keterangan FROM hari_libur WHERE tanggal BETWEEN ? AND ?')
    .all(days[0], days[days.length - 1]).map((r) => [r.tanggal, r.keterangan]));
  return { days, employees, map, shifts, workday, libur };
}

router.get('/admin/jadwal', requireAdmin, (req, res) => {
  const bulan = validMonth(req.query.bulan);
  const unit = req.query.unit || '';
  const units = db.prepare("SELECT DISTINCT unit_kerja FROM employees WHERE unit_kerja IS NOT NULL AND unit_kerja <> '' ORDER BY unit_kerja")
    .all().map((r) => r.unit_kerja);
  res.render('admin/schedule', { title: 'Jadwal Shift', bulan, unit, units, ...scheduleData(bulan, unit) });
});

function setSchedule(employeeId, tanggal, value) {
  // value: 'default' (hapus jadwal khusus), 'L' (libur), atau id shift
  if (value === 'default' || value === '' || value == null) {
    db.prepare('DELETE FROM shift_schedules WHERE employee_id = ? AND tanggal = ?').run(employeeId, tanggal);
    return;
  }
  const shiftId = value === 'L' ? null : parseInt(value, 10);
  db.prepare(`INSERT INTO shift_schedules (employee_id, tanggal, shift_id) VALUES (?, ?, ?)
    ON CONFLICT(employee_id, tanggal) DO UPDATE SET shift_id = excluded.shift_id`).run(employeeId, tanggal, shiftId);
}

router.post('/api/jadwal', requireAdmin, (req, res) => {
  const { employee_id: empId, tanggal, value } = req.body;
  if (!T.isValidDate(tanggal)) return res.status(400).json({ error: 'Tanggal tidak valid.' });
  if (!db.prepare('SELECT 1 FROM employees WHERE id = ?').get(empId)) return res.status(404).json({ error: 'Pegawai tidak ditemukan.' });
  if (!['default', 'L'].includes(value) && !db.prepare('SELECT 1 FROM shifts WHERE id = ?').get(value)) {
    return res.status(400).json({ error: 'Shift tidak valid.' });
  }
  setSchedule(empId, tanggal, value);
  res.json({ ok: true });
});

router.post('/admin/jadwal/massal', requireAdmin, (req, res) => {
  const b = req.body;
  const ids = [].concat(b.employee_ids || []).map(Number).filter(Boolean);
  const hari = [].concat(b.hari || []).map(Number);
  const back = `/admin/jadwal?bulan=${String(b.dari || '').slice(0, 7)}`;
  if (!ids.length || !T.isValidDate(b.dari) || !T.isValidDate(b.sampai) || b.dari > b.sampai) {
    res.flash('danger', 'Pilih pegawai dan rentang tanggal yang valid.');
    return res.redirect(back);
  }
  if (T.dateRange(b.dari, b.sampai).length > 366) {
    res.flash('danger', 'Rentang tanggal maksimal 1 tahun.');
    return res.redirect(back);
  }
  if (!['default', 'L'].includes(b.value) && !db.prepare('SELECT 1 FROM shifts WHERE id = ?').get(b.value)) {
    res.flash('danger', 'Shift tidak valid.');
    return res.redirect(back);
  }
  let n = 0;
  db.transaction(() => {
    for (const d of T.dateRange(b.dari, b.sampai)) {
      if (hari.length && !hari.includes(T.parseDateTime(d).getDay())) continue;
      for (const id of ids) { setSchedule(id, d, b.value); n++; }
    }
  })();
  res.flash('success', `${n} jadwal diperbarui.`);
  res.redirect(back);
});

router.get('/admin/jadwal/export', requireAdmin, async (req, res) => {
  const bulan = validMonth(req.query.bulan);
  const { days, employees, map, shifts, workday } = scheduleData(bulan, req.query.unit || '');
  const kodeById = Object.fromEntries(shifts.map((s) => [s.id, s.kode]));
  const columns = [
    { header: 'NIP', key: 'nip', width: 22 },
    { header: 'Nama', key: 'nama', width: 28 },
    ...days.map((d) => ({ header: d, key: d, width: 11 })),
  ];
  const rows = employees.map((e) => {
    const r = { nip: e.nip, nama: e.nama };
    for (const d of days) {
      const v = map[`${e.id}|${d}`];
      r[d] = v === 'L' ? 'L' : v ? kodeById[v] : !e.default_shift_id ? '' : workday[d] ? kodeById[e.default_shift_id] : 'L';
    }
    return r;
  });
  const wb = new ExcelJS.Workbook();
  addSheet(wb, `Jadwal ${bulan}`, columns, rows);
  const ket = wb.addWorksheet('Keterangan');
  ket.addRow(['Kode', 'Nama Shift', 'Jam Masuk', 'Jam Pulang']);
  shifts.forEach((s) => ket.addRow([s.kode, s.nama, s.jam_masuk, s.jam_pulang]));
  ket.addRow(['L', 'Libur', '', '']);
  ket.getRow(1).font = { bold: true };
  await sendWorkbook(res, wb, `jadwal-shift-${bulan}.xlsx`);
});

router.post('/admin/jadwal/import', requireAdmin, importUpload.single('file'), async (req, res) => {
  if (!req.file) {
    res.flash('danger', 'File belum dipilih.');
    return res.redirect('/admin/jadwal');
  }
  let rows;
  try {
    rows = await readTable(req.file.buffer, req.file.originalname);
  } catch (err) {
    res.flash('danger', `Gagal membaca file: ${err.message}`);
    return res.redirect('/admin/jadwal');
  }
  const shiftByKode = Object.fromEntries(db.prepare('SELECT id, kode FROM shifts').all().map((s) => [s.kode.toUpperCase(), s.id]));
  const errors = [];
  let n = 0;
  let firstMonth = null;
  db.transaction(() => {
    for (const row of rows) {
      const emp = db.prepare('SELECT id FROM employees WHERE nip = ?').get(row.nip || '');
      if (!emp) { errors.push(`Baris ${row.__row}: NIP "${row.nip}" tidak ditemukan.`); continue; }
      for (const [key, raw] of Object.entries(row)) {
        // Header tanggal "2026-10-01" dinormalisasi menjadi "2026_10_01"
        const m = /^(\d{4})_(\d{2})_(\d{2})$/.exec(key);
        if (!m) continue;
        const tanggal = `${m[1]}-${m[2]}-${m[3]}`;
        const kode = String(raw || '').trim().toUpperCase();
        if (!kode || !T.isValidDate(tanggal)) continue;
        firstMonth = firstMonth || tanggal.slice(0, 7);
        if (kode === 'L' || kode === 'LIBUR') setSchedule(emp.id, tanggal, 'L');
        else if (shiftByKode[kode]) setSchedule(emp.id, tanggal, shiftByKode[kode]);
        else { errors.push(`Baris ${row.__row}, ${tanggal}: kode shift "${kode}" tidak dikenal.`); continue; }
        n++;
      }
    }
  })();
  const msg = `${n} jadwal diimpor.` + (errors.length ? ` ${errors.length} kesalahan: ${errors.slice(0, 5).join(' ')}` : '');
  res.flash(errors.length ? 'warning' : 'success', msg);
  res.redirect(`/admin/jadwal${firstMonth ? `?bulan=${firstMonth}` : ''}`);
});

// ---------- Hari libur nasional / cuti bersama ----------
router.get('/admin/hari-libur', requireAdmin, (req, res) => {
  const tahun = /^\d{4}$/.test(req.query.tahun || '') ? req.query.tahun : T.fmtDate(new Date()).slice(0, 4);
  const list = db.prepare("SELECT * FROM hari_libur WHERE tanggal LIKE ? ORDER BY tanggal").all(`${tahun}-%`);
  res.render('admin/holidays', { title: 'Hari Libur', list, tahun });
});

router.post('/admin/hari-libur', requireAdmin, (req, res) => {
  const { dari, keterangan } = req.body;
  const sampai = req.body.sampai || dari;
  const ket = String(keterangan || '').trim();
  if (!T.isValidDate(dari) || !T.isValidDate(sampai) || sampai < dari || !ket) {
    res.flash('danger', 'Isi tanggal dan keterangan hari libur dengan benar.');
    return res.redirect('/admin/hari-libur');
  }
  const days = T.dateRange(dari, sampai);
  if (days.length > 60) {
    res.flash('danger', 'Rentang hari libur maksimal 60 hari.');
    return res.redirect('/admin/hari-libur');
  }
  db.transaction(() => {
    for (const d of days) {
      db.prepare('INSERT INTO hari_libur (tanggal, keterangan) VALUES (?, ?) ON CONFLICT(tanggal) DO UPDATE SET keterangan = excluded.keterangan')
        .run(d, ket.slice(0, 200));
    }
  })();
  res.flash('success', `${days.length} hari libur disimpan: ${ket}. Jalankan "Proses Ulang" di menu Mesin bila data fingerprint periode ini sudah diimpor.`);
  res.redirect(`/admin/hari-libur?tahun=${dari.slice(0, 4)}`);
});

router.post('/admin/hari-libur/hapus', requireAdmin, (req, res) => {
  if (T.isValidDate(req.body.tanggal)) db.prepare('DELETE FROM hari_libur WHERE tanggal = ?').run(req.body.tanggal);
  res.flash('success', 'Hari libur dihapus.');
  res.redirect(`/admin/hari-libur?tahun=${String(req.body.tanggal || '').slice(0, 4)}`);
});

module.exports = router;
