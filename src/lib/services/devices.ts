import { z } from 'zod';
import { clampPage, listSchema } from '../list';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '../db';
import { audit, diff } from '../audit';
import { assertCan, can, getEmployeeInScope, scopeOf, unitInScope, type Actor } from '../auth/actor';
import { realUserId } from '../auth/system';
import { conflict, forbidden, notFound, unprocessable } from '../errors';
import { decryptOptional, encryptOptional, sha256 } from '../crypto';
import { log } from '../logger';
import { getSettings } from '../settings';
import { addDays, isValidDate, toDbDate, zonedParts, zonedToUtc } from '../time';
import { adapterFor, ADAPTERS } from '../devices/registry';
import { DeviceError, type DeviceConfig } from '../devices/adapter';
import { parseExportFile, type ParsedScan, type ParsedUser } from '../devices/parsers';
import { workDateFor } from '../attendance/engine';
import { loadPlanContext } from '../attendance/plan';
import { rebuildRange } from '../attendance/record';
import { notifyPermission } from './notifications';

export const deviceInput = z.object({
  name: z.string().trim().min(2, 'Nama wajib diisi').max(100),
  vendor: z.string().trim().max(60).optional().nullable(),
  model: z.string().trim().max(60).optional().nullable(),
  serialNumber: z.string().trim().max(60).optional().nullable().transform((v) => v || null),
  adapter: z.enum(Object.keys(ADAPTERS) as [string, ...string[]]),
  host: z.string().trim().max(200).optional().nullable().transform((v) => v || null),
  port: z.coerce.number().int().min(1).max(65535).optional().nullable(),
  secret: z.string().max(100).optional().nullable(), // kosong = tidak diubah
  location: z.string().trim().max(150).optional().nullable(),
  unitId: z.string().uuid().optional().nullable().transform((v) => v || null),
  // Pilihan yang dinonaktifkan (adapter tanpa tarik) tidak ikut terkirim; dianggap manual.
  syncIntervalMinutes: z.preprocess((v) => (v === undefined || v === null || v === '' ? 0 : v), z.coerce.number().int().min(0).max(1440)),
  timeoutMs: z.coerce.number().int().min(1000).max(120000),
  maxRetries: z.coerce.number().int().min(0).max(5),
});

/** Data perangkat yang aman dikirim ke browser (tanpa secret). */
export function publicDevice<T extends { secretEnc?: string | null }>(d: T) {
  const { secretEnc, ...rest } = d;
  return { ...rest, hasSecret: !!secretEnc };
}

function deviceScopeWhere(actor: Actor): Prisma.AttendanceDeviceWhereInput {
  const s = scopeOf(actor, 'device.read');
  if (!s) throw forbidden();
  return s.all ? {} : { OR: [{ unitId: { in: s.unitIds } }, { unitId: null }] };
}

export async function listDevices(actor: Actor) {
  const rows = await prisma.attendanceDevice.findMany({
    where: { deletedAt: null, ...deviceScopeWhere(actor) },
    include: { unit: { select: { name: true } }, syncRuns: { orderBy: { startedAt: 'desc' }, take: 1 } },
    orderBy: { name: 'asc' },
  });
  return rows.map(publicDevice);
}

async function getDevice(actor: Actor, id: string, perm: 'device.read' | 'device.manage' | 'device.sync' = 'device.read') {
  assertCan(actor, perm);
  const d = await prisma.attendanceDevice.findFirst({ where: { id, deletedAt: null, ...deviceScopeWhere(actor) } });
  if (!d) throw notFound('Perangkat tidak ditemukan.');
  if (perm !== 'device.read' && d.unitId && !unitInScope(actor, perm, d.unitId)) throw notFound('Perangkat tidak ditemukan.');
  return d;
}

export async function getDeviceDetail(actor: Actor, id: string) {
  return publicDevice(await getDevice(actor, id));
}

