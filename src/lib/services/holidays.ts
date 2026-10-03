import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { audit } from '../audit';
import { assertCan, scopeOf, type Actor } from '../auth/actor';
import { systemActor } from '../auth/system';
import { AppError, forbidden, notFound, unprocessable } from '../errors';
import { parseCsv } from '../files/csv';
import { log } from '../logger';
import { getSettings } from '../settings';
import { addDays, fromDbDate, isValidDate, toDbDate, todayIn } from '../time';
import { rebuildActive } from './schedules';

export type HolidayKind = 'NASIONAL' | 'CUTI_BERSAMA' | 'INSTANSI';
export interface HolidayItem { date: string; name: string; kind: HolidayKind }

export const HOLIDAY_KIND_LABEL: Record<string, string> = { NASIONAL: 'Libur nasional', CUTI_BERSAMA: 'Cuti bersama', INSTANSI: 'Libur instansi' };
export const HOLIDAY_SOURCE_LABEL: Record<string, string> = { MANUAL: 'Diisi petugas', BERKAS: 'Impor berkas', DAYOFFAPI: 'dayoffapi', LIBUR_DENO: 'libur.deno.dev', NAGER: 'Nager.Date' };

/**
 * Sumber daring gratis tanpa kunci API, dicoba berurutan. Dua yang pertama memuat cuti bersama
 * sesuai SKB 3 Menteri; Nager.Date hanya libur nasional dan dipakai sebagai cadangan.
 */
export const HOLIDAY_SOURCES = [
  { id: 'DAYOFFAPI', url: (y: number) => `https://dayoffapi.vercel.app/api?year=${y}` },
  { id: 'LIBUR_DENO', url: (y: number) => `https://libur.deno.dev/api?year=${y}` },
  { id: 'NAGER', url: (y: number) => `https://date.nager.at/api/v3/PublicHolidays/${y}/ID` },
] as const;

const CUTI = /cuti\s*bersama/i;

/** "2026-1-1", "2026-01-01T00:00:00" atau "20260101" menjadi "2026-01-01"; selain itu null. */
export function normalizeDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) ?? s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isValidDate(d) ? d : null;
}

/** Baca respons JSON salah satu sumber: larik objek dengan tanggal dan nama. Urutan kunci menoleransi ketiga format. */
export function parseHolidayJson(json: unknown): HolidayItem[] {
  const list = Array.isArray(json) ? json : Array.isArray((json as { data?: unknown })?.data) ? (json as { data: unknown[] }).data : null;
  if (!list) throw new Error('Format respons tidak dikenal');
  const out: HolidayItem[] = [];
  for (const raw of list) {
    const o = raw as Record<string, unknown>;
    const date = normalizeDate(o.tanggal ?? o.date ?? o.holiday_date);
    const name = String(o.keterangan ?? o.localName ?? o.name ?? o.holiday_name ?? o.summary ?? '').trim();
    if (!date || !name) continue;
    const cuti = o.is_cuti === true || o.is_cuti === 'true' || o.is_cuti === 1 || CUTI.test(name);
    out.push({ date, name: name.slice(0, 120), kind: cuti ? 'CUTI_BERSAMA' : 'NASIONAL' });
  }
  return dedupe(out);
}

/** Kalender iCalendar (.ics), mis. ekspor Google Calendar "Hari libur di Indonesia". Acara beberapa hari dipecah per tanggal. */
export function parseIcs(text: string): HolidayItem[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: HolidayItem[] = [];
  let cur: { start?: string; end?: string; name?: string } | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT' && cur) {
      if (cur.start && cur.name) {
        const last = cur.end ? addDays(cur.end, -1) : cur.start; // DTEND tanggal bersifat eksklusif
        for (let d = cur.start; d <= last && out.length < 1000; d = addDays(d, 1)) out.push({ date: d, name: cur.name, kind: CUTI.test(cur.name) ? 'CUTI_BERSAMA' : 'NASIONAL' });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0].toUpperCase();
      const value = line.slice(i + 1);
      if (key === 'DTSTART') cur.start = normalizeDate(value.slice(0, 8)) ?? undefined;
      else if (key === 'DTEND') cur.end = normalizeDate(value.slice(0, 8)) ?? undefined;
      else if (key === 'SUMMARY') cur.name = value.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ').trim().slice(0, 120);
    }
  }
  return dedupe(out);
}

/** CSV dengan kolom tanggal, keterangan, dan opsional jenis ("cuti bersama"/"nasional"). Baris judul dilewati. */
export function parseHolidayCsv(text: string): HolidayItem[] {
  const out: HolidayItem[] = [];
  for (const row of parseCsv(text.replace(/^﻿/, ''))) {
    const date = normalizeDate(row[0]);
    const name = (row[1] ?? '').trim();
    if (!date || !name) continue;
    out.push({ date, name: name.slice(0, 120), kind: CUTI.test(`${row[2] ?? ''} ${name}`) ? 'CUTI_BERSAMA' : 'NASIONAL' });
  }
  return dedupe(out);
}

