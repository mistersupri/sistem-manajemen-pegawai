const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { requireAdmin, requirePegawai } = require('../auth');
const T = require('../time');
const face = require('../face');
const { saveDataUrl, removeFile, importUpload } = require('../uploads');
const { ExcelJS, readTable, addSheet, sendWorkbook, sendCsv } = require('../excel');

const router = express.Router();

const FIELDS = ['nip', 'nama', 'jenis_kelamin', 'jabatan', 'unit_kerja', 'email', 'telepon', 'alamat', 'tanggal_masuk', 'status'];

const EXPORT_COLUMNS = [
  { header: 'NIP', key: 'nip', width: 22 },
  { header: 'Nama', key: 'nama', width: 30 },
  { header: 'Jenis Kelamin', key: 'jenis_kelamin', width: 14 },
  { header: 'Jabatan', key: 'jabatan', width: 25 },
  { header: 'Unit Kerja', key: 'unit_kerja', width: 25 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Telepon', key: 'telepon', width: 16 },
  { header: 'Alamat', key: 'alamat', width: 35 },
  { header: 'Tanggal Masuk', key: 'tanggal_masuk', width: 15 },
  { header: 'Status', key: 'status', width: 10 },
  { header: 'Kode Shift', key: 'kode_shift', width: 12 },
  { header: 'Wajah Terdaftar', key: 'wajah', width: 15 },
];

function shifts() {
  return db.prepare('SELECT * FROM shifts WHERE aktif = 1 ORDER BY jam_masuk').all();
}

function units() {
  return db.prepare("SELECT DISTINCT unit_kerja FROM employees WHERE unit_kerja IS NOT NULL AND unit_kerja <> '' ORDER BY unit_kerja")
    .all().map((r) => r.unit_kerja);
}

/** Normalisasi & validasi input pegawai. Mengembalikan { data, errors }. */
function normalizeEmployee(input) {
  const data = {};
  for (const f of FIELDS) data[f] = String(input[f] ?? '').trim();
  const errors = [];
  if (!data.nip) errors.push('NIP wajib diisi.');
  else if (!/^[A-Za-z0-9._-]{1,30}$/.test(data.nip)) errors.push('NIP hanya boleh huruf, angka, titik, strip, garis bawah (maks 30).');
  if (!data.nama) errors.push('Nama wajib diisi.');
  const jk = data.jenis_kelamin.toUpperCase();
  data.jenis_kelamin = jk.startsWith('L') ? 'L' : jk.startsWith('P') ? 'P' : '';
  data.status = /^non/i.test(data.status) ? 'nonaktif' : 'aktif';
  if (data.tanggal_masuk && !T.isValidDate(data.tanggal_masuk)) {
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(data.tanggal_masuk);
    const conv = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
    if (T.isValidDate(conv)) data.tanggal_masuk = conv;
    else errors.push('Format tanggal masuk harus YYYY-MM-DD atau DD/MM/YYYY.');
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Format email tidak valid.');
  for (const f of FIELDS) if (data[f] === '') data[f] = null;
  return { data, errors };
}

function createEmployee(data, shiftId, password) {
  return db.transaction(() => {
    const info = db.prepare(`INSERT INTO employees (nip, nama, jenis_kelamin, jabatan, unit_kerja, email, telepon, alamat,
      tanggal_masuk, status, default_shift_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(data.nip, data.nama, data.jenis_kelamin, data.jabatan, data.unit_kerja, data.email, data.telepon, data.alamat,
        data.tanggal_masuk, data.status, shiftId);
    const id = info.lastInsertRowid;
    const username = db.prepare('SELECT 1 FROM users WHERE username = ?').get(data.nip) ? `${data.nip}-${id}` : data.nip;
    db.prepare("INSERT INTO users (username, password_hash, role, employee_id) VALUES (?, ?, 'pegawai', ?)")
      .run(username, bcrypt.hashSync(password || data.nip, 10), id);
    return id;
  })();
}

function updateEmployee(id, old, data, shiftId) {
  db.transaction(() => {
    db.prepare(`UPDATE employees SET nip=?, nama=?, jenis_kelamin=?, jabatan=?, unit_kerja=?, email=?, telepon=?, alamat=?,
      tanggal_masuk=?, status=?, default_shift_id=?, updated_at=datetime('now','localtime') WHERE id=?`)
      .run(data.nip, data.nama, data.jenis_kelamin, data.jabatan, data.unit_kerja, data.email, data.telepon, data.alamat,
        data.tanggal_masuk, data.status, shiftId, id);
    if (old.nip !== data.nip && !db.prepare('SELECT 1 FROM users WHERE username = ?').get(data.nip)) {
      db.prepare('UPDATE users SET username = ? WHERE employee_id = ? AND username = ?').run(data.nip, id, old.nip);
    }
    if (data.status !== 'aktif') {
      db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE employee_id = ?)').run(id);
    }
  })();
}

function parseShiftId(v) {
  const id = parseInt(v, 10);
  return id && db.prepare('SELECT 1 FROM shifts WHERE id = ?').get(id) ? id : null;
}

// ---------- Daftar pegawai ----------
function queryEmployees(q) {
  const where = [];
  const params = [];
  if (q.q) {
    where.push('(e.nama LIKE ? OR e.nip LIKE ? OR e.jabatan LIKE ?)');
    params.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`);
  }
  if (q.unit) { where.push('e.unit_kerja = ?'); params.push(q.unit); }
  if (q.status) { where.push('e.status = ?'); params.push(q.status); }
  return db.prepare(`SELECT e.*, s.kode AS shift_kode, s.nama AS shift_nama, s.warna AS shift_warna, u.username
    FROM employees e LEFT JOIN shifts s ON s.id = e.default_shift_id LEFT JOIN users u ON u.employee_id = e.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.nama`).all(...params);
}

router.get('/admin/pegawai', requireAdmin, (req, res) => {
  res.render('admin/employees', {
    title: 'Data Pegawai', employees: queryEmployees(req.query), units: units(),
    importResult: null,
  });
});

router.get('/admin/pegawai/baru', requireAdmin, (req, res) => {
  res.render('admin/employee_form', { title: 'Tambah Pegawai', emp: { status: 'aktif' }, shifts: shifts(), units: units(), errors: [] });
});

router.post('/admin/pegawai', requireAdmin, (req, res) => {
  const { data, errors } = normalizeEmployee(req.body);
  if (data.nip && db.prepare('SELECT 1 FROM employees WHERE nip = ?').get(data.nip)) errors.push('NIP sudah terdaftar.');
  if (req.body.password && req.body.password.length < 6) errors.push('Password minimal 6 karakter.');
  const shiftId = parseShiftId(req.body.default_shift_id);
  if (errors.length) {
    return res.status(400).render('admin/employee_form', {
      title: 'Tambah Pegawai', emp: { ...data, default_shift_id: shiftId }, shifts: shifts(), units: units(), errors,
    });
  }
  const id = createEmployee(data, shiftId, req.body.password);
  res.flash('success', `Pegawai ${data.nama} ditambahkan. Login: ${data.nip} / ${req.body.password ? '(password yang diisi)' : 'NIP'}.`);
  res.redirect(`/admin/pegawai/${id}/wajah`);
});

function loadEmployee(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) return next('route');
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).render('error', { title: 'Tidak Ditemukan', message: 'Pegawai tidak ditemukan.' });
  req.emp = emp;
  next();
}

router.get('/admin/pegawai/:id/edit', requireAdmin, loadEmployee, (req, res) => {
  const user = db.prepare('SELECT username FROM users WHERE employee_id = ?').get(req.emp.id);
  res.render('admin/employee_form', {
    title: 'Ubah Pegawai', emp: { ...req.emp, username: user && user.username }, shifts: shifts(), units: units(), errors: [],
  });
});

router.post('/admin/pegawai/:id', requireAdmin, loadEmployee, (req, res) => {
  const { data, errors } = normalizeEmployee(req.body);
  if (data.nip && db.prepare('SELECT 1 FROM employees WHERE nip = ? AND id <> ?').get(data.nip, req.emp.id)) {
    errors.push('NIP sudah dipakai pegawai lain.');
  }
  const shiftId = parseShiftId(req.body.default_shift_id);
  if (errors.length) {
    return res.status(400).render('admin/employee_form', {
      title: 'Ubah Pegawai', emp: { ...data, id: req.emp.id, default_shift_id: shiftId }, shifts: shifts(), units: units(), errors,
    });
  }
  updateEmployee(req.emp.id, req.emp, data, shiftId);
  res.flash('success', 'Data pegawai diperbarui.');
  res.redirect('/admin/pegawai');
});

router.post('/admin/pegawai/:id/hapus', requireAdmin, loadEmployee, (req, res) => {
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.emp.id);
  removeFile(req.emp.face_photo);
  res.flash('success', `Pegawai ${req.emp.nama} dihapus.`);
  res.redirect('/admin/pegawai');
});