export async function saveDevice(actor: Actor, id: string | null, raw: unknown) {
  assertCan(actor, 'device.manage');
  const v = deviceInput.parse(raw);
  if (v.unitId && !unitInScope(actor, 'device.manage', v.unitId)) throw forbidden('Unit di luar kewenangan Anda.');
  const adapter = adapterFor(v.adapter)!;
  if (adapter.connection === 'LAN' && !v.host) throw unprocessable('Alamat IP mesin wajib diisi.', { host: 'Wajib untuk koneksi LAN' });
  const data = {
    name: v.name, vendor: v.vendor || null, model: v.model || null, serialNumber: v.serialNumber, adapter: v.adapter, connection: adapter.connection,
    host: v.host, port: v.port ?? (adapter.connection === 'LAN' ? 80 : null), location: v.location || null, unitId: v.unitId,
    syncIntervalMinutes: adapter.pull ? v.syncIntervalMinutes : 0, timeoutMs: v.timeoutMs, maxRetries: v.maxRetries,
  };
  if (v.serialNumber) {
    const dup = await prisma.attendanceDevice.findFirst({ where: { serialNumber: v.serialNumber, NOT: id ? { id } : undefined } });
    if (dup) throw conflict('Nomor seri sudah dipakai perangkat lain.', { serialNumber: 'Sudah dipakai' });
  }
  if (!id) {
    const d = await prisma.attendanceDevice.create({ data: { ...data, secretEnc: encryptOptional(v.secret) } });
    await audit(actor, { action: 'device.create', entityType: 'AttendanceDevice', entityId: d.id, after: { ...data, secret: v.secret ? '[diisi]' : null } });
    return publicDevice(d);
  }
  const cur = await getDevice(actor, id, 'device.manage');
  const d0 = diff(cur as unknown as Record<string, unknown>, data);
  const updated = await prisma.attendanceDevice.update({ where: { id }, data: { ...data, ...(v.secret ? { secretEnc: encryptOptional(v.secret) } : {}) } });
  if (d0.changed || v.secret) await audit(actor, { action: 'device.update', entityType: 'AttendanceDevice', entityId: id, before: d0.before, after: { ...d0.after, ...(v.secret ? { secret: '[diubah]' } : {}) } });
  return publicDevice(updated);
}

export async function setDeviceActive(actor: Actor, id: string, active: boolean) {
  await getDevice(actor, id, 'device.manage');
  await prisma.attendanceDevice.update({ where: { id }, data: { isActive: active, ...(active ? {} : { status: 'UNKNOWN' }) } });
  await audit(actor, { action: active ? 'device.activate' : 'device.deactivate', entityType: 'AttendanceDevice', entityId: id });
}

export async function deleteDevice(actor: Actor, id: string) {
  await getDevice(actor, id, 'device.manage');
  // Soft delete: raw event dan riwayat sinkronisasi tetap tersimpan.
  await prisma.attendanceDevice.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, serialNumber: null } });
  await audit(actor, { action: 'device.delete', entityType: 'AttendanceDevice', entityId: id });
}

async function configOf(d: Awaited<ReturnType<typeof getDevice>>): Promise<DeviceConfig> {
  const cfg: DeviceConfig = { id: d.id, name: d.name, host: d.host, port: d.port, secret: decryptOptional(d.secretEnc), timeoutMs: d.timeoutMs, serialNumber: d.serialNumber };
  if (d.adapter === 'MOCK') {
    const emps = await prisma.employee.findMany({ where: { machinePin: { not: null }, isActive: true, deletedAt: null, ...(d.unitId ? { unitId: d.unitId } : {}) }, select: { machinePin: true }, take: 500 });
    cfg.knownPins = emps.map((e) => e.machinePin!);
  }
  return cfg;
}

export async function testDevice(actor: Actor, id: string) {
  const d = await getDevice(actor, id, 'device.sync');
  const adapter = adapterFor(d.adapter);
  if (!adapter?.testConnection) throw unprocessable('Perangkat ini tidak mendukung uji koneksi (data masuk lewat impor berkas).');
  const r = await adapter.testConnection(await configOf(d));
  await prisma.attendanceDevice.update({ where: { id }, data: { status: r.ok ? 'ONLINE' : 'OFFLINE', ...(r.ok ? { lastSeenAt: new Date() } : {}) } });
  await audit(actor, { action: 'device.test', entityType: 'AttendanceDevice', entityId: id, result: r.ok ? 'SUCCESS' : 'FAILURE', meta: { message: r.message } });
  return r;
}

// Penyimpanan raw event dan pemrosesan
const BATCH = 500;

/** Kunci idempotensi: perangkat + PIN + waktu perangkat. Scan yang sama tidak pernah tersimpan dua kali. */
export const rawKey = (deviceKey: string, pin: string, local: string) => sha256(`${deviceKey}|${pin}|${local}`);

