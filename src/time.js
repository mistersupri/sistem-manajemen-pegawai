// Helper tanggal/waktu berbasis zona waktu lokal server (TZ, default Asia/Jakarta).

const pad = (n) => String(n).padStart(2, '0');

function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDateTime(d) {
  return `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// "YYYY-MM-DD" atau "YYYY-MM-DD HH:MM[:SS]" -> Date lokal
function parseDateTime(str) {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(str).trim());
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

function isValidDate(str) {
  const d = parseDateTime(str);
  return !!d && /^\d{4}-\d{2}-\d{2}$/.test(str) && fmtDate(d) === str;
}

function isValidTime(str) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(str || ''));
}

function addDays(dateStr, n) {
  const d = parseDateTime(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function minutesBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function fmtTanggalIndo(dateStr) {
  const d = parseDateTime(dateStr);
  if (!d) return dateStr || '';
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** "2026-05-08" -> "Jum, 8 Mei 2026" (format tabel) */
function fmtTglPendek(dateStr, withYear = true) {
  const d = parseDateTime(dateStr);
  if (!d) return dateStr || '';
  return `${HARI_PENDEK[d.getDay()]}, ${d.getDate()} ${BULAN_PENDEK[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;
}

module.exports = {
  fmtTglPendek, HARI_PENDEK, BULAN_PENDEK,
  pad, fmtDate, fmtTime, fmtDateTime, parseDateTime, isValidDate, isValidTime,
  addDays, dateRange, minutesBetween, fmtTanggalIndo, HARI, BULAN,
};
