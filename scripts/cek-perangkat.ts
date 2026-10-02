// Diagnosa koneksi mesin Solution X302 (dan mesin lain dengan Web Service iWsService).
// Jalankan di komputer yang satu jaringan dengan mesin. Tidak butuh database dan tidak mengubah
// apa pun di mesin: hanya membaca daftar pengguna dan log absensi.
//
//   npm run perangkat:cek -- --ip 192.168.1.201
//   npm run perangkat:cek -- --ip 192.168.1.201 --key 1234 --port 80
//   npm run perangkat:cek -- --ip 192.168.1.201 --key 1234 --csv     juga simpan seluruh log ke berkas attlog
//
// Hasil: ringkasan di layar dan berkas laporan-x302-<ip>-<waktu>.json di folder saat ini.
// Laporan tidak memuat nama pegawai; aman dikirim ke pengembang untuk analisis.
import net from 'node:net';
import { writeFileSync } from 'node:fs';
import { checkResponse, parseRows, soapRequest, solutionSoapAdapter } from '../src/lib/devices/solution-soap';
import type { DeviceConfig } from '../src/lib/devices/adapter';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ip = opt('ip');
const port = Number(opt('port', '80'));
const key = opt('key', '0')!;
const timeoutMs = Number(opt('timeout', '15000'));

const ok = (m: string) => console.log(`  [OK]    ${m}`);
const bad = (m: string) => console.log(`  [GAGAL] ${m}`);
const info = (m: string) => console.log(`          ${m}`);

function tcp(host: string, p: number, ms = 3000) {
  return new Promise<{ open: boolean; error?: string; ms: number }>((resolve) => {
    const t0 = Date.now();
    const s = net.connect({ host, port: p });
    const done = (open: boolean, error?: string) => { s.destroy(); resolve({ open, error, ms: Date.now() - t0 }); };
    s.setTimeout(ms, () => done(false, 'timeout'));
    s.on('connect', () => done(true));
    s.on('error', (e: NodeJS.ErrnoException) => done(false, e.code ?? e.message));
  });
}

function httpBanner(host: string, p: number) {
  return new Promise<string | null>((resolve) => {
    const s = net.connect({ host, port: p });
    let data = '';
    s.setTimeout(4000, () => { s.destroy(); resolve(data || null); });
    s.on('connect', () => s.write(`GET / HTTP/1.0\r\nHost: ${host}\r\n\r\n`));
    s.on('data', (d) => { data += d.toString('latin1'); if (data.length > 2000) s.destroy(); });
    s.on('close', () => resolve(data || null));
    s.on('error', () => resolve(null));
  });
}

const fmtLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${d.toTimeString().slice(0, 8)}`;

async function main() {
  if (!ip || !/^[\w.-]+$/.test(ip)) {
    console.log('Pemakaian: npm run perangkat:cek -- --ip <alamat IP mesin> [--key <Comm Key>] [--port 80] [--csv]');
    process.exit(2);
  }
  const report: Record<string, unknown> = { alat: 'cek-perangkat', waktuKomputer: fmtLocal(new Date()), ip, port, commKeyDiisi: key !== '0' };
  const cfg: DeviceConfig = { id: 'cek', name: 'cek', host: ip, port, secret: key, timeoutMs, serialNumber: null };
  console.log(`\nMemeriksa mesin ${ip}:${port} (Comm Key ${key === '0' ? '0 / tidak diisi' : 'diisi'})\n`);

  console.log('1. Jaringan');
  const web = await tcp(ip, port);
  const zk = await tcp(ip, 4370);
  report.portWeb = web;
  report.port4370 = zk;
  if (web.open) ok(`port ${port} terbuka (${web.ms} ms)`);
  else {
    bad(`port ${port} tidak bisa dibuka: ${web.error}`);
    info(web.error === 'ECONNREFUSED' ? 'Mesin terjangkau tetapi Web Server/port ini tidak aktif. Periksa port di menu komunikasi mesin.'
      : 'Mesin tidak terjangkau. Periksa kabel LAN, alamat IP mesin, dan apakah komputer ini satu jaringan (coba: ping ' + ip + ').');
  }
  info(zk.open ? 'port 4370 (protokol SDK) juga terbuka' : 'port 4370 (protokol SDK) tertutup; tidak dipakai aplikasi ini');

  if (web.open) {
    const banner = await httpBanner(ip, port);
    const status = banner?.split('\r\n')[0] ?? null;
    const server = /\r\nServer:\s*([^\r\n]+)/i.exec(banner ?? '')?.[1] ?? null;
    report.http = { status, server };
    info(`respons web: ${status ?? '(tidak ada)'}${server ? `, server: ${server}` : ''}`);
  }

  console.log('\n2. Web Service (iWsService)');
  let users: Record<string, string>[] = [];
  if (web.open) {
    try {
      const xml = await soapRequest(cfg, 'GetUserInfo');
      report.contohResponsPengguna = xml.replace(/<Name>[^<]*<\/Name>/g, '<Name>[disamarkan]</Name>').replace(/<Password>[^<]*<\/Password>/g, '<Password>[disamarkan]</Password>').replace(/<Card>[^<]*<\/Card>/g, '<Card>[disamarkan]</Card>').slice(0, 800);
      checkResponse(xml, 'GetUserInfo');
      users = parseRows(xml);
      ok(`terhubung, ${users.length} pengguna terdaftar di mesin`);
      report.pengguna = { jumlah: users.length, kolom: [...new Set(users.flatMap((u) => Object.keys(u)))], memakaiPIN2: users.some((u) => u.PIN2 && u.PIN2 !== u.PIN) };
    } catch (err) {
      bad((err as Error).message);
      report.galatPengguna = (err as Error).message;
    }
  } else info('dilewati karena port tidak terbuka');

  console.log('\n3. Log absensi');
  let scans: { pin: string; local: string; verifyMode?: string | null; statusCode?: string | null }[] = [];
  if (users.length || report.pengguna) {
    try {
      const t0 = Date.now();
      const r = await solutionSoapAdapter.fetch!(cfg, null);
      scans = r.scans;
      const times = scans.map((s) => s.local).sort();
      const now = fmtLocal(new Date());
      const future = times.filter((t) => t > now).length;
      const perDay = new Map<string, number>();
      for (const t of times) perDay.set(t.slice(0, 10), (perDay.get(t.slice(0, 10)) ?? 0) + 1);
      const last7 = [...perDay.entries()].sort().slice(-7);
      ok(`${scans.length} log terbaca dalam ${((Date.now() - t0) / 1000).toFixed(1)} detik`);
      if (times.length) {
        info(`log tertua ${times[0]}, terbaru ${times[times.length - 1]}`);
        info(`jam komputer ini ${now}`);
        info('jumlah scan 7 hari terakhir yang ada: ' + last7.map(([d, n]) => `${d.slice(5)}=${n}`).join(', '));
      }
      if (future) bad(`${future} log bertanggal di masa depan: jam mesin kemungkinan salah. Samakan jam mesin.`);
      report.log = {
        jumlah: scans.length, tertua: times[0] ?? null, terbaru: times[times.length - 1] ?? null, masaDepan: future,
        pinBerbeda: new Set(scans.map((s) => s.pin)).size, perHari7: Object.fromEntries(last7),
        modeVerifikasi: [...new Set(scans.map((s) => s.verifyMode))].slice(0, 10), status: [...new Set(scans.map((s) => s.statusCode))].slice(0, 10),
        contoh: scans.slice(-5).map((s) => ({ pin: s.pin, waktu: s.local, verify: s.verifyMode, status: s.statusCode })),
      };
    } catch (err) {
      bad((err as Error).message);
      report.galatLog = (err as Error).message;
    }
  } else info('dilewati karena Web Service belum terhubung');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = `laporan-x302-${ip}-${stamp}.json`;
  writeFileSync(out, JSON.stringify(report, null, 2));
  if (args.includes('--csv') && scans.length) {
    const file = `attlog-x302-${ip}-${stamp}.txt`;
    writeFileSync(file, scans.map((s) => [s.pin, s.local, s.verifyMode ?? '', s.statusCode ?? ''].join('\t')).join('\r\n') + '\r\n');
    console.log(`\nSeluruh log disimpan ke ${file}. Unggah di Perangkat Absensi, Status Sinkronisasi, Impor berkas (pilih perangkat X302 yang sama).`);
  }
  const success = !!report.log;
  console.log(`\nHasil: ${success ? 'mesin siap dihubungkan ke SIMPEG.' : 'belum berhasil, lihat [GAGAL] di atas dan docs/PANDUAN-X302.md.'}`);
  console.log(`Laporan (tanpa nama pegawai): ${out}\n`);
  process.exit(success ? 0 : 1);
}

main().catch((err) => { console.error(`Gagal: ${(err as Error).message}`); process.exit(1); });