async function storeScans(opts: { deviceId: string | null; deviceKey: string; runId: string; scans: ParsedScan[]; users: ParsedUser[]; tz: string; clockSuspect: boolean }) {
  const s = await getSettings();
  const tolMs = Number(s['rules.clockSkewToleranceMinutes']) * 60_000;
  const now = Date.now();
  let inserted = 0;
  let failed = 0;
  const errors: string[] = [];
  for (let i = 0; i < opts.scans.length; i += BATCH) {
    const chunk = opts.scans.slice(i, i + BATCH);
    const data: Prisma.DeviceRawEventCreateManyInput[] = [];
    for (const sc of chunk) {
      try {
        const at = zonedToUtc(sc.local.slice(0, 10), sc.local.slice(11, 19), opts.tz);
        data.push({
          deviceId: opts.deviceId, syncRunId: opts.runId, devicePin: sc.pin, deviceTime: at,
          verifyMode: sc.verifyMode ?? null, statusCode: sc.statusCode ?? null, payload: { local: sc.local },
          idempotencyKey: rawKey(opts.deviceKey, sc.pin, sc.local),
          // Waktu perangkat di masa depan atau jam perangkat menyimpang: tandai untuk ditinjau.
          clockSkewSuspect: opts.clockSuspect || at.getTime() > now + tolMs,
        });
      } catch (err) {
        failed++;
        if (errors.length < 10) errors.push(`${sc.pin} ${sc.local}: ${(err as Error).message}`);
      }
    }
    const r = await prisma.deviceRawEvent.createMany({ data, skipDuplicates: true });
    inserted += r.count;
  }
  for (const u of opts.users) {
    if (!u.pin) continue;
    await prisma.deviceUser.upsert({
      where: { pin: u.pin },
      update: { ...(u.name ? { name: u.name } : {}), ...(u.department ? { department: u.department } : {}), ...(opts.deviceId ? { deviceId: opts.deviceId } : {}) },
      create: { pin: u.pin, name: u.name || null, department: u.department || null, deviceId: opts.deviceId },
    });
  }
  // Pastikan setiap PIN tercatat di daftar pengguna mesin (untuk pemetaan).
  const pins = [...new Set(opts.scans.map((x) => x.pin))];
  const known = new Set((await prisma.deviceUser.findMany({ where: { pin: { in: pins } }, select: { pin: true } })).map((x) => x.pin));
  const missing = pins.filter((p) => !known.has(p));
  if (missing.length) await prisma.deviceUser.createMany({ data: missing.map((pin) => ({ pin, deviceId: opts.deviceId })), skipDuplicates: true });
  return { inserted, failed, errors };
}

/**
 * Proses raw event yang belum diproses: petakan PIN ke pegawai, tentukan tanggal kerja,
 * lalu susun ulang rekap hari yang terdampak. Aman dijalankan berulang.
 */
export async function processPendingRawEvents(filter: Prisma.DeviceRawEventWhereInput = {}) {
  const s = await getSettings();
  const tz = s['org.timezone'];
  const grace = Number(s['rules.checkoutGraceHours']);
  const pending = await prisma.deviceRawEvent.findMany({ where: { processedAt: null, ...filter }, select: { id: true, devicePin: true, deviceTime: true }, orderBy: { deviceTime: 'asc' }, take: 50_000 });
  if (!pending.length) return { processed: 0, matched: 0, unmatchedPins: [] as string[], days: 0 };
  const pins = [...new Set(pending.map((p) => p.devicePin))];
  const emps = await prisma.employee.findMany({ where: { machinePin: { in: pins }, deletedAt: null }, select: { id: true, machinePin: true } });
  const byPin = new Map(emps.map((e) => [e.machinePin!, e.id]));
  const dates = pending.map((p) => zonedParts(p.deviceTime, tz).date).sort();
  const ctx = emps.length ? await loadPlanContext(emps.map((e) => e.id), addDays(dates[0], -1), dates[dates.length - 1]) : null;
  const touched = new Map<string, Set<string>>();
  const unmatched = new Set<string>();
  const now = new Date();
  const ignoredPins = new Set((await prisma.deviceUser.findMany({ where: { pin: { in: pins }, ignoredAt: { not: null } }, select: { pin: true } })).map((u) => u.pin));
  for (const p of pending) {
    const employeeId = byPin.get(p.devicePin) ?? null;
    if (!employeeId && ignoredPins.has(p.devicePin)) {
      await prisma.deviceRawEvent.update({ where: { id: p.id }, data: { processedAt: now, processingNote: 'ID mesin dilewati admin' } });
      continue;
    }
    if (!employeeId) {
      unmatched.add(p.devicePin);
      continue; // tetap belum diproses sampai PIN dipetakan
    }
    const today = zonedParts(p.deviceTime, tz).date;
    const wd = workDateFor(p.deviceTime, today, ctx!.planFor(employeeId, addDays(today, -1)), tz, grace);
    await prisma.deviceRawEvent.update({ where: { id: p.id }, data: { employeeId, workDate: toDbDate(wd), processedAt: now, processingNote: null } });
    if (!touched.has(employeeId)) touched.set(employeeId, new Set());
    touched.get(employeeId)!.add(wd);
  }
  let days = 0;
  for (const [employeeId, set] of touched) {
    const list = [...set].sort();
    // Susun ulang per rentang agar konteks jadwal dimuat sekali.
    await rebuildRange([employeeId], list[0], list[list.length - 1]);
    days += set.size;
  }
  return { processed: pending.length - [...unmatched].length, matched: touched.size, unmatchedPins: [...unmatched], days };
}

