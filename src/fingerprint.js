// Integrasi mesin absensi fingerprint (Solution X302 via LAN, P280 via USB, dan
// format attlog umum). Log scan mentah disimpan di fingerprint_logs lalu diproses
// menjadi data absensi harian per pegawai.
const { db } = require('./db');
const T = require('./time');
const A = require('./attendance');
const { readXls } = require('./xls');
const { parseCsv } = require('./excel');

// Scan berdekatan (< menit ini) dianggap satu kelompok (mis. scan ganda).
const CLUSTER_MINUTES = 60;

const TIPE_MESIN = {
  x302: 'Solution X302 (LAN)',
  p280: 'Solution P280 (USB)',
  lainnya: 'Mesin lain',
};

const pad = (n) => String(n).padStart(2, '0');

function cleanPin(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? String(Math.round(v)) : String(v).trim();
  s = s.replace(/\.0+$/, '');
  return /^[A-Za-z0-9_-]{1,30}$/.test(s) ? s : '';
}

/** Normalisasi berbagai format tanggal/jam -> 'YYYY-MM-DD HH:MM:SS' (atau null). */
function normDateTime(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // ExcelJS memberi Date dalam UTC yang merepresentasikan waktu lokal sel
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())} ${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}:${pad(v.getUTCSeconds())}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return normDateTime(new Date(Math.round((v - 25569) * 86400) * 1000)); // serial Excel
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])} ${pad(m[4])}:${m[5]}:${pad(m[6] || 0)}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s); // DD/MM/YYYY
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])} ${pad(m[4])}:${m[5]}:${pad(m[6] || 0)}`;
  return null;
}

function validStamp(s) {
  return !!s && T.isValidDate(s.slice(0, 10)) && T.isValidTime(s.slice(11, 16));
}

// ---------------------------------------------------------------------------
// Parser file ekspor
// ---------------------------------------------------------------------------

/**
 * Laporan standar Solution (mis. P280 "StandardReport.xls"), sheet "Lap. Log Absen":
 * baris "ID: <pin> ... Nama: <nama> ... Dept.: <dept>" diikuti baris berisi jam scan
 * per tanggal yang digabung tanpa pemisah, mis. "06:1017:00".
 */
function parseSolutionReport(sheets) {
  for (const sheet of sheets) {
    const rows = sheet.rows;
    // Baris pegawai diawali label "ID:" (dengan titik dua, berbeda dengan judul kolom "ID")
    const idRows = rows.map((r, i) => (r && /^ID\s*[:：]$/i.test(String(r[0]).trim()) ? i : -1)).filter((i) => i >= 0);
    if (!idRows.length) continue;

    // Periode "YYYY-MM-DD ~ YYYY-MM-DD"
    let period = null;
    let periodRow = -1;
    for (let i = 0; i < idRows[0] && !period; i++) {
      for (const c of rows[i] || []) {
        const m = /(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/.exec(String(c));
        if (m) { period = { dari: m[1], sampai: m[2] }; periodRow = i; break; }
      }
    }
    if (!period) throw new Error(`Periode laporan tidak ditemukan pada sheet "${sheet.name}".`);
    const dates = T.dateRange(period.dari, period.sampai);

    // Baris judul hari (1, 2, 3, ...) -> kolom ke tanggal
    const colDate = {};
    for (let i = periodRow + 1; i < idRows[0]; i++) {
      const r = rows[i] || [];
      const nums = r.map((v, c) => ({ c, d: Number(v) })).filter((x) => String(r[x.c]).trim() !== '' && Number.isInteger(x.d) && x.d >= 1 && x.d <= 31);
      if (nums.length >= Math.min(dates.length, 5)) {
        let k = 0;
        for (const { c, d } of nums) {
          while (k < dates.length && +dates[k].slice(8) !== d) k++;
          if (k < dates.length) colDate[c] = dates[k++];
        }
        break;
      }
    }
    if (!Object.keys(colDate).length) throw new Error('Baris tanggal pada laporan tidak dikenali.');

    const users = [];
    const logs = [];
    const seen = new Set(); // laporan sering memuat scan ganda pada menit yang sama
    const labelValue = (r, labelRe) => {
      const idx = r.findIndex((v) => labelRe.test(String(v).trim()));
      if (idx < 0) return '';
      for (let c = idx + 1; c < r.length; c++) if (String(r[c]).trim() !== '') return String(r[c]).trim();
      return '';
    };
    for (const i of idRows) {
      const r = rows[i];
      const pin = cleanPin(labelValue(r, /^ID[:：]?$/i));
      if (!pin) continue;
      users.push({ pin, nama: labelValue(r, /^(Nama|Name)[:：]?$/i), departemen: labelValue(r, /^(Dept\.?|Departemen|Department)[:：]?$/i) });
      const times = rows[i + 1] || [];
      for (const [c, tanggal] of Object.entries(colDate)) {
        const cell = String(times[c] ?? '');
        for (const t of cell.match(/\d{1,2}:\d{2}/g) || []) {
          const stamp = `${tanggal} ${t.padStart(5, '0')}:00`;
          const key = `${pin}|${stamp}`;
          if (validStamp(stamp) && !seen.has(key)) { seen.add(key); logs.push({ pin, waktu: stamp }); }
        }
      }
    }
    return { format: 'Laporan standar Solution (.xls)', period, users, logs };
  }
  return null;
}

const PIN_HEADER = /^(pin|id|enno|en_no|ac_no|no_id|user_id|userid|id_mesin|id_pegawai|no_pegawai|badgenumber|no_absen|nik|nip)$/;
const DATETIME_HEADER = /^(waktu|datetime|date_time|time|checktime|check_time|waktu_absen|tanggal_jam|tgl_jam)$/;
const DATE_HEADER = /^(tanggal|tgl|date)$/;
const TIME_HEADER = /^(jam|time|pukul)$/;
const NAME_HEADER = /^(nama|name)$/;
const DEPT_HEADER = /^(departemen|dept|department|bagian|unit)$/;

const normHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Tabel umum: baris array dengan header (PIN/ID + Waktu atau Tanggal + Jam), atau attlog tanpa header. */
function parseTable(rows, format) {
  rows = rows.filter((r) => r && r.some((v) => String(v ?? '').trim() !== ''));
  if (!rows.length) return null;
  const users = new Map();
  const logs = [];

  // Cari baris header di 10 baris pertama
  for (let h = 0; h < Math.min(rows.length, 10); h++) {
    const hdr = rows[h].map(normHeader);
    const iPin = hdr.findIndex((x) => PIN_HEADER.test(x));
    let iDt = hdr.findIndex((x) => DATETIME_HEADER.test(x));
    const iDate = hdr.findIndex((x) => DATE_HEADER.test(x));
    const iTime = hdr.findIndex((x, i) => TIME_HEADER.test(x) && i !== iDt);
    if (iPin < 0 || (iDt < 0 && iDate < 0)) continue;
    if (iDt >= 0 && iDate >= 0 && iTime < 0 && hdr[iDt] === 'time') iDt = -1;
    const iNama = hdr.findIndex((x) => NAME_HEADER.test(x));
    const iDept = hdr.findIndex((x) => DEPT_HEADER.test(x));
    for (const r of rows.slice(h + 1)) {
      const pin = cleanPin(r[iPin]);
      let stamp = null;
      if (iDt >= 0) stamp = normDateTime(r[iDt]);
      if (!stamp && iDate >= 0) {
        const d = normDateTime(`${String(cellDate(r[iDate]))} ${String(cellTime(iTime >= 0 ? r[iTime] : '00:00'))}`);
        stamp = d;
      }
      if (!pin || !validStamp(stamp)) continue;
      logs.push({ pin, waktu: stamp, verify: null, status: null });
      if (!users.has(pin) && (iNama >= 0 || iDept >= 0)) {
        users.set(pin, { pin, nama: iNama >= 0 ? String(r[iNama] ?? '').trim() : '', departemen: iDept >= 0 ? String(r[iDept] ?? '').trim() : '' });
      }
    }
    return logs.length ? { format, users: [...users.values()], logs } : null;
  }

  // Tanpa header: format attlog ZK/Solution "PIN<TAB>YYYY-MM-DD HH:MM:SS<TAB>verify<TAB>status..."
  for (const r of rows) {
    const pin = cleanPin(r[0]);
    const idx = r.findIndex((v, i) => i > 0 && normDateTime(v));
    if (!pin || idx < 0) continue;
    const stamp = normDateTime(r[idx]);
    if (!validStamp(stamp)) continue;
    logs.push({ pin, waktu: stamp, verify: r[idx + 1] ?? null, status: r[idx + 2] ?? null });
  }
  return logs.length ? { format, users: [], logs } : null;
}

function cellDate(v) {
  if (v instanceof Date) return normDateTime(v).slice(0, 10);
  if (typeof v === 'number' && v > 20000) return normDateTime(v).slice(0, 10);
  const s = String(v ?? '').trim();
  const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : s;
}

function cellTime(v) {
  if (v instanceof Date) return normDateTime(v).slice(11);
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const sec = Math.round(v * 86400);
    return `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;
  }
  return String(v ?? '').trim();
}