router.post('/admin/pegawai/:id/reset-password', requireAdmin, loadEmployee, (req, res) => {
  db.prepare('UPDATE users SET password_hash = ? WHERE employee_id = ?').run(bcrypt.hashSync(req.emp.nip, 10), req.emp.id);
  db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE employee_id = ?)').run(req.emp.id);
  res.flash('success', `Password ${req.emp.nama} direset menjadi NIP.`);
  res.redirect(`/admin/pegawai/${req.emp.id}/edit`);
});

// ---------- Pendaftaran wajah ----------
router.get('/admin/pegawai/:id/wajah', requireAdmin, loadEmployee, (req, res) => {
  res.render('face_enroll', {
    title: 'Daftarkan Wajah', emp: req.emp, samples: face.samplesOf(req.emp).length,
    saveUrl: `/api/pegawai/${req.emp.id}/wajah`, backUrl: '/admin/pegawai', canReset: true,
  });
});

function saveFace(emp, body, replace) {
  const list = Array.isArray(body.descriptors) ? body.descriptors.map(face.parseDescriptor).filter(Boolean) : [];
  if (list.length < 1) throw Object.assign(new Error('Tidak ada data wajah yang valid.'), { status: 400, expose: true });
  // Tolak jika wajah ini sudah terdaftar sebagai pegawai lain.
  const { match } = face.identify(list[0]);
  if (match && match.id !== emp.id) {
    throw Object.assign(new Error(`Wajah ini mirip dengan pegawai lain yang sudah terdaftar (${match.nama}).`), { status: 409, expose: true });
  }
  const samples = (replace ? [] : face.samplesOf(emp)).concat(list).slice(-face.MAX_SAMPLES);
  let photo = emp.face_photo;
  if (body.photo) {
    photo = saveDataUrl(body.photo, `wajah/${emp.id}`);
    if (emp.face_photo) removeFile(emp.face_photo);
  }
  db.prepare("UPDATE employees SET face_descriptors = ?, face_photo = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(JSON.stringify(samples.map((d) => d.map((x) => Math.round(x * 1e6) / 1e6))), photo, emp.id);
  return samples.length;
}

router.post('/api/pegawai/:id/wajah', requireAdmin, loadEmployee, (req, res) => {
  const total = saveFace(req.emp, req.body, req.body.replace === true);
  res.json({ ok: true, samples: total });
});

router.post('/admin/pegawai/:id/wajah/hapus', requireAdmin, loadEmployee, (req, res) => {
  db.prepare('UPDATE employees SET face_descriptors = NULL, face_photo = NULL WHERE id = ?').run(req.emp.id);
  removeFile(req.emp.face_photo);
  res.flash('success', 'Data wajah dihapus. Pegawai dapat mendaftarkan ulang wajahnya.');
  res.redirect(`/admin/pegawai/${req.emp.id}/wajah`);
});

// Pegawai dapat mendaftarkan wajahnya sendiri satu kali (jika belum ada data wajah).
router.get('/pegawai/wajah', requirePegawai, (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.user.employee_id);
  res.render('face_enroll', {
    title: 'Daftarkan Wajah', emp, samples: face.samplesOf(emp).length,
    saveUrl: '/api/pegawai/wajah-saya', backUrl: '/pegawai', canReset: false,
  });
});

