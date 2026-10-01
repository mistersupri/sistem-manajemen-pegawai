const os = require('os');
const fs = require('fs');
const net = require('net');
const path = require('path');

process.env.DB_PATH = ':memory:';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'absensi-fp-'));
process.env.TZ = 'Asia/Jakarta';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');
const { db } = require('../src/db');
const fp = require('../src/fingerprint');
const { readXls } = require('../src/xls');

const FIXTURE = path.join(__dirname, 'fixtures', 'solution_report.xls');
let server;
let base;
let cookie = '';

async function req(method, url, { form, body } = {}) {
  const headers = { Cookie: cookie };
  let payload = body;
  if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
  const res = await fetch(base + url, { method, headers, body: payload, redirect: 'manual' });
  for (const c of res.headers.getSetCookie()) if (c.startsWith('sid=')) cookie = c.split(';')[0];
  return res;
}

// Simulator mesin X302: web service SOAP sederhana di port acak
let fakeDevice;
let fakePort;
const ATTLOG = [
  ['501', '2026-05-04 07:20:11'], ['501', '2026-05-04 16:35:40'],
  ['501', '2026-05-05 07:55:02'], ['777', '2026-05-04 08:00:00'],
];

before(async () => {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
  fakeDevice = net.createServer((sock) => {
    let buf = '';
    sock.on('data', (d) => {
      buf += d;
      if (!buf.includes('</GetAttLog>') && !buf.includes('</GetUserInfo>')) return;
      let xml;
      if (!buf.includes('<ArgComKey xsi:type="xsd:integer">123</ArgComKey>')) {
        xml = '<GetAttLogResponse><Information>Invalid ComKey</Information></GetAttLogResponse>';
      } else if (buf.includes('<GetAttLog>')) {
        xml = '<GetAttLogResponse>' + ATTLOG.map(([p, t]) => `<Row><PIN>${p}</PIN><DateTime>${t}</DateTime><Verified>1</Verified><Status>0</Status></Row>`).join('') + '</GetAttLogResponse>';
      } else {
        xml = '<GetUserInfoResponse><Row><PIN>1</PIN><Name>Dewi Lan</Name><PIN2>501</PIN2></Row><Row><PIN>2</PIN><Name>Eko Lan</Name><PIN2>777</PIN2></Row></GetUserInfoResponse>';
      }
      sock.end(`HTTP/1.0 200 OK\r\nContent-Type: text/xml\r\n\r\n${xml}`);
    });
  });
  await new Promise((r) => fakeDevice.listen(0, '127.0.0.1', r));
  fakePort = fakeDevice.address().port;
  await req('POST', '/login', { form: { username: 'admin', password: 'admin123' } });
});
after(() => { server.close(); fakeDevice.close(); });

test('pembaca .xls membaca laporan standar Solution', () => {
  const sheets = readXls(fs.readFileSync(FIXTURE));
  assert.deepEqual(sheets.map((s) => s.name), ['Jadwal Info', 'Lap. Log Absen']);
  const parsed = fp.parseSolutionReport(sheets);
  assert.deepEqual(parsed.period, { dari: '2026-05-01', sampai: '2026-05-07' });
  assert.equal(parsed.users.length, 3);
  assert.deepEqual(parsed.users[0], { pin: '9001', nama: 'Andi Uji', departemen: 'TATA_USAHA' });
  const andi = parsed.logs.filter((l) => l.pin === '9001').map((l) => l.waktu);
  // "07:2507:2616:3016:30" -> 3 scan unik pada 4 Mei
  assert.deepEqual(andi.slice(0, 3), ['2026-05-04 07:25:00', '2026-05-04 07:26:00', '2026-05-04 16:30:00']);
  assert.equal(parsed.logs.length, 9);
});

test('format attlog teks & CSV', async () => {
  const dat = await fp.parseExportFile(Buffer.from('    9001\t2026-05-04 07:20:11\t1\t0\t1\t0\r\n'), '1_attlog.dat');
  assert.deepEqual(dat.logs[0], { pin: '9001', waktu: '2026-05-04 07:20:11', verify: '1', status: '0' });
  const csv = await fp.parseExportFile(Buffer.from('No;EnNo;Name;DateTime\n1;12;Budi;04/05/2026 07:30\n'), 'glog.csv');
  assert.equal(csv.logs[0].waktu, '2026-05-04 07:30:00');
  assert.equal(csv.logs[0].pin, '12');
  const split = await fp.parseExportFile(Buffer.from('ID,Tanggal,Jam\n5,2026-05-04,07:45\n'), 'x.csv');
  assert.equal(split.logs[0].waktu, '2026-05-04 07:45:00');
});

