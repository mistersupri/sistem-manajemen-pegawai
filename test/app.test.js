const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DB_PATH = ':memory:';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'absensi-test-'));
process.env.TZ = 'Asia/Jakarta';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const app = require('../server');
const { db } = require('../src/db');
const T = require('../src/time');

let server;
let base;

// 1x1 JPEG
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function descriptor(seed) {
  // Descriptor sintetis: vektor acak deterministik dengan norma ~1 (mirip keluaran face-api).
  let x = seed * 9301 + 49297;
  const v = Array.from({ length: 128 }, () => { x = (x * 9301 + 49297) % 233280; return x / 233280 - 0.5; });
  const n = Math.hypot(...v);
  return v.map((a) => a / n);
}
const jitter = (d, amt = 0.01) => d.map((v, i) => v + (i % 2 ? amt : -amt));

class Client {
  constructor() { this.cookie = ''; }
  async req(method, url, { form, json, body, headers = {} } = {}) {
    const h = { ...headers, Cookie: this.cookie };
    let payload = body;
    if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
    if (json) { h['Content-Type'] = 'application/json'; h.Accept = 'application/json'; payload = JSON.stringify(json); }
    const res = await fetch(base + url, { method, headers: h, body: payload, redirect: 'manual' });
    const set = res.headers.getSetCookie();
    for (const c of set) {
      const [pair] = c.split(';');
      const [name] = pair.split('=');
      const rest = this.cookie.split('; ').filter((x) => x && !x.startsWith(`${name}=`));
      if (!/=;|Expires=Thu, 01 Jan 1970/.test(c)) rest.push(pair);
      this.cookie = rest.join('; ');
    }
    return res;
  }
  get(url) { return this.req('GET', url); }
  post(url, opts) { return this.req('POST', url, opts); }
}

const admin = new Client();

