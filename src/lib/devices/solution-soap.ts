// Konektor Web Service (SOAP "iWsService", port 80) untuk mesin Solution seri X (mis. X302)
// dan mesin lain yang kompatibel dengan protokol yang sama. Memakai socket TCP mentah karena
// firmware mesin sering mengirim respons HTTP yang tidak standar.
// Status: BELUM DIUJI dengan perangkat fisik di instansi; uji dahulu sebelum dinyatakan siap.
import net from 'node:net';
import { cleanPin, normDateTime } from './parsers';
import { DeviceError, type DeviceAdapter, type DeviceConfig, type FetchResult } from './adapter';

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function soapRequest(cfg: DeviceConfig, method: string): Promise<string> {
  const host = cfg.host!;
  const port = cfg.port || 80;
  const body = `<${method}><ArgComKey xsi:type="xsd:integer">${escapeXml(cfg.secret || '0')}</ArgComKey><Arg><PIN xsi:type="xsd:integer">All</PIN></Arg></${method}>`;
  const endTag = `</${method}Response>`;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let done = false;
    const socket = net.connect({ host, port });
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) return reject(err);
      const text = Buffer.concat(chunks).toString('utf8');
      const idx = text.indexOf('\r\n\r\n');
      resolve(idx >= 0 && /^HTTP\//.test(text) ? text.slice(idx + 4) : text);
    };
    socket.on('connect', () => {
      socket.write(`POST /iWsService HTTP/1.0\r\nHost: ${host}\r\nContent-Type: text/xml\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}\r\n`);
    });
    socket.setTimeout(cfg.timeoutMs, () => finish(new DeviceError(`Mesin ${host} tidak merespons (timeout).`)));
    let tail = '';
    socket.on('data', (d: Buffer) => {
      chunks.push(d);
      // Cukup periksa ujung data; log mesin bisa berukuran beberapa MB.
      tail = (tail + d.toString('latin1')).slice(-(endTag.length + d.length));
      if (tail.includes(endTag)) finish();
    });
    socket.on('end', () => finish());
    socket.on('close', () => finish());
    socket.on('error', (err: NodeJS.ErrnoException) => {
      const msg: Record<string, string> = {
        ECONNREFUSED: `Koneksi ke ${host}:${port} ditolak. Pastikan Web Server mesin aktif dan port benar.`,
        EHOSTUNREACH: `Mesin ${host} tidak terjangkau. Periksa kabel LAN dan alamat IP mesin.`,
        ENETUNREACH: `Jaringan ke ${host} tidak terjangkau.`,
        ETIMEDOUT: `Mesin ${host} tidak merespons (timeout).`,
        ENOTFOUND: `Alamat ${host} tidak ditemukan.`,
      };
      finish(new DeviceError(msg[err.code ?? ''] ?? err.message));
    });
  });
}

export function parseRows(xml: string) {
  const rows: Record<string, string>[] = [];
  const re = /<Row>([\s\S]*?)<\/Row>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const row: Record<string, string> = {};
    const f = /<(\w+)>([^<]*)<\/\1>/g;
    let x: RegExpExecArray | null;
    while ((x = f.exec(m[1]))) row[x[1]] = decode(x[2]).trim();
    rows.push(row);
  }
  return rows;
}

export function checkResponse(xml: string, method: string) {
  if (/Invalid\s*Com\s*Key/i.test(xml)) throw new DeviceError('Mesin menolak permintaan: Comm Key (kata sandi komunikasi) salah.', false);
  if (!new RegExp(`<${method}Response`, 'i').test(xml)) {
    if (/Invalid|ComKey|Error/i.test(xml)) throw new DeviceError('Mesin menolak permintaan. Periksa Comm Key.', false);
    throw new DeviceError('Respons mesin tidak dikenali. Pastikan mesin mendukung Web Service (SOAP).', false);
  }
}

export const solutionSoapAdapter: DeviceAdapter = {
  id: 'SOLUTION_SOAP',
  label: 'Solution X302 / kompatibel iWsService (LAN)',
  maturity: 'BELUM_DIUJI',
  connection: 'LAN',
  pull: true,
  note: 'Menarik log lewat Web Service mesin (port 80, Comm Key). Belum diuji dengan unit fisik di instansi; lakukan uji koneksi dan bandingkan hasil tarikan dengan laporan mesin sebelum dipakai resmi.',
  async testConnection(cfg) {
    if (!cfg.host) return { ok: false, message: 'Alamat IP mesin belum diisi.' };
    try {
      const xml = await soapRequest(cfg, 'GetUserInfo');
      checkResponse(xml, 'GetUserInfo');
      return { ok: true, message: `Terhubung. ${parseRows(xml).length} pengguna terbaca di mesin.` };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  },
  async fetch(cfg, cursor): Promise<FetchResult> {
    if (!cfg.host) throw new DeviceError('Alamat IP mesin belum diisi.', false);
    const xml = await soapRequest(cfg, 'GetAttLog');
    checkResponse(xml, 'GetAttLog');
    // Mesin mengembalikan seluruh log; ambil yang setelah kursor dikurangi 1 hari (tumpang tindih
    // aman karena deduplikasi), agar scan terlambat masuk tetap terbawa.
    const since = cursor ? `${cursor.slice(0, 10)} 00:00:00` : null;
    const logs = parseRows(xml)
      .map((r) => ({ pin: cleanPin(r.PIN), local: normDateTime(r.DateTime) ?? '', verifyMode: r.Verified ?? null, statusCode: r.Status ?? null }))
      .filter((l) => !!l.pin && !!l.local && (!since || l.local >= since));
    let users: { pin: string; name: string; department: string }[] = [];
    try {
      const ux = await soapRequest(cfg, 'GetUserInfo');
      checkResponse(ux, 'GetUserInfo');
      const pins = new Set(logs.map((l) => l.pin));
      // Sebagian firmware memakai PIN2 (ID tampilan) pada log absensi.
      users = parseRows(ux).map((u) => {
        const pin2 = cleanPin(u.PIN2);
        return { pin: pin2 && pins.has(pin2) ? pin2 : cleanPin(u.PIN), name: u.Name || '', department: '' };
      }).filter((u) => u.pin);
    } catch {
      // daftar pengguna bersifat opsional
    }
    const last = logs.map((l) => l.local).sort().pop() ?? cursor;
    return { scans: logs, users, cursorAfter: last ?? null };
  },
};

export const fileImportAdapter: DeviceAdapter = {
  id: 'FILE_IMPORT',
  label: 'Impor berkas USB (Solution P280 / attlog / CSV)',
  maturity: 'SIAP',
  connection: 'USB',
  pull: false,
  note: 'Data diunggah dari berkas hasil unduhan flashdisk mesin. Format laporan standar Solution P280 sudah diuji dengan berkas ekspor asli instansi.',
};