test('impor file USB, pemetaan ID mesin, dan pembentukan absensi', async () => {
  const reg = db.prepare("SELECT id FROM shifts WHERE kode = 'REG'").get(); // 07:30-16:00, toleransi 15
  await req('POST', '/admin/pegawai', { form: { nip: '1990001', nama: 'Andi Uji', unit_kerja: 'Tata Usaha', default_shift_id: reg.id } });
  let res = await req('POST', '/admin/mesin', { form: { nama: 'P280 Lobi', tipe: 'p280', koneksi: 'usb' } });
  assert.equal(res.status, 302);
  const dev = db.prepare("SELECT * FROM devices WHERE nama = 'P280 Lobi'").get();

  const fd = new FormData();
  fd.set('device_id', String(dev.id));
  fd.set('file', new Blob([fs.readFileSync(FIXTURE)]), 'StandardReport.xls');
  res = await req('POST', '/admin/mesin/impor', { body: fd });
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /9<\/b> baru/);
  assert.match(html, /2<\/b> ID mesin belum terhubung/);

  // Impor ulang file yang sama: tidak ada duplikasi
  const fd2 = new FormData();
  fd2.set('file', new Blob([fs.readFileSync(FIXTURE)]), 'StandardReport.xls');
  fd2.set('device_id', String(dev.id));
  assert.match(await (await req('POST', '/admin/mesin/impor', { body: fd2 })).text(), /0<\/b> baru, 9 sudah pernah/);

  // Halaman pemetaan menebak pegawai dengan nama sama
  res = await req('GET', '/admin/mesin/pemetaan');
  const page = await res.text();
  const emp = db.prepare("SELECT * FROM employees WHERE nip = '1990001'").get();
  assert.match(page, new RegExp(`<option value="${emp.id}" selected>`));

  const form = new URLSearchParams();
  form.append('map_pin', '9001'); form.append('map_emp', String(emp.id));
  form.append('map_pin', '9002'); form.append('map_emp', '');
  res = await fetch(`${base}/admin/mesin/pemetaan`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(), redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(db.prepare('SELECT id_mesin FROM employees WHERE id = ?').get(emp.id).id_mesin, '9001');

  const rec = (d) => db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND tanggal = ?').get(emp.id, d);
  assert.equal(rec('2026-05-04').jam_masuk, '2026-05-04 07:25:00');
  assert.equal(rec('2026-05-04').jam_pulang, '2026-05-04 16:30:00');
  assert.equal(rec('2026-05-04').status, 'hadir');
  assert.equal(rec('2026-05-04').metode_masuk, 'fingerprint');
  assert.equal(rec('2026-05-05').status, 'terlambat');
  assert.equal(rec('2026-05-05').terlambat_menit, 20);
  // Satu scan sore -> absen pulang saja; satu scan pagi -> absen masuk saja
  assert.equal(rec('2026-05-06').jam_masuk, null);
  assert.equal(rec('2026-05-06').jam_pulang, '2026-05-06 16:40:00');
  assert.equal(rec('2026-05-07').jam_masuk, '2026-05-07 07:10:00');
  assert.equal(rec('2026-05-07').jam_pulang, null);

  // Buat pegawai otomatis dari ID mesin yang belum terdaftar
  res = await req('POST', '/admin/mesin/pemetaan/buat', { form: { pins: '9002', shift_id: String(reg.id) } });
  const budi = db.prepare("SELECT * FROM employees WHERE id_mesin = '9002'").get();
  assert.equal(budi.nama, 'Budi Coba');
  assert.equal(budi.unit_kerja, 'PTK');
  assert.ok(db.prepare('SELECT 1 FROM attendance WHERE employee_id = ? AND tanggal = ?').get(budi.id, '2026-05-04'));

  for (const url of ['/admin/mesin', '/admin/mesin/log?dari=2026-05-01&sampai=2026-05-31', '/admin/mesin/pemetaan',
    `/admin/absensi/${rec('2026-05-04').id}`]) {
    assert.equal((await req('GET', url)).status, 200, url);
  }
  res = await req('GET', '/admin/mesin/log/export?dari=2026-05-01&sampai=2026-05-31');
  assert.match(await res.text(), /9001,Andi Uji/);
});