// Sinkronisasi
const running = new Set<string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSync(deviceId: string, trigger: 'MANUAL' | 'SCHEDULED' | 'RETRY' | 'RECONCILE', actor: Actor | null, opts: { fromCursor?: string | null } = {}) {
  const d = await prisma.attendanceDevice.findFirst({ where: { id: deviceId, deletedAt: null } });
  if (!d) throw notFound('Perangkat tidak ditemukan.');
  if (!d.isActive) throw unprocessable('Perangkat nonaktif. Aktifkan terlebih dahulu.');
  const adapter = adapterFor(d.adapter);
  if (!adapter?.pull || !adapter.fetch) throw unprocessable('Perangkat ini tidak mendukung tarik data. Gunakan impor berkas.');
  if (running.has(deviceId)) throw conflict('Sinkronisasi perangkat ini sedang berjalan.');
  running.add(deviceId);
  const s = await getSettings();
  const tz = d.unitId ? (await prisma.organizationUnit.findUnique({ where: { id: d.unitId } }))?.timezone || s['org.timezone'] : s['org.timezone'];
  const cursor = opts.fromCursor !== undefined ? opts.fromCursor : d.lastSyncCursor;
  const run = await prisma.deviceSyncRun.create({ data: { deviceId, trigger, status: 'RUNNING', cursorBefore: cursor, triggeredById: actor ? realUserId(actor) : null } });
  try {
    const cfg = await configOf(d);
    let attempt = 0;
    let result;
    let lastErr: Error | null = null;
    while (attempt <= d.maxRetries) {
      attempt++;
      try {
        result = await adapter.fetch(cfg, cursor);
        break;
      } catch (err) {
        lastErr = err as Error;
        if (err instanceof DeviceError && !err.retryable) break;
        if (attempt <= d.maxRetries) await sleep(Math.min(2000 * 2 ** (attempt - 1), 15000));
      }
    }
    if (!result) throw Object.assign(lastErr ?? new Error('Gagal menarik data.'), { attempts: attempt });
    // Jam perangkat yang menyimpang dari jam server melebihi toleransi ditandai.
    let clockSuspect = false;
    if (result.deviceClock) {
      const dev = zonedToUtc(result.deviceClock.slice(0, 10), result.deviceClock.slice(11, 19), tz).getTime();
      clockSuspect = Math.abs(dev - Date.now()) > Number(s['rules.clockSkewToleranceMinutes']) * 60_000;
    }
    const stored = await storeScans({ deviceId, deviceKey: d.serialNumber || d.id, runId: run.id, scans: result.scans, users: result.users, tz, clockSuspect });
    const proc = await processPendingRawEvents({ deviceId });
    const status = stored.failed ? 'PARTIAL' : 'SUCCESS';
    await prisma.deviceSyncRun.update({
      where: { id: run.id },
      data: {
        status, attempt, finishedAt: new Date(), received: result.scans.length, inserted: stored.inserted, duplicates: result.scans.length - stored.inserted - stored.failed,
        failed: stored.failed, cursorAfter: result.cursorAfter, details: { unmatchedPins: proc.unmatchedPins.slice(0, 50), days: proc.days, errors: stored.errors, clockSuspect },
      },
    });
    const wasOffline = d.status === 'OFFLINE';
    await prisma.attendanceDevice.update({
      where: { id: deviceId },
      data: { status: 'ONLINE', lastSyncAt: new Date(), lastSeenAt: new Date(), lastSyncCursor: result.cursorAfter ?? d.lastSyncCursor, receivedCount: { increment: stored.inserted }, failedCount: { increment: stored.failed } },
    });
    if (wasOffline) await notifyPermission('device.manage', d.unitId, { type: 'device', title: `${d.name} kembali terhubung`, link: `/perangkat/${d.id}` });
    if (actor) await audit(actor, { action: 'device.sync', entityType: 'AttendanceDevice', entityId: deviceId, meta: { runId: run.id, inserted: stored.inserted } });
    return prisma.deviceSyncRun.findUniqueOrThrow({ where: { id: run.id } });
  } catch (err) {
    const message = (err as Error).message;
    await prisma.deviceSyncRun.update({ where: { id: run.id }, data: { status: 'FAILED', finishedAt: new Date(), errorMessage: message, attempt: (err as { attempts?: number }).attempts ?? 1 } });
    const wasOnline = d.status !== 'OFFLINE';
    await prisma.attendanceDevice.update({ where: { id: deviceId }, data: { status: 'OFFLINE', failedCount: { increment: 1 } } });
    if (wasOnline) await notifyPermission('device.manage', d.unitId, { type: 'device', title: `Sinkronisasi ${d.name} gagal`, body: message, link: `/perangkat/${d.id}` });
    if (actor) await audit(actor, { action: 'device.sync', entityType: 'AttendanceDevice', entityId: deviceId, result: 'FAILURE', meta: { runId: run.id, message } });
    log.warn('Sinkronisasi perangkat gagal', { device: d.name, message });
    throw new DeviceError(message);
  } finally {
    running.delete(deviceId);
  }
}

