// Utilitas tanggal/waktu berbasis zona waktu IANA (default Asia/Jakarta).
// Tanggal kerja ditulis sebagai string 'YYYY-MM-DD'; instan waktu sebagai Date (UTC).

export const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const pad = (n: number) => String(n).padStart(2, '0');
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Bagian tanggal & jam suatu instan menurut zona waktu tertentu. */
export function zonedParts(d: Date, tz: string) {
  const p: Record<string, string> = {};
  for (const x of partsFormatter(tz).formatToParts(d)) p[x.type] = x.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    seconds: Number(p.second),
    weekday: WD[p.weekday],
  };
}

function offsetMs(d: Date, tz: string) {
  const z = zonedParts(d, tz);
  const [y, m, day] = z.date.split('-').map(Number);
  const [h, mi] = z.time.split(':').map(Number);
  return Date.UTC(y, m - 1, day, h, mi, z.seconds) - Math.floor(d.getTime() / 1000) * 1000;
}

/** Jam dinding (tanggal + HH:MM[:SS]) di zona tz menjadi instan UTC. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const dm = DATE_RE.exec(date);
  const tm = TIME_RE.exec(time);
  if (!dm || !tm) throw new Error(`Tanggal/jam tidak valid: ${date} ${time}`);
  const guess = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2], +(tm[3] || 0));
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz); // koreksi bila melewati perubahan offset
  return new Date(t);
}

export const todayIn = (tz: string, now = new Date()) => zonedParts(now, tz).date;

export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const isValidTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dateRange(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60000);

/** String 'YYYY-MM-DD' ke nilai untuk kolom @db.Date dan sebaliknya. */
export const toDbDate = (date: string) => new Date(`${date}T00:00:00Z`);
export const fromDbDate = (d: Date) => d.toISOString().slice(0, 10);

export function monthBounds(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

export function fmtTanggal(date: string) {
  if (!isValidDate(date)) return date;
  const d = new Date(`${date}T00:00:00Z`);
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtTglPendek(date: string, withYear = true) {
  if (!isValidDate(date)) return date;
  const d = new Date(`${date}T00:00:00Z`);
  return `${HARI_PENDEK[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN_PENDEK[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ''}`;
}

export const fmtJam = (d: Date | null | undefined, tz: string) => (d ? zonedParts(d, tz).time : null);

export function fmtWaktu(d: Date | null | undefined, tz: string) {
  if (!d) return '';
  const z = zonedParts(d, tz);
  return `${fmtTglPendek(z.date)}, ${z.time}`;
}