router.post('/api/pegawai/wajah-saya', requirePegawai, (req, res) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.user.employee_id);
  if (emp.face_descriptors) {
    return res.status(403).json({ error: 'Wajah sudah terdaftar. Hubungi admin untuk mendaftarkan ulang.' });
  }
  const total = saveFace(emp, req.body, true);
  res.json({ ok: true, samples: total });
});

// ---------- Export / Import ----------
function exportRows() {
  return queryEmployees({}).map((e) => ({ ...e, kode_shift: e.shift_kode || '', wajah: e.face_descriptors ? 'Ya' : 'Tidak' }));
}

router.get('/admin/pegawai/export', requireAdmin, async (req, res) => {
  const rows = exportRows();
  const stamp = T.fmtDate(new Date());
  if (req.query.format === 'csv') return sendCsv(res, EXPORT_COLUMNS, rows, `data-pegawai-${stamp}.csv`);
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'Pegawai', EXPORT_COLUMNS, rows, {
    title: `Data Pegawai - ${res.locals.settings.nama_instansi}`, subtitle: `Diekspor ${T.fmtTanggalIndo(stamp)}`,
  });
  await sendWorkbook(res, wb, `data-pegawai-${stamp}.xlsx`);
});

const TEMPLATE_COLUMNS = EXPORT_COLUMNS.filter((c) => c.key !== 'wajah').concat([{ header: 'Password', key: 'password', width: 14 }]);