test('scan fingerprint digabung dengan absen wajah (jam paling awal & paling akhir)', () => {
  const emp = db.prepare("SELECT * FROM employees WHERE id_mesin = '9001'").get();
  db.prepare("UPDATE attendance SET jam_masuk = '2026-05-07 07:05:00', metode_masuk = 'wajah' WHERE employee_id = ? AND tanggal = '2026-05-07'").run(emp.id);
  fp.importData({ users: [], logs: [{ pin: '9001', waktu: '2026-05-07 16:10:00' }] }, { sumber: 'usb' });
  const r = db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND tanggal = '2026-05-07'").get(emp.id);
  assert.equal(r.jam_masuk, '2026-05-07 07:05:00');
  assert.equal(r.metode_masuk, 'wajah');
  assert.equal(r.jam_pulang, '2026-05-07 16:10:00');
  assert.equal(r.metode_pulang, 'fingerprint');
});

test('shift malam: scan dini hari masuk ke tanggal kerja sebelumnya', () => {
  const malam = db.prepare("SELECT id FROM shifts WHERE kode = 'MALAM'").get();
  const id = db.prepare("INSERT INTO employees (nip, nama, default_shift_id, id_mesin) VALUES ('M1', 'Satpam Malam', ?, '8001')").run(malam.id).lastInsertRowid;
  fp.importData({ users: [], logs: [{ pin: '8001', waktu: '2026-05-04 21:58:00' }, { pin: '8001', waktu: '2026-05-05 06:03:00' }] }, { sumber: 'usb' });
  const r = db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND tanggal = '2026-05-04'").get(id);
  assert.equal(r.jam_masuk, '2026-05-04 21:58:00');
  assert.equal(r.jam_pulang, '2026-05-05 06:03:00');
  assert.equal(r.status, 'hadir');
});

test('X302 via LAN: tes koneksi, comm key salah, dan tarik data', async () => {
  let res = await req('POST', '/admin/mesin', {
    form: { nama: 'X302 Gerbang', tipe: 'x302', koneksi: 'lan', ip: '127.0.0.1', port: String(fakePort), comm_key: '999', auto_sync_menit: '0' },
  });
  assert.equal(res.status, 302);
  const dev = db.prepare("SELECT * FROM devices WHERE nama = 'X302 Gerbang'").get();
  await req('POST', `/admin/mesin/${dev.id}/tarik`);
  const failed = db.prepare('SELECT * FROM devices WHERE id = ?').get(dev.id);
  assert.equal(failed.last_sync_ok, 0);
  assert.match(failed.last_sync_status, /Comm Key/);

  db.prepare("UPDATE devices SET comm_key = '123' WHERE id = ?").run(dev.id);
  res = await req('POST', `/admin/mesin/${dev.id}/tes`);
  assert.equal(res.status, 302);
  const reg = db.prepare("SELECT id FROM shifts WHERE kode = 'REG'").get();
  const id = db.prepare("INSERT INTO employees (nip, nama, default_shift_id, id_mesin) VALUES ('L1', 'Dewi Lan', ?, '501')").run(reg.id).lastInsertRowid;
  res = await req('POST', `/admin/mesin/${dev.id}/tarik`);
  const html = await res.text();
  assert.match(html, /4<\/b> scan dibaca/);
  assert.equal(db.prepare('SELECT last_sync_ok FROM devices WHERE id = ?').get(dev.id).last_sync_ok, 1);
  const r = db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND tanggal = '2026-05-04'").get(id);
  assert.equal(r.jam_masuk, '2026-05-04 07:20:11');
  assert.equal(r.jam_pulang, '2026-05-04 16:35:40');
  // Nama dari GetUserInfo dipetakan lewat PIN2 yang dipakai di log
  assert.equal(db.prepare("SELECT nama FROM fingerprint_users WHERE pin = '777'").get().nama, 'Eko Lan');
});

test('mesin LAN tidak terjangkau memberi pesan jelas', async () => {
  const solution = require('../src/solution');
  const closed = net.createServer();
  await new Promise((r) => closed.listen(0, '127.0.0.1', r));
  const port = closed.address().port;
  await new Promise((r) => closed.close(r));
  await assert.rejects(solution.getUsers({ ip: '127.0.0.1', port, comm_key: '0' }), /ditolak/);
});