before(async () => {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('login admin', async () => {
  const bad = await admin.post('/login', { form: { username: 'admin', password: 'salah' } });
  assert.equal(bad.status, 401);
  const res = await admin.post('/login', { form: { username: 'admin', password: 'admin123' } });
  assert.equal(res.status, 302);
  assert.match(admin.cookie, /sid=/);
  const dash = await admin.get('/admin');
  assert.equal(dash.status, 200);
});

test('tambah pegawai & pendaftaran wajah', async () => {
  const reg = db.prepare("SELECT id FROM shifts WHERE kode = 'REG'").get();
  let res = await admin.post('/admin/pegawai', {
    form: { nip: '1001', nama: 'Budi Santoso', jenis_kelamin: 'L', jabatan: 'Staf', unit_kerja: 'Umum', status: 'aktif', default_shift_id: reg.id },
  });
  assert.equal(res.status, 302);
  res = await admin.post('/admin/pegawai', { form: { nip: '1001', nama: 'Duplikat' } });
  assert.equal(res.status, 400);
  const emp = db.prepare("SELECT * FROM employees WHERE nip = '1001'").get();
  assert.ok(emp);

  res = await admin.post(`/api/pegawai/${emp.id}/wajah`, { json: { descriptors: [descriptor(1), jitter(descriptor(1))], photo: JPEG } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).samples, 2);

  // Wajah yang sama tidak boleh didaftarkan untuk pegawai lain
  await admin.post('/admin/pegawai', { form: { nip: '1002', nama: 'Siti Aminah', unit_kerja: 'Keuangan', default_shift_id: reg.id } });
  const emp2 = db.prepare("SELECT * FROM employees WHERE nip = '1002'").get();
  res = await admin.post(`/api/pegawai/${emp2.id}/wajah`, { json: { descriptors: [descriptor(1)] } });
  assert.equal(res.status, 409);
  res = await admin.post(`/api/pegawai/${emp2.id}/wajah`, { json: { descriptors: [descriptor(2)] } });
  assert.equal(res.status, 200);
});

test('kiosk: wajah dikenali & absen masuk/pulang', async () => {
  let res = await admin.post('/api/kiosk/absen', { json: { descriptor: jitter(descriptor(1), 0.005), mode: 'masuk', photo: JPEG } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.nama, 'Budi Santoso');
  res = await admin.post('/api/kiosk/absen', { json: { descriptor: descriptor(1), mode: 'masuk' } });
  assert.equal(res.status, 409, 'absen masuk ganda ditolak');
  res = await admin.post('/api/kiosk/absen', { json: { descriptor: descriptor(99), mode: 'masuk' } });
  assert.equal(res.status, 404, 'wajah asing ditolak');
  res = await admin.post('/api/kiosk/absen', { json: { descriptor: descriptor(1), mode: 'pulang' } });
  assert.equal(res.status, 200);
  const rec = db.prepare("SELECT a.* FROM attendance a JOIN employees e ON e.id = a.employee_id WHERE e.nip = '1001'").get();
  assert.ok(rec.jam_masuk && rec.jam_pulang);
  assert.equal(rec.metode_masuk, 'wajah');
  assert.ok(rec.foto_masuk);
});

const pegawai = new Client();

test('pegawai login dengan NIP, absen dinas luar dengan foto GPS', async () => {
  let res = await pegawai.post('/login', { form: { username: '1002', password: '1002' } });
  assert.equal(res.status, 302);
  res = await pegawai.get('/pegawai');
  assert.equal(res.status, 200);
  res = await pegawai.get('/admin');
  assert.equal(res.status, 403, 'pegawai tidak boleh akses admin');

  res = await pegawai.post('/api/pegawai/dinas-luar', { json: { mode: 'masuk', descriptor: descriptor(2), photo: JPEG } });
  assert.equal(res.status, 400, 'GPS wajib');
  res = await pegawai.post('/api/pegawai/dinas-luar', {
    json: { mode: 'masuk', descriptor: descriptor(1), photo: JPEG, lat: -6.2, lng: 106.8 },
  });
  assert.equal(res.status, 403, 'wajah orang lain ditolak');
  res = await pegawai.post('/api/pegawai/dinas-luar', {
    json: { mode: 'masuk', descriptor: jitter(descriptor(2)), photo: JPEG, lat: -6.2, lng: 106.8, alamat: 'Jakarta', keterangan: 'Rapat' },
  });
  assert.equal(res.status, 200, await res.clone().text());
  const rec = db.prepare("SELECT a.* FROM attendance a JOIN employees e ON e.id = a.employee_id WHERE e.nip = '1002'").get();
  assert.equal(rec.status, 'dinas_luar');
  assert.equal(rec.lat_masuk, -6.2);
  assert.match(rec.keterangan, /Rapat/);

  // Foto hanya bisa diakses pemiliknya / admin
  const other = db.prepare("SELECT foto_masuk FROM attendance a JOIN employees e ON e.id = a.employee_id WHERE e.nip = '1001'").get();
  assert.equal((await pegawai.get(`/uploads/${rec.foto_masuk}`)).status, 200);
  assert.equal((await pegawai.get(`/uploads/${other.foto_masuk}`)).status, 403);
  assert.equal((await admin.get(`/uploads/${other.foto_masuk}`)).status, 200);
});

test('geofence absen mandiri', async () => {
  await admin.post('/admin/pengaturan', {
    form: { nama_instansi: 'Uji', face_threshold: '0.5', office_lat: '-6.175', office_lng: '106.827', office_radius: '100', enforce_geofence: '1', self_checkin: '1' },
  });
  const res = await pegawai.post('/api/pegawai/absen', { json: { mode: 'pulang', descriptor: descriptor(2), photo: JPEG, lat: -6.3, lng: 106.9 } });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /dari kantor/);
  const ok = await pegawai.post('/api/pegawai/absen', { json: { mode: 'pulang', descriptor: descriptor(2), photo: JPEG, lat: -6.1752, lng: 106.8271 } });
  assert.equal(ok.status, 200);
});

test('klarifikasi absen: ajukan & setujui', async () => {
  const kemarin = T.addDays(T.fmtDate(new Date()), -1);
  const fd = new FormData();
  fd.set('tanggal', kemarin);
  fd.set('jenis', 'lupa_absen');
  fd.set('jam_masuk', '07:25');
  fd.set('jam_pulang', '16:05');
  fd.set('alasan', 'Perangkat absensi sedang gangguan listrik.');
  fd.set('lampiran', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'surat.pdf');
  let res = await pegawai.post('/pegawai/klarifikasi', { body: fd });
  assert.equal(res.status, 302);
  const c = db.prepare('SELECT * FROM clarifications ORDER BY id DESC').get();
  assert.equal(c.status, 'menunggu');
  assert.ok(c.lampiran.endsWith('.pdf'));

  res = await admin.get(`/admin/klarifikasi/${c.id}`);
  assert.equal(res.status, 200);
  res = await admin.post(`/admin/klarifikasi/${c.id}/proses`, { form: { aksi: 'setujui', jam_masuk: '07:25', jam_pulang: '16:05', status: 'hadir' } });
  assert.equal(res.status, 302);
  const rec = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND tanggal = ?').get(c.employee_id, kemarin);
  assert.equal(rec.jam_masuk, `${kemarin} 07:25:00`);
  assert.equal(rec.metode_masuk, 'klarifikasi');
  assert.equal(db.prepare('SELECT status FROM clarifications WHERE id = ?').get(c.id).status, 'disetujui');
});

test('shift & jadwal', async () => {
  let res = await admin.post('/admin/shift', { form: { kode: 'X1', nama: 'Uji', jam_masuk: '09:00', jam_pulang: '17:00', toleransi_menit: '5', warna: '#123456', aktif: '1' } });
  assert.equal(res.status, 302);
  const s = db.prepare("SELECT * FROM shifts WHERE kode = 'X1'").get();
  const emp = db.prepare("SELECT * FROM employees WHERE nip = '1001'").get();
  res = await admin.post('/api/jadwal', { json: { employee_id: emp.id, tanggal: '2030-01-01', value: String(s.id) } });
  assert.equal(res.status, 200);
  res = await admin.post('/admin/jadwal/massal', { form: { employee_ids: String(emp.id), dari: '2030-01-02', sampai: '2030-01-08', hari: '0', value: 'L' } });
  assert.equal(res.status, 302);
  const libur = db.prepare('SELECT COUNT(*) AS n FROM shift_schedules WHERE employee_id = ? AND shift_id IS NULL').get(emp.id).n;
  assert.equal(libur, 1, 'hanya hari Minggu yang diset libur');
  res = await admin.get('/admin/jadwal?bulan=2030-01');
  assert.equal(res.status, 200);
  res = await admin.get('/admin/jadwal/export?bulan=2030-01');
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  assert.equal(wb.worksheets[0].getRow(1).getCell(3).value, '2030-01-01');
});

test('ekspor & impor pegawai', async () => {
  let res = await admin.get('/admin/pegawai/export?format=xlsx');
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  assert.equal(wb.worksheets[0].name, 'Pegawai');

  res = await admin.get('/admin/pegawai/export?format=csv');
  assert.match(await res.text(), /Budi Santoso/);

  const csv = 'NIP;Nama;Jenis Kelamin;Unit Kerja;Kode Shift;Tanggal Masuk\n2001;Andi Wijaya;L;IT;PAGI;15/02/2020\n1001;Budi Santoso Updated;L;Umum;REG;\n;Tanpa NIP;P;;;\n2002;Kode Salah;P;IT;ZZZ;\n';
  const fd = new FormData();
  fd.set('file', new Blob([csv], { type: 'text/csv' }), 'pegawai.csv');
  res = await admin.post('/admin/pegawai/import', { body: fd });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /1 pegawai baru, 1 diperbarui/);
  assert.match(html, /Baris 4/);
  assert.match(html, /ZZZ/);
  const andi = db.prepare("SELECT * FROM employees WHERE nip = '2001'").get();
  assert.equal(andi.tanggal_masuk, '2020-02-15');
  assert.ok(db.prepare("SELECT 1 FROM users WHERE username = '2001'").get());
  assert.equal(db.prepare("SELECT nama FROM employees WHERE nip = '1001'").get().nama, 'Budi Santoso Updated');

  // Impor xlsx dari template
  res = await admin.get('/admin/pegawai/template');
  const tpl = new ExcelJS.Workbook();
  await tpl.xlsx.load(Buffer.from(await res.arrayBuffer()));
  tpl.worksheets[0].getRow(2).getCell(1).value = '3001';
  const buf = await tpl.xlsx.writeBuffer();
  const fd2 = new FormData();
  fd2.set('file', new Blob([buf]), 'template.xlsx');
  res = await admin.post('/admin/pegawai/import', { body: fd2 });
  assert.match(await res.text(), /1 pegawai baru/);
  assert.ok(db.prepare("SELECT 1 FROM employees WHERE nip = '3001'").get());
});

test('ekspor absensi (xlsx & csv) dan halaman-halaman utama', async () => {
  const today = T.fmtDate(new Date());
  const from = T.addDays(today, -3);
  let res = await admin.get(`/admin/absensi/export?format=xlsx&dari=${from}&sampai=${today}`);
  assert.equal(res.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Rekap', 'Detail Absensi']);
  res = await admin.get(`/admin/absensi/export?format=csv&dari=${from}&sampai=${today}`);
  const csv = await res.text();
  assert.match(csv, /Dinas Luar/);
  res = await admin.get(`/admin/absensi/export?format=rekap-csv&dari=${from}&sampai=${today}`);
  assert.equal(res.status, 200);

  const rec = db.prepare('SELECT id FROM attendance LIMIT 1').get();
  const c = db.prepare('SELECT id FROM clarifications LIMIT 1').get();
  const emp = db.prepare('SELECT id FROM employees LIMIT 1').get();
  for (const url of ['/admin', '/admin/pegawai', '/admin/pegawai/baru', `/admin/pegawai/${emp.id}/edit`, `/admin/pegawai/${emp.id}/wajah`,
    '/admin/shift', '/admin/jadwal', '/admin/absensi', '/admin/rekap', '/admin/absensi/input', `/admin/absensi/input?employee_id=${emp.id}`,
    `/admin/absensi/${rec.id}`, '/admin/klarifikasi', '/admin/klarifikasi?status=semua', `/admin/klarifikasi/${c.id}`, '/admin/pengaturan', '/kiosk',
    '/akun/password']) {
    res = await admin.get(url);
    assert.equal(res.status, 200, url);
  }
  for (const url of ['/pegawai', '/pegawai/absen', '/pegawai/dinas-luar', '/pegawai/riwayat', '/pegawai/klarifikasi', '/pegawai/wajah']) {
    res = await pegawai.get(url);
    assert.equal(res.status, 200, url);
  }
});

test('akses tanpa login dialihkan', async () => {
  const anon = new Client();
  assert.equal((await anon.get('/admin')).status, 302);
  assert.equal((await anon.post('/api/kiosk/absen', { json: {} })).status, 401);
  assert.equal((await anon.get('/models/tiny_face_detector_model-weights_manifest.json')).status, 200);
});