export async function syncNow(actor: Actor, id: string) {
  await getDevice(actor, id, 'device.sync');
  try {
    return await runSync(id, 'MANUAL', actor);
  } catch (err) {
    if (err instanceof DeviceError) throw unprocessable(err.message);
    throw err;
  }
}

/** Ulangi sinkronisasi gagal (tanpa memajukan kursor). */
export async function retryRun(actor: Actor, runId: string) {
  const r = await prisma.deviceSyncRun.findUnique({ where: { id: runId } });
  if (!r?.deviceId) throw notFound('Riwayat sinkronisasi tidak ditemukan.');
  await getDevice(actor, r.deviceId, 'device.sync');
  try {
    return await runSync(r.deviceId, 'RETRY', actor, { fromCursor: r.cursorBefore });
  } catch (err) {
    if (err instanceof DeviceError) throw unprocessable(err.message);
    throw err;
  }
}

/**
 * Rekonsiliasi: tarik ulang data perangkat sejak tanggal tertentu tanpa kursor, simpan scan yang
 * belum ada (yang sudah ada dilewati), lalu bandingkan jumlah scan perangkat dan sistem per hari.
 */
export async function reconcile(actor: Actor, id: string, from: string) {
  const d = await getDevice(actor, id, 'device.sync');
  if (!isValidDate(from)) throw unprocessable('Tanggal tidak valid.', { from: 'Tanggal tidak valid' });
  let run;
  try {
    run = await runSync(id, 'RECONCILE', actor, { fromCursor: `${from} 00:00:00` });
  } catch (err) {
    if (err instanceof DeviceError) throw unprocessable(err.message);
    throw err;
  }
  const tz = (await getSettings())['org.timezone'];
  const events = await prisma.deviceRawEvent.findMany({ where: { deviceId: d.id, deviceTime: { gte: zonedToUtc(from, '00:00', tz) } }, select: { deviceTime: true, employeeId: true, processedAt: true } });
  const perDay = new Map<string, { stored: number; unmatched: number }>();
  for (const e of events) {
    const k = zonedParts(e.deviceTime, tz).date;
    const v = perDay.get(k) || { stored: 0, unmatched: 0 };
    v.stored++;
    if (!e.employeeId) v.unmatched++;
    perDay.set(k, v);
  }
  return { run, days: [...perDay.entries()].sort().map(([date, v]) => ({ date, ...v })) };
}