function splitTextRows(text) {
  return text.replace(/^﻿/, '').split(/\r?\n/).map((line) => {
    if (line.includes('\t')) return line.split('\t').map((x) => x.trim());
    if (/[,;]/.test(line)) return null; // ditangani parser CSV
    return line.trim().split(/\s{2,}|\s(?=\d{4}-\d{2}-\d{2})/).map((x) => x.trim());
  });
}

/** Deteksi format file ekspor mesin & kembalikan { format, users, logs, period? }. */
async function parseExportFile(buffer, filename) {
  const name = String(filename || '').toLowerCase();
  if (name.endsWith('.xls') || (buffer[0] === 0xd0 && buffer[1] === 0xcf)) {
    const sheets = readXls(buffer);
    const report = parseSolutionReport(sheets);
    if (report) return report;
    for (const sh of sheets) {
      const t = parseTable(sh.rows, 'Excel 97-2003 (.xls)');
      if (t) return t;
    }
    throw new Error('Isi file .xls tidak dikenali sebagai laporan absensi mesin.');
  }
  if (name.endsWith('.xlsx')) {
    const { ExcelJS } = require('./excel');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheets = wb.worksheets.map((ws) => {
      const rows = [];
      ws.eachRow({ includeEmpty: true }, (r, n) => {
        const vals = [];
        for (let c = 1; c <= ws.columnCount; c++) {
          const v = r.getCell(c).value;
          vals.push(v && typeof v === 'object' && !(v instanceof Date) ? (v.text ?? v.result ?? '') : v ?? '');
        }
        rows[n - 1] = vals;
      });
      return { name: ws.name, rows: Array.from(rows, (r) => r || []) };
    });
    const report = parseSolutionReport(sheets);
    if (report) return report;
    for (const sh of sheets) {
      const t = parseTable(sh.rows, 'Excel (.xlsx)');
      if (t) return t;
    }
    throw new Error('Isi file .xlsx tidak dikenali sebagai data absensi mesin.');
  }
  // Teks: .dat / .txt / .csv
  const text = buffer.toString('utf8');
  const tabOrSpace = splitTextRows(text);
  let parsed = null;
  if (tabOrSpace.every((r) => r !== null)) parsed = parseTable(tabOrSpace, 'Attlog teks (.dat/.txt)');
  if (!parsed) parsed = parseTable(parseCsv(text), 'CSV');
  if (!parsed) throw new Error('Format file tidak dikenali. Gunakan ekspor .xls laporan standar, attlog .dat/.txt, atau CSV berkolom ID & Waktu.');
  return parsed;
}

