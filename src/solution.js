// Klien Web Service (SOAP, port 80) untuk mesin fingerprint Solution seri X (mis. X302)
// dan mesin lain yang kompatibel dengan protokol "iWsService" (ZKTeco).
// Memakai socket TCP mentah karena firmware mesin sering mengirim respons HTTP yang tidak standar.
const net = require('net');

const DEFAULT_TIMEOUT = 30000;

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

/** Kirim permintaan SOAP dan kembalikan teks respons. */
function soapRequest({ ip, port = 80, method, commKey = '0', timeout = DEFAULT_TIMEOUT }) {
  const inner = `<${method}><ArgComKey xsi:type="xsd:integer">${escapeXml(commKey || '0')}</ArgComKey>`
    + `<Arg><PIN xsi:type="xsd:integer">All</PIN></Arg></${method}>`;
  // Format body mengikuti contoh resmi SDK web service mesin (tanpa SOAP envelope).
  const body = inner;
  const endTag = `</${method}Response>`;
  return new Promise((resolve, reject) => {
    const chunks = [];
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      socket.destroy();
      if (err) return reject(err);
      const text = Buffer.concat(chunks).toString('utf8');
      const idx = text.indexOf('\r\n\r\n');
      resolve(idx >= 0 && /^HTTP\//.test(text) ? text.slice(idx + 4) : text);
    };
    const socket = net.connect({ host: ip, port: Number(port) || 80 }, () => {
      socket.write(`POST /iWsService HTTP/1.0\r\nHost: ${ip}\r\nContent-Type: text/xml\r\n`
        + `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}\r\n`);
    });
    socket.setTimeout(timeout, () => finish(Object.assign(new Error(`Mesin ${ip} tidak merespons (timeout).`), { code: 'ETIMEDOUT' })));
    socket.on('data', (d) => {
      chunks.push(d);
      if (d.toString('utf8').includes(endTag) || Buffer.concat(chunks).toString('utf8').includes(endTag)) finish();
    });
    socket.on('end', () => finish());
    socket.on('close', () => finish());
    socket.on('error', (err) => {
      const msg = {
        ECONNREFUSED: `Koneksi ke ${ip}:${port} ditolak. Pastikan Web Server mesin aktif dan port benar.`,
        EHOSTUNREACH: `Mesin ${ip} tidak terjangkau. Periksa kabel LAN / IP mesin.`,
        ENETUNREACH: `Jaringan ke ${ip} tidak terjangkau.`,
        ETIMEDOUT: `Mesin ${ip} tidak merespons (timeout).`,
      }[err.code];
      finish(msg ? Object.assign(new Error(msg), { code: err.code }) : err);
    });
  });
}

const decode = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function parseRows(xml) {
  const rows = [];
  const re = /<Row>([\s\S]*?)<\/Row>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const row = {};
    const f = /<(\w+)>([^<]*)<\/\1>/g;
    let x;
    while ((x = f.exec(m[1]))) row[x[1]] = decode(x[2]).trim();
    rows.push(row);
  }
  return rows;
}

function checkResponse(xml, method) {
  if (/Invalid\s*Com\s*Key/i.test(xml)) throw new Error('Mesin menolak permintaan: Comm Key (kata sandi komunikasi) salah.');
  if (!new RegExp(`<${method}Response`, 'i').test(xml)) {
    if (/Invalid|ComKey|Error/i.test(xml)) throw new Error('Mesin menolak permintaan. Periksa Comm Key / kata sandi komunikasi.');
    throw new Error('Respons mesin tidak dikenali. Pastikan mesin mendukung Web Service (SOAP).');
  }
}

/** Ambil semua log absensi: [{ pin, waktu, verify, status }] */
async function getAttendanceLogs(device) {
  const xml = await soapRequest({ ip: device.ip, port: device.port, method: 'GetAttLog', commKey: device.comm_key });
  checkResponse(xml, 'GetAttLog');
  return parseRows(xml).map((r) => ({ pin: r.PIN, waktu: r.DateTime, verify: r.Verified ?? null, status: r.Status ?? null }));
}

/** Ambil daftar pengguna mesin: [{ pin, pin2, nama }] */
async function getUsers(device) {
  const xml = await soapRequest({ ip: device.ip, port: device.port, method: 'GetUserInfo', commKey: device.comm_key });
  checkResponse(xml, 'GetUserInfo');
  return parseRows(xml).map((r) => ({ pin: r.PIN, pin2: r.PIN2 || '', nama: r.Name || '' }));
}

module.exports = { soapRequest, parseRows, getAttendanceLogs, getUsers };