/** Impor berkas hasil unduhan USB (mis. Solution P280). */
export async function importDeviceFile(actor: Actor, deviceId: string | null, buffer: Buffer, filename: string) {
  assertCan(actor, 'device.sync');
  let device = null;
  if (deviceId) device = await getDevice(actor, deviceId, 'device.sync');
  let parsed;
  try {
    parsed = await parseExportFile(buffer, filename);
  } catch (err) {
    throw unprocessable((err as Error).message);
  }
  const s = await getSettings();
  const tz = device?.unitId ? (await prisma.organizationUnit.findUnique({ where: { id: device.unitId } }))?.timezone || s['org.timezone'] : s['org.timezone'];
  const run = await prisma.deviceSyncRun.create({ data: { deviceId: device?.id ?? null, trigger: 'FILE', status: 'RUNNING', fileName: filename.slice(0, 200), triggeredById: realUserId(actor) } });
  const stored = await storeScans({ deviceId: device?.id ?? null, deviceKey: device ? device.serialNumber || device.id : 'berkas', runId: run.id, scans: parsed.scans, users: parsed.users, tz, clockSuspect: false });
  const proc = await processPendingRawEvents({ syncRunId: run.id });
  const dates = parsed.scans.map((x) => x.local.slice(0, 10)).sort();
  const summary = {
    format: parsed.format, period: parsed.period ?? (dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null),
    received: parsed.scans.length, inserted: stored.inserted, duplicates: parsed.scans.length - stored.inserted - stored.failed, failed: stored.failed,
    employees: proc.matched, days: proc.days, unmatchedPins: proc.unmatchedPins,
  };
  await prisma.deviceSyncRun.update({ where: { id: run.id }, data: { status: stored.failed ? 'PARTIAL' : 'SUCCESS', finishedAt: new Date(), received: summary.received, inserted: summary.inserted, duplicates: summary.duplicates, failed: summary.failed, details: summary } });
  if (device) await prisma.attendanceDevice.update({ where: { id: device.id }, data: { lastSyncAt: new Date(), receivedCount: { increment: stored.inserted } } });
  await audit(actor, { action: 'device.import_file', entityType: 'DeviceSyncRun', entityId: run.id, meta: { file: filename, inserted: stored.inserted, duplicates: summary.duplicates } });
  return { runId: run.id, ...summary };
}

// Pemetaan PIN mesin ke pegawai
export async function unmatchedPins(actor: Actor) {
  assertCan(actor, 'device.read');
  const users = await prisma.deviceUser.findMany({ where: { ignoredAt: null }, include: { device: { select: { name: true } } }, orderBy: [{ name: 'asc' }, { pin: 'asc' }] });
  const mapped = new Set((await prisma.employee.findMany({ where: { machinePin: { in: users.map((u) => u.pin) } }, select: { machinePin: true } })).map((e) => e.machinePin));
  const list = users.filter((u) => !mapped.has(u.pin));
  const counts = await prisma.deviceRawEvent.groupBy({ by: ['devicePin'], where: { devicePin: { in: list.map((u) => u.pin) } }, _count: { _all: true }, _max: { deviceTime: true } });
  const c = new Map(counts.map((x) => [x.devicePin, x]));
  return list.map((u) => ({ pin: u.pin, name: u.name, department: u.department, device: u.device?.name ?? null, scans: c.get(u.pin)?._count._all ?? 0, lastScan: c.get(u.pin)?._max.deviceTime ?? null }));
}

/** ID mesin yang dilewati admin, untuk ditampilkan dan bisa dipulihkan. */
export async function ignoredPins(actor: Actor) {
  assertCan(actor, 'device.read');
  const users = await prisma.deviceUser.findMany({ where: { ignoredAt: { not: null } }, orderBy: [{ name: 'asc' }, { pin: 'asc' }] });
  return users.map((u) => ({ pin: u.pin, name: u.name, department: u.department }));
}

/** Lewati ID mesin yang memang tidak perlu dihubungkan ke pegawai; scan-nya tidak lagi menunggu pemetaan. */
export async function ignorePins(actor: Actor, pins: string[]) {
  if (!can(actor, 'employee.write') && !can(actor, 'device.manage')) throw forbidden();
  const list = [...new Set(pins.map((p) => p.trim()).filter(Boolean))];
  if (!list.length) throw unprocessable('Pilih ID mesin yang dilewati.');
  const mapped = await prisma.employee.findMany({ where: { machinePin: { in: list }, deletedAt: null }, select: { machinePin: true } });
  const target = list.filter((p) => !mapped.some((e) => e.machinePin === p));
  const now = new Date();
  await prisma.deviceUser.createMany({ data: target.map((pin) => ({ pin })), skipDuplicates: true });
  await prisma.deviceUser.updateMany({ where: { pin: { in: target } }, data: { ignoredAt: now } });
  const r = await prisma.deviceRawEvent.updateMany({ where: { devicePin: { in: target }, processedAt: null }, data: { processedAt: now, processingNote: 'ID mesin dilewati admin' } });
  await audit(actor, { action: 'device.ignore_pin', entityType: 'DeviceUser', meta: { pins: target, scans: r.count } });
  return { ignored: target.length, scans: r.count };
}