// ---------------------------------------------------------------------------
// Penyimpanan & pemrosesan log
// ---------------------------------------------------------------------------

function employeeByPin(pin) {
  return db.prepare("SELECT * FROM employees WHERE id_mesin = ? AND status = 'aktif'").get(pin);
}

/** Tentukan tanggal kerja sebuah scan (scan dini hari bisa milik shift malam kemarin). */
function workDateOf(employee, stamp) {
  const t = T.parseDateTime(stamp);
  const d = stamp.slice(0, 10);
  const y = T.addDays(d, -1);
  const { shift } = A.getShiftForDate(employee, y);
  if (shift && A.isOvernight(shift)) {
    const win = A.shiftWindow(shift, y);
    if (t <= new Date(win.end.getTime() + 6 * 3600000)) return y;
  }
  return d;
}

/** Gabungkan scan fingerprint satu hari ke tabel attendance. */
function mergeDay(employee, tanggal, stamps) {
  stamps.sort();
  const first = stamps[0];
  const last = stamps[stamps.length - 1];
  const existing = A.getRecord(employee.id, tanggal);
  const shift = existing && existing.shift_id ? A.getShift(existing.shift_id) : A.getShiftForDate(employee, tanggal).shift;

  let fpMasuk = first;
  let fpPulang = last;
  if (T.minutesBetween(T.parseDateTime(first), T.parseDateTime(last)) < CLUSTER_MINUTES) {
    // Hanya satu kelompok scan: tentukan masuk/pulang dari posisinya terhadap tengah jam kerja
    const win = A.shiftWindow(shift, tanggal);
    const mid = win ? new Date((win.start.getTime() + win.end.getTime()) / 2) : T.parseDateTime(`${tanggal} 12:00`);
    if (T.parseDateTime(first) < mid) fpPulang = null;
    else fpMasuk = null;
  }

  const jamMasuk = [existing?.jam_masuk, fpMasuk].filter(Boolean).sort()[0] || null;
  const jamPulang = [existing?.jam_pulang, fpPulang].filter(Boolean).sort().pop() || null;
  const metodeMasuk = fpMasuk && jamMasuk === fpMasuk && existing?.jam_masuk !== fpMasuk ? 'fingerprint' : existing?.metode_masuk || null;
  const metodePulang = fpPulang && jamPulang === fpPulang && existing?.jam_pulang !== fpPulang ? 'fingerprint' : existing?.metode_pulang || null;

  if (existing && existing.jam_masuk === jamMasuk && existing.jam_pulang === jamPulang) return false;
  const calc = A.computeStatus({
    tanggal, jam_masuk: jamMasuk, jam_pulang: jamPulang, status: existing?.status || 'hadir', dispensasi: existing?.dispensasi || 0,
  }, shift);
  if (existing) {
    db.prepare(`UPDATE attendance SET jam_masuk=?, jam_pulang=?, status=?, terlambat_menit=?, pulang_cepat_menit=?,
      metode_masuk=?, metode_pulang=?, shift_id=COALESCE(shift_id, ?), updated_at=datetime('now','localtime') WHERE id=?`)
      .run(jamMasuk, jamPulang, calc.status, calc.terlambat_menit, calc.pulang_cepat_menit, metodeMasuk, metodePulang,
        shift ? shift.id : null, existing.id);
  } else {
    db.prepare(`INSERT INTO attendance (employee_id, tanggal, shift_id, jam_masuk, jam_pulang, status, terlambat_menit,
      pulang_cepat_menit, metode_masuk, metode_pulang) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(employee.id, tanggal, shift ? shift.id : null, jamMasuk, jamPulang, calc.status, calc.terlambat_menit,
        calc.pulang_cepat_menit, jamMasuk ? 'fingerprint' : null, jamPulang ? 'fingerprint' : null);
  }
  return true;
}

/** Proses ulang semua log milik satu PIN (opsional dibatasi rentang tanggal). */
function processPin(pin, dari, sampai) {
  const emp = employeeByPin(pin);
  if (!emp) return { matched: false, days: 0 };
  const from = dari ? `${T.addDays(dari, -1)} 00:00:00` : '0000';
  const to = sampai ? `${T.addDays(sampai, 1)} 23:59:59` : '9999';
  const logs = db.prepare('SELECT waktu FROM fingerprint_logs WHERE pin = ? AND waktu BETWEEN ? AND ? ORDER BY waktu').all(pin, from, to);
  const byDay = new Map();
  for (const l of logs) {
    const d = workDateOf(emp, l.waktu);
    if (byDay.has(d)) byDay.get(d).push(l.waktu); else byDay.set(d, [l.waktu]);
  }
  let days = 0;
  for (const [d, stamps] of byDay) {
    if (dari && (d < dari || d > sampai)) continue;
    if (mergeDay(emp, d, stamps)) days++;
  }
  return { matched: true, days };
}

/**
 * Simpan hasil parse/tarikan mesin. Mengembalikan ringkasan impor.
 * data: { users, logs } ; opts: { deviceId, sumber }
 */
function importData(data, { deviceId = null, sumber = 'usb' } = {}) {
  const insLog = db.prepare(`INSERT OR IGNORE INTO fingerprint_logs (device_id, pin, waktu, verify, status_code, sumber)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const upUser = db.prepare(`INSERT INTO fingerprint_users (pin, nama, departemen, device_id) VALUES (?, ?, ?, ?)
    ON CONFLICT(pin) DO UPDATE SET nama = COALESCE(NULLIF(excluded.nama, ''), nama),
      departemen = COALESCE(NULLIF(excluded.departemen, ''), departemen),
      device_id = COALESCE(excluded.device_id, device_id), updated_at = datetime('now','localtime')`);

  const summary = { total: data.logs.length, baru: 0, duplikat: 0, pegawai: 0, hari: 0, tidakDikenal: [], dari: null, sampai: null };
  const range = new Map(); // pin -> [min, max] tanggal log baru
  db.transaction(() => {
    for (const u of data.users || []) upUser.run(u.pin, u.nama || '', u.departemen || '', deviceId);
    for (const l of data.logs) {
      const r = insLog.run(deviceId, l.pin, l.waktu, l.verify == null ? null : String(l.verify), l.status == null ? null : String(l.status), sumber);
      if (!r.changes) { summary.duplikat++; continue; }
      summary.baru++;
      const d = l.waktu.slice(0, 10);
      const cur = range.get(l.pin);
      range.set(l.pin, cur ? [d < cur[0] ? d : cur[0], d > cur[1] ? d : cur[1]] : [d, d]);
      if (!summary.dari || d < summary.dari) summary.dari = d;
      if (!summary.sampai || d > summary.sampai) summary.sampai = d;
    }
    // Pastikan setiap PIN tercatat di daftar pengguna mesin (untuk pemetaan)
    for (const pin of range.keys()) upUser.run(pin, '', '', deviceId);
    for (const [pin, [dari, sampai]] of range) {
      const r = processPin(pin, dari, sampai);
      if (r.matched) { summary.pegawai++; summary.hari += r.days; } else summary.tidakDikenal.push(pin);
    }
  })();
  return summary;
}

/** PIN mesin yang belum dipetakan ke pegawai. */
function unmatchedUsers() {
  return db.prepare(`SELECT fu.pin, fu.nama, fu.departemen, d.nama AS mesin,
      (SELECT COUNT(*) FROM fingerprint_logs l WHERE l.pin = fu.pin) AS jumlah_log,
      (SELECT MAX(waktu) FROM fingerprint_logs l WHERE l.pin = fu.pin) AS terakhir
    FROM fingerprint_users fu LEFT JOIN devices d ON d.id = fu.device_id
    WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.id_mesin = fu.pin)
    ORDER BY fu.nama, fu.pin`).all();
}

module.exports = {
  TIPE_MESIN, CLUSTER_MINUTES, parseExportFile, parseSolutionReport, parseTable, normDateTime,
  importData, processPin, workDateOf, mergeDay, unmatchedUsers, cleanPin,
};
