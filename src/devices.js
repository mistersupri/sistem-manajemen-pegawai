// Sinkronisasi mesin fingerprint LAN (Solution X302) + penjadwal tarik data otomatis.
const { db } = require('./db');
const T = require('./time');
const solution = require('./solution');
const fingerprint = require('./fingerprint');

const running = new Set();

function setStatus(id, ok, message) {
  db.prepare(`UPDATE devices SET last_sync_at = datetime('now','localtime'), last_sync_ok = ?, last_sync_status = ? WHERE id = ?`)
    .run(ok ? 1 : 0, String(message).slice(0, 500), id);
}

/** Tarik log & pengguna dari mesin LAN lalu impor. Mengembalikan ringkasan impor. */
async function syncDevice(device) {
  if (device.koneksi !== 'lan' || !device.ip) throw new Error('Mesin ini tidak dikonfigurasi untuk koneksi LAN (isi alamat IP).');
  if (running.has(device.id)) throw new Error('Sinkronisasi mesin ini sedang berjalan.');
  running.add(device.id);
  try {
    const rawLogs = await solution.getAttendanceLogs(device);
    let rawUsers = [];
    try { rawUsers = await solution.getUsers(device); } catch { /* daftar pengguna opsional */ }

    const logs = [];
    for (const l of rawLogs) {
      const pin = fingerprint.cleanPin(l.pin);
      const waktu = fingerprint.normDateTime(l.waktu);
      if (pin && waktu) logs.push({ pin, waktu, verify: l.verify, status: l.status });
    }
    // Sebagian firmware memakai PIN2 (ID tampilan) pada log absensi.
    const logPins = new Set(logs.map((l) => l.pin));
    const users = rawUsers.map((u) => {
      const pin2 = fingerprint.cleanPin(u.pin2);
      const pin = pin2 && logPins.has(pin2) ? pin2 : fingerprint.cleanPin(u.pin);
      return { pin, nama: u.nama, departemen: '' };
    }).filter((u) => u.pin);

    const summary = fingerprint.importData({ users, logs }, { deviceId: device.id, sumber: 'lan' });
    setStatus(device.id, true, `${summary.total} log dibaca, ${summary.baru} baru.`);
    return summary;
  } catch (err) {
    setStatus(device.id, false, err.message);
    throw err;
  } finally {
    running.delete(device.id);
  }
}

/** Jalankan tarik data otomatis untuk mesin yang jadwalnya sudah tiba. */
async function runDueSyncs() {
  const devices = db.prepare("SELECT * FROM devices WHERE koneksi = 'lan' AND auto_sync_menit > 0 AND ip IS NOT NULL AND ip <> ''").all();
  const now = Date.now();
  for (const d of devices) {
    const last = d.last_sync_at ? T.parseDateTime(d.last_sync_at).getTime() : 0;
    if (now - last < d.auto_sync_menit * 60000 || running.has(d.id)) continue;
    try {
      await syncDevice(d);
    } catch (err) {
      console.warn(`[mesin] Tarik data otomatis ${d.nama} gagal: ${err.message}`);
    }
  }
}

function startScheduler() {
  const timer = setInterval(() => { runDueSyncs().catch(() => {}); }, 60000);
  timer.unref();
  return timer;
}

module.exports = { syncDevice, runDueSyncs, startScheduler };