router.get('/admin/pegawai/template', requireAdmin, async (req, res) => {
  const example = [{
    nip: '198001012010011001', nama: 'Budi Santoso', jenis_kelamin: 'L', jabatan: 'Staf Administrasi',
    unit_kerja: 'Bagian Umum', email: 'budi@contoh.go.id', telepon: '081234567890', alamat: 'Jl. Merdeka No. 1',
    tanggal_masuk: '2010-01-01', status: 'aktif', kode_shift: 'REG', password: '',
  }];
  if (req.query.format === 'csv') return sendCsv(res, TEMPLATE_COLUMNS, example, 'template-import-pegawai.csv');
  const wb = new ExcelJS.Workbook();
  addSheet(wb, 'Pegawai', TEMPLATE_COLUMNS, example);
  const info = wb.addWorksheet('Petunjuk');
  [
    ['Petunjuk Import Data Pegawai'],
    ['- Baris pertama adalah judul kolom, jangan diubah.'],
    ['- NIP dan Nama wajib diisi. NIP yang sudah ada akan diperbarui datanya.'],
    ['- Jenis Kelamin: L atau P. Status: aktif atau nonaktif.'],
    ['- Tanggal Masuk: format YYYY-MM-DD atau DD/MM/YYYY.'],
    ['- Kode Shift: ' + shifts().map((s) => `${s.kode} (${s.nama})`).join(', ')],
    ['- Password (opsional, min 6 karakter) hanya untuk pegawai baru. Jika kosong, password = NIP.'],
  ].forEach((r) => info.addRow(r));
  info.getColumn(1).width = 100;
  info.getRow(1).font = { bold: true };
  await sendWorkbook(res, wb, 'template-import-pegawai.xlsx');
});

router.post('/admin/pegawai/import', requireAdmin, importUpload.single('file'), async (req, res) => {
  const result = { created: 0, updated: 0, errors: [] };
  if (!req.file) {
    result.errors.push('File belum dipilih.');
  } else {
    let rows = [];
    try {
      rows = await readTable(req.file.buffer, req.file.originalname);
    } catch (err) {
      result.errors.push(`Gagal membaca file: ${err.message}`);
    }
    const shiftByKode = Object.fromEntries(db.prepare('SELECT id, kode FROM shifts').all().map((s) => [s.kode.toUpperCase(), s.id]));
    for (const row of rows) {
      const { data, errors } = normalizeEmployee(row);
      let shiftId = null;
      if (row.kode_shift) {
        shiftId = shiftByKode[row.kode_shift.toUpperCase()] || null;
        if (!shiftId) errors.push(`Kode shift "${row.kode_shift}" tidak dikenal.`);
      }
      if (row.password && row.password.length < 6) errors.push('Password minimal 6 karakter.');
      if (errors.length) {
        result.errors.push(`Baris ${row.__row}: ${errors.join(' ')}`);
        continue;
      }
      try {
        const old = db.prepare('SELECT * FROM employees WHERE nip = ?').get(data.nip);
        if (old) {
          updateEmployee(old.id, old, data, row.kode_shift ? shiftId : old.default_shift_id);
          result.updated++;
        } else {
          createEmployee(data, shiftId, row.password);
          result.created++;
        }
      } catch (err) {
        result.errors.push(`Baris ${row.__row}: ${err.message}`);
      }
    }
    if (!rows.length && !result.errors.length) result.errors.push('File tidak berisi data.');
  }
  res.render('admin/employees', {
    title: 'Data Pegawai', employees: queryEmployees({}), units: units(), importResult: result,
  });
});

module.exports = router;