/** Satu entri per tanggal; nama digabung bila dua libur jatuh pada hari yang sama. Cuti bersama kalah dari libur nasional. */
function dedupe(items: HolidayItem[]): HolidayItem[] {
  const m = new Map<string, HolidayItem>();
  for (const it of items) {
    const p = m.get(it.date);
    if (!p) m.set(it.date, { ...it });
    else if (!p.name.includes(it.name)) m.set(it.date, { date: it.date, name: `${p.name}; ${it.name}`.slice(0, 120), kind: p.kind === 'NASIONAL' || it.kind === 'NASIONAL' ? 'NASIONAL' : 'CUTI_BERSAMA' });
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Tarik daftar libur satu tahun dari sumber daring pertama yang berhasil dan masuk akal. */
export async function fetchNationalHolidays(year: number, fetcher: typeof fetch = fetch): Promise<{ source: string; items: HolidayItem[]; errors: string[] }> {
  const errors: string[] = [];
  for (const s of HOLIDAY_SOURCES) {
    try {
      const res = await fetcher(s.url(year), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseHolidayJson(await res.json()).filter((h) => h.date.startsWith(`${year}-`));
      // Satu tahun di Indonesia selalu punya belasan libur; daftar yang terlalu pendek dianggap rusak.
      if (items.length < 8) throw new Error(`hanya ${items.length} tanggal`);
      return { source: s.id, items, errors };
    } catch (err) {
      errors.push(`${s.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Semua sumber gagal (${errors.join('; ')})`);
}

export interface SyncResult { year: number; source: string; created: number; updated: number; removed: number; keptManual: number; skippedCuti: number }

/**
 * Terapkan daftar libur untuk seluruh unit pada satu tahun.
 * - Libur yang diisi petugas (MANUAL) tidak pernah ditimpa.
 * - Libur dari sumber otomatis yang dinonaktifkan petugas tetap nonaktif; nama dan jenisnya saja yang diperbarui.
 * - Bila `replace` (tarik daring), libur otomatis yang tidak lagi ada di daftar dihapus, mis. cuti bersama yang dibatalkan.
 * Rekap tanggal yang berubah dan sudah lewat dihitung ulang.
 */
export async function applyHolidays(actor: Actor, year: number, source: string, items: HolidayItem[], opts: { replace: boolean }): Promise<SyncResult> {
  assertCan(actor, 'schedule.manage');
  if (!scopeOf(actor, 'schedule.manage')!.all) throw forbidden('Libur nasional berlaku untuk semua unit; hanya pengguna dengan cakupan seluruh unit yang bisa memperbaruinya.');
  const s = await getSettings();
  const wanted = items.filter((h) => h.date.startsWith(`${year}-`));
  const skippedCuti = s['holidays.includeCutiBersama'] ? 0 : wanted.filter((h) => h.kind === 'CUTI_BERSAMA').length;
  const list = s['holidays.includeCutiBersama'] ? wanted : wanted.filter((h) => h.kind !== 'CUTI_BERSAMA');
  const existing = await prisma.holiday.findMany({ where: { unitId: null, date: { gte: toDbDate(`${year}-01-01`), lte: toDbDate(`${year}-12-31`) } } });
  const byDate = new Map(existing.map((h) => [fromDbDate(h.date), h]));
  const touched = new Set<string>();
  const r: SyncResult = { year, source, created: 0, updated: 0, removed: 0, keptManual: 0, skippedCuti };
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const h of list) {
    const cur = byDate.get(h.date);
    if (!cur) {
      ops.push(prisma.holiday.create({ data: { date: toDbDate(h.date), name: h.name, kind: h.kind, source } }));
      r.created++; touched.add(h.date);
    } else if (cur.source === 'MANUAL') {
      r.keptManual++;
    } else if (cur.name !== h.name || cur.kind !== h.kind || cur.source !== source) {
      ops.push(prisma.holiday.update({ where: { id: cur.id }, data: { name: h.name, kind: h.kind, source } }));
      r.updated++;
    }
  }
  if (opts.replace) {
    const keep = new Set(list.map((h) => h.date));
    const stale = existing.filter((h) => h.source !== 'MANUAL' && h.source !== 'BERKAS' && !keep.has(fromDbDate(h.date)));
    if (stale.length) ops.push(prisma.holiday.deleteMany({ where: { id: { in: stale.map((h) => h.id) } } }));
    r.removed = stale.length;
    stale.forEach((h) => { if (!h.disabled) touched.add(fromDbDate(h.date)); });
  }
  if (ops.length) await prisma.$transaction(ops);
  if (r.created || r.updated || r.removed) await audit(actor, { action: 'holiday.sync', entityType: 'Holiday', meta: { ...r } });
  const today = todayIn(s['org.timezone']);
  for (const d of [...touched].sort()) if (d <= today) await rebuildActive(null, d, d);
  return r;
}

async function recordStatus(status: NonNullable<Awaited<ReturnType<typeof getSettings>>['holidays.lastSync']>) {
  await prisma.systemSetting.upsert({ where: { key: 'holidays.lastSync' }, update: { value: status }, create: { key: 'holidays.lastSync', value: status } });
}

/** Tarik daring untuk tahun tertentu (tombol "Perbarui dari internet"). */
export async function syncNationalHolidays(actor: Actor, year: number, fetcher: typeof fetch = fetch) {
  assertCan(actor, 'schedule.manage');
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw unprocessable('Tahun tidak valid.');
  try {
    const { source, items } = await fetchNationalHolidays(year, fetcher);
    const r = await applyHolidays(actor, year, source, items, { replace: true });
    await recordStatus({ at: new Date().toISOString(), ok: true, source, message: `${year}: ${items.length} tanggal dari ${HOLIDAY_SOURCE_LABEL[source] ?? source}` });
    return r;
  } catch (err) {
    if (err instanceof AppError || !(err instanceof Error)) throw err;
    const message = `${year}: ${err.message}`;
    await recordStatus({ at: new Date().toISOString(), ok: false, source: null, message });
    throw unprocessable(`Daftar libur ${year} tidak bisa ditarik. Pastikan server bisa mengakses internet, atau impor berkas .ics/.csv. Rincian: ${err.message}`);
  }
}

/** Impor berkas .ics atau .csv untuk satu tahun. Tidak menghapus libur yang sudah ada. */
export async function importHolidayFile(actor: Actor, raw: { year: unknown; filename: string; text: string }) {
  const year = z.coerce.number().int().min(2000).max(2100).parse(raw.year);
  const items = /\.ics$/i.test(raw.filename) || raw.text.includes('BEGIN:VCALENDAR') ? parseIcs(raw.text) : parseHolidayCsv(raw.text);
  const inYear = items.filter((h) => h.date.startsWith(`${year}-`));
  if (!inYear.length) throw unprocessable(`Tidak ada tanggal ${year} yang terbaca di berkas. Format CSV: tanggal (YYYY-MM-DD), keterangan, jenis.`);
  return applyHolidays(actor, year, 'BERKAS', inYear, { replace: false });
}

/** Nonaktifkan libur tanpa menghapusnya, supaya tidak muncul lagi saat tarik otomatis berikutnya. */
export async function setHolidayDisabled(actor: Actor, id: string, disabled: boolean) {
  assertCan(actor, 'schedule.manage');
  const h = await prisma.holiday.findUnique({ where: { id } });
  if (!h) throw notFound('Hari libur tidak ditemukan.');
  if (!h.unitId && !scopeOf(actor, 'schedule.manage')!.all) throw forbidden();
  if (h.disabled === disabled) return h;
  const out = await prisma.holiday.update({ where: { id }, data: { disabled } });
  await audit(actor, { action: disabled ? 'holiday.disable' : 'holiday.enable', entityType: 'Holiday', entityId: id, meta: { date: fromDbDate(h.date), name: h.name } });
  const d = fromDbDate(h.date);
  if (d <= todayIn((await getSettings())['org.timezone'])) await rebuildActive(null, d, d);
  return out;
}

/** Dipanggil penjadwal tiap jam; menarik tahun ini dan tahun depan paling sering sekali per 20 jam. */
export async function autoSyncHolidays(fetcher: typeof fetch = fetch) {
  const s = await getSettings();
  if (!s['holidays.autoSync']) return;
  const last = s['holidays.lastSync'];
  const due = !last || Date.now() - Date.parse(last.at) > (last.ok ? 20 : 3) * 3600_000;
  if (!due) return;
  const year = Number(todayIn(s['org.timezone']).slice(0, 4));
  const actor = systemActor('sinkron-libur');
  let current: SyncResult | null = null;
  try {
    current = await syncNationalHolidays(actor, year, fetcher);
    log.info('Hari libur diperbarui', { ...current });
  } catch (err) {
    log.warn('Hari libur tidak bisa diperbarui', { err: err instanceof Error ? err.message : String(err) });
    return;
  }
  try {
    log.info('Hari libur diperbarui', { ...(await syncNationalHolidays(actor, year + 1, fetcher)) });
  } catch {
    // Daftar tahun depan biasanya baru terbit menjelang akhir tahun; yang penting tahun berjalan berhasil.
    await recordStatus({ at: new Date().toISOString(), ok: true, source: current.source, message: `${year} diperbarui; daftar ${year + 1} belum tersedia` });
  }
}