/** Batalkan pelewatan: scan yang dulu dilewati diproses lagi, ID kembali menunggu pemetaan. */
export async function restorePin(actor: Actor, pin: string) {
  if (!can(actor, 'employee.write') && !can(actor, 'device.manage')) throw forbidden();
  await prisma.deviceUser.updateMany({ where: { pin }, data: { ignoredAt: null } });
  const r = await prisma.deviceRawEvent.updateMany({ where: { devicePin: pin, employeeId: null, processingNote: 'ID mesin dilewati admin' }, data: { processedAt: null, processingNote: null } });
  await audit(actor, { action: 'device.restore_pin', entityType: 'DeviceUser', meta: { pin, scans: r.count } });
  return { scans: r.count };
}

/** Hubungkan PIN mesin ke pegawai, lalu proses scan yang tertunda. */
export async function mapPin(actor: Actor, pin: string, employeeId: string) {
  if (!can(actor, 'employee.write') && !can(actor, 'device.manage')) throw forbidden();
  const emp = await getEmployeeInScope(actor, can(actor, 'employee.write') ? 'employee.write' : 'device.manage', employeeId);
  if (emp.machinePin && emp.machinePin !== pin) throw conflict(`${emp.fullName} sudah terhubung ke ID mesin ${emp.machinePin}.`);
  const other = await prisma.employee.findFirst({ where: { machinePin: pin, NOT: { id: employeeId } } });
  if (other) throw conflict(`ID mesin ${pin} sudah terhubung ke ${other.fullName}.`);
  await prisma.employee.update({ where: { id: employeeId }, data: { machinePin: pin } });
  await audit(actor, { action: 'device.map_pin', entityType: 'Employee', entityId: employeeId, after: { machinePin: pin } });
  return processPendingRawEvents({ devicePin: pin });
}

export async function reprocess(actor: Actor, from: string, to: string) {
  assertCan(actor, 'attendance.recalculate');
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw unprocessable('Rentang tanggal tidak valid.');
  const tz = (await getSettings())['org.timezone'];
  const range = { gte: zonedToUtc(addDays(from, -1), '00:00', tz), lte: zonedToUtc(addDays(to, 1), '23:59', tz) };
  // Lepas status "sudah diproses" agar pemetaan dan tanggal kerja dihitung ulang dengan aturan terbaru.
  await prisma.deviceRawEvent.updateMany({ where: { deviceTime: range }, data: { processedAt: null } });
  const r = await processPendingRawEvents({ deviceTime: range });
  await audit(actor, { action: 'attendance.recalculate', entityType: 'DeviceRawEvent', meta: { from, to, ...r, unmatchedPins: r.unmatchedPins.length } });
  return r;
}

// Log dan riwayat
export async function syncRuns(actor: Actor, deviceId?: string, take = 50) {
  assertCan(actor, 'device.read');
  if (deviceId) await getDevice(actor, deviceId);
  return prisma.deviceSyncRun.findMany({
    where: { ...(deviceId ? { deviceId } : {}), OR: [{ device: deviceScopeWhere(actor) }, { deviceId: null }] },
    include: { device: { select: { name: true } } },
    orderBy: { startedAt: 'desc' },
    take,
  });
}

const RUN_ORDER: Record<string, (d: 'asc' | 'desc') => Prisma.DeviceSyncRunOrderByWithRelationInput[]> = {
  mulai: (d) => [{ startedAt: d }, { id: 'asc' }],
  diterima: (d) => [{ received: d }, { startedAt: 'desc' }],
  baru: (d) => [{ inserted: d }, { startedAt: 'desc' }],
};
export const runQuery = z.object({
  deviceId: z.string().uuid().optional().or(z.literal('')).catch(undefined).transform((v) => v || undefined),
  status: z.enum(['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', '']).catch('').default('').transform((v) => v || undefined),
}).and(listSchema(['mulai', 'diterima', 'baru'] as const, { sort: 'mulai', dir: 'desc' }));

/** Riwayat sinkronisasi dengan filter, urutan, dan halaman. */
export async function syncRunsPage(actor: Actor, raw: unknown) {
  assertCan(actor, 'device.read');
  const q = runQuery.parse(raw);
  const where: Prisma.DeviceSyncRunWhereInput = {
    AND: [{ OR: [{ device: deviceScopeWhere(actor) }, { deviceId: null }] }, q.deviceId ? { deviceId: q.deviceId } : {}, q.status ? { status: q.status } : {}],
  };
  const total = await prisma.deviceSyncRun.count({ where });
  const page = clampPage(q.page, q.per, total);
  const rows = await prisma.deviceSyncRun.findMany({ where, include: { device: { select: { name: true } } }, orderBy: RUN_ORDER[q.sort](q.dir), skip: (page - 1) * q.per, take: q.per });
  return { total, page, pageSize: q.per, sort: q.sort, dir: q.dir, rows };
}

const RAW_ORDER: Record<string, (d: 'asc' | 'desc') => Prisma.DeviceRawEventOrderByWithRelationInput[]> = {
  waktu: (d) => [{ deviceTime: d }, { id: 'asc' }],
  diterima: (d) => [{ receivedAt: d }, { id: 'asc' }],
  pin: (d) => [{ devicePin: d }, { deviceTime: 'desc' }],
  nama: (d) => [{ employee: { fullName: d } }, { deviceTime: 'desc' }],
};
export const rawQuery = z.object({
  from: z.string().refine(isValidDate),
  to: z.string().refine(isValidDate),
  deviceId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  q: z.string().max(60).optional(),
  // belum = ID mesin belum dipetakan, tertunda = belum diproses, menyimpang = jam perangkat menyimpang
  state: z.enum(['belum', 'tertunda', 'menyimpang', '']).catch('').default(''),
}).and(listSchema(['waktu', 'diterima', 'pin', 'nama'] as const, { sort: 'waktu', dir: 'desc' }));

export async function rawEvents(actor: Actor, raw: unknown) {
  assertCan(actor, 'device.read');
  const q = rawQuery.parse(raw);
  const tz = (await getSettings())['org.timezone'];
  const where: Prisma.DeviceRawEventWhereInput = {
    AND: [
      { deviceTime: { gte: zonedToUtc(q.from, '00:00', tz), lte: zonedToUtc(q.to, '23:59', tz) } },
      q.deviceId ? { deviceId: q.deviceId } : {},
      q.q ? { OR: [{ devicePin: q.q }, { employee: { fullName: { contains: q.q, mode: 'insensitive' } } }] } : {},
      q.state === 'belum' ? { employeeId: null } : q.state === 'tertunda' ? { processedAt: null } : q.state === 'menyimpang' ? { clockSkewSuspect: true } : {},
      { OR: [{ device: deviceScopeWhere(actor) }, { deviceId: null }] },
    ],
  };
  const size = q.per;
  const total = await prisma.deviceRawEvent.count({ where });
  const page = clampPage(q.page, size, total);
  const rows = await prisma.deviceRawEvent.findMany({ where, include: { device: { select: { name: true } }, employee: { select: { id: true, fullName: true, employeeNumber: true } } }, orderBy: RAW_ORDER[q.sort](q.dir), skip: (page - 1) * size, take: size });
  return { total, page, pageSize: size, sort: q.sort, dir: q.dir, rows };
}

// Penjadwal tarik otomatis (dipanggil dari instrumentation.ts setiap menit)
export async function runDueSyncs() {
  const devices = await prisma.attendanceDevice.findMany({ where: { isActive: true, deletedAt: null, syncIntervalMinutes: { gt: 0 } } });
  const now = Date.now();
  for (const d of devices) {
    const adapter = adapterFor(d.adapter);
    if (!adapter?.pull || running.has(d.id)) continue;
    if (d.lastSyncAt && now - d.lastSyncAt.getTime() < d.syncIntervalMinutes * 60_000) continue;
    // Setelah gagal, jangan mencoba lebih sering dari interval.
    const lastRun = await prisma.deviceSyncRun.findFirst({ where: { deviceId: d.id }, orderBy: { startedAt: 'desc' } });
    if (lastRun && now - lastRun.startedAt.getTime() < d.syncIntervalMinutes * 60_000) continue;
    await runSync(d.id, 'SCHEDULED', null).catch(() => undefined);
  }
}
