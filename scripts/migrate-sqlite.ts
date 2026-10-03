// Migrasi data dari aplikasi absensi lama (SQLite, data/absensi.db) ke SIMPEG (PostgreSQL).
//
//   npm run migrate:sqlite -- --sqlite ./data/absensi.db [--uploads ./uploads] [--face pending|active|skip] [--dry-run]
//
// Prasyarat: database tujuan sudah dimigrasi (npm run db:deploy) dan di-seed tanpa data demo
// (npm run db:seed), sehingga peran dan akun Super Admin pertama sudah ada. Database tujuan
// harus belum berisi pegawai, kecuali dengan --allow-existing.
//
// Prinsip:
// - Jam absensi lama menjadi transaksi sumber (AttendanceEvent / DeviceRawEvent) yang immutable,
//   lalu rekap disusun ulang oleh mesin perhitungan baru. Nilai rekap lama tidak disalin mentah.
// - Status tetap lama (izin, sakit, cuti, dinas luar, alpa) dan dispensasi dipertahankan lewat
//   koreksi berstatus disetujui dengan alasan "migrasi", sehingga tetap bisa ditelusuri.
// - Template wajah dienkripsi ulang. Sistem lama tidak mencatat persetujuan pegawai, jadi bawaannya
//   template masuk sebagai "menunggu verifikasi" sampai petugas memverifikasi (--face pending).
import 'dotenv/config';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Prisma } from '../src/generated/prisma/client';
import { prisma } from '../src/lib/db';
import { encrypt, sha256 } from '../src/lib/crypto';
import { syncRbac } from '../src/lib/auth/sync';
import { getSettings } from '../src/lib/settings';
import { addDays, isValidDate, isValidTime, toDbDate, todayIn, zonedToUtc } from '../src/lib/time';
import { cleanPin, normDateTime } from '../src/lib/devices/parsers';
import { rawKey, processPendingRawEvents } from '../src/lib/services/devices';
import { rebuildActive } from '../src/lib/services/schedules';
import { sealTemplate } from '../src/lib/biometric/templates';
import { activeMatcher, parseDescriptor } from '../src/lib/biometric/matcher';
import { saveFile, sniff } from '../src/lib/storage';

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? null : String(v).trim() || null);

function args() {
  const a = process.argv.slice(2);
  const get = (k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
  const sqlite = get('sqlite') ?? './data/absensi.db';
  const face = (get('face') ?? 'pending') as 'pending' | 'active' | 'skip';
  if (!['pending', 'active', 'skip'].includes(face)) throw new Error('--face harus pending, active, atau skip');
  return { sqlite, uploads: get('uploads'), face, dryRun: a.includes('--dry-run'), allowExisting: a.includes('--allow-existing') };
}

const report = { counts: {} as Record<string, number>, warnings: [] as string[] };
const count = (k: string, n = 1) => { report.counts[k] = (report.counts[k] ?? 0) + n; };
const warn = (m: string) => { if (report.warnings.length < 500) report.warnings.push(m); };

function slug(s: string) {
  return s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toUpperCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 24) || 'UNIT';
}

/** "YYYY-MM-DD HH:MM[:SS]" atau "HH:MM" (dengan tanggal) menjadi { date, time }. */
function splitLocal(v: unknown, fallbackDate: string): { date: string; time: string } | null {
  const s = str(v);
  if (!s) return null;
  const n = normDateTime(s);
  if (n) return { date: n.slice(0, 10), time: n.slice(11, 19) };
  const t = s.slice(0, 5);
  return isValidTime(t) ? { date: fallbackDate, time: `${t}:00` } : null;
}

async function main() {
  const opt = args();
  const file = path.resolve(opt.sqlite);
  await stat(file).catch(() => { throw new Error(`Berkas SQLite tidak ditemukan: ${file}`); });
  const lite = new DatabaseSync(file, { readOnly: true });
  const all = (sql: string) => lite.prepare(sql).all() as Row[];
  const has = (t: string) => !!lite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
  const tbl = (t: string) => (has(t) ? all(`SELECT * FROM ${t}`) : []);

  const legacy = {
    settings: Object.fromEntries(tbl('settings').map((r) => [String(r.key), str(r.value)])),
    shifts: tbl('shifts'), employees: tbl('employees'), users: tbl('users'), schedules: tbl('shift_schedules'),
    attendance: tbl('attendance'), clarifications: tbl('clarifications'), devices: tbl('devices'),
    logs: tbl('fingerprint_logs'), fpUsers: tbl('fingerprint_users'), holidays: tbl('hari_libur'),
  };
  for (const [k, v] of Object.entries(legacy)) if (Array.isArray(v)) count(`sumber.${k}`, v.length);

  if (opt.dryRun) {
    console.log(JSON.stringify({ mode: 'dry-run', ...report }, null, 2));
    return;
  }

  await syncRbac();
  if (!opt.allowExisting && (await prisma.employee.count())) throw new Error('Database tujuan sudah berisi pegawai. Gunakan database kosong atau --allow-existing.');
  if (await prisma.systemSetting.findUnique({ where: { key: 'migration.sqlite' } })) throw new Error('Migrasi SQLite sudah pernah dijalankan pada database ini.');
  const fallbackAdmin = await prisma.user.findFirst({ where: { roles: { some: { role: { code: 'SUPER_ADMIN' } } } }, orderBy: { createdAt: 'asc' } });
  if (!fallbackAdmin) throw new Error('Belum ada akun Super Admin. Jalankan npm run db:seed terlebih dahulu.');
  const s0 = await getSettings();
  const tz = s0['org.timezone'];
  const S = legacy.settings;

  // --- Pengaturan -----------------------------------------------------------------------------
  const setting = async (key: string, value: unknown) => {
    await prisma.systemSetting.upsert({ where: { key }, update: { value: value as never }, create: { key, value: value as never } });
    count('pengaturan');
  };
  if (S.nama_instansi) await setting('org.name', S.nama_instansi);
  if (S.timezone_label) await setting('org.timezoneLabel', S.timezone_label);
  if (S.face_threshold && Number(S.face_threshold) >= 0.2 && Number(S.face_threshold) <= 0.8) await setting('face.matchThreshold', Number(S.face_threshold));
  if (S.office_lat && S.office_lng && !Number.isNaN(Number(S.office_lat)) && !Number.isNaN(Number(S.office_lng))) {
    await setting('geo.officeLat', Number(S.office_lat));
    await setting('geo.officeLng', Number(S.office_lng));
    await setting('geo.enforce', S.enforce_geofence === '1');
  }
  if (S.office_radius && Number(S.office_radius) >= 10) await setting('geo.radiusM', Number(S.office_radius));
  if (S.self_checkin != null) await setting('methods.faceSelf', S.self_checkin === '1');
  if (S.liveness != null) await setting('face.requireLiveness', S.liveness === '1');
  if (S.logo && opt.uploads) {
    const buf = await readFile(path.join(opt.uploads, path.basename(S.logo))).catch(() => null);
    const ext = buf && sniff(buf);
    if (buf && ext && ['png', 'jpg', 'webp'].includes(ext)) await setting('org.logo', await saveFile('logo', buf, ext));
    else warn(`Logo lama tidak ditemukan atau formatnya tidak didukung: ${S.logo}`);
  }
  const workdays = (S.hari_kerja ?? '1,2,3,4,5').split(',').map(Number).filter((n) => n >= 0 && n <= 6);

  // --- Unit kerja (dari teks unit_kerja) ------------------------------------------------------
  const unitByName = new Map<string, string>();
  for (const e of legacy.employees) {
    const name = str(e.unit_kerja);
    if (!name || unitByName.has(name.toLowerCase())) continue;
    const existing = await prisma.organizationUnit.findFirst({ where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null } });
    if (existing) { unitByName.set(name.toLowerCase(), existing.id); continue; }
    let code = slug(name);
    for (let i = 2; await prisma.organizationUnit.findUnique({ where: { code } }); i++) code = `${slug(name).slice(0, 20)}-${i}`;
    const u = await prisma.organizationUnit.create({ data: { code, name } });
    unitByName.set(name.toLowerCase(), u.id);
    count('unit');
  }

  // --- Jadwal ---------------------------------------------------------------------------------
  const scheduleId = new Map<number, string>();
  for (const sh of legacy.shifts) {
    const code = String(sh.kode).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 10) || `S${sh.id}`;
    const exists = await prisma.workSchedule.findUnique({ where: { code } });
    if (exists) { scheduleId.set(Number(sh.id), exists.id); warn(`Jadwal ${code} sudah ada; dipakai jadwal yang ada.`); continue; }
    const checkIn = String(sh.jam_masuk).slice(0, 5);
    const checkOut = String(sh.jam_pulang).slice(0, 5);
    if (!isValidTime(checkIn) || !isValidTime(checkOut)) { warn(`Jadwal ${code} dilewati: jam tidak valid.`); continue; }
    const data = {
      code, name: String(sh.nama), kind: code === 'REG' ? 'REGULER' : 'SHIFT', checkIn, checkOut, breakStart: null, breakEnd: null,
      lateToleranceMin: Number(sh.toleransi_menit) || 0, earlyLeaveToleranceMin: 0, workdays,
      color: /^#[0-9a-f]{6}$/i.test(String(sh.warna)) ? String(sh.warna) : '#2a78d6', isActive: Number(sh.aktif) !== 0,
    };
    const ws = await prisma.workSchedule.create({ data: data as never });
    const rules = Object.fromEntries(['code', 'name', 'kind', 'checkIn', 'checkOut', 'breakStart', 'breakEnd', 'lateToleranceMin', 'earlyLeaveToleranceMin', 'workdays'].map((k) => [k, (data as Record<string, unknown>)[k]]));
    await prisma.workScheduleRevision.create({ data: { scheduleId: ws.id, version: 1, rules: rules as Prisma.InputJsonObject, changeNote: 'Migrasi dari sistem lama' } });
    scheduleId.set(Number(sh.id), ws.id);
    count('jadwal');
  }

  // --- Pegawai --------------------------------------------------------------------------------
  const empId = new Map<number, string>();
  const firstActivity = new Map<number, string>();
  for (const a of legacy.attendance) {
    const k = Number(a.employee_id);
    const d = String(a.tanggal);
    if (!firstActivity.has(k) || d < firstActivity.get(k)!) firstActivity.set(k, d);
  }
  const today = todayIn(tz);
  for (const e of legacy.employees) {
    const nip = str(e.nip);
    const pin = cleanPin(e.id_mesin) || null;
    if (nip && (await prisma.employee.findUnique({ where: { employeeNumber: nip } }))) { warn(`Pegawai NIP ${nip} sudah ada; dilewati.`); continue; }
    if (pin && (await prisma.employee.findUnique({ where: { machinePin: pin } }))) { warn(`ID mesin ${pin} sudah dipakai; dikosongkan untuk ${e.nama}.`); }
    const start = isValidDate(str(e.tanggal_masuk)) ? String(e.tanggal_masuk) : null;
    const unitId = str(e.unit_kerja) ? unitByName.get(String(e.unit_kerja).trim().toLowerCase()) ?? null : null;
    const active = String(e.status ?? 'aktif') === 'aktif';
    const g = str(e.jenis_kelamin)?.toUpperCase();
    const emp = await prisma.employee.create({
      data: {
        employeeNumber: nip, fullName: String(e.nama).trim(), gender: g?.startsWith('L') ? 'L' : g?.startsWith('P') ? 'P' : null,
        position: str(e.jabatan), email: str(e.email), phone: str(e.telepon), address: str(e.alamat),
        startDate: start ? toDbDate(start) : null, unitId, isActive: active, activeEffectiveDate: active ? null : toDbDate(today),
        machinePin: pin && !(await prisma.employee.findUnique({ where: { machinePin: pin } })) ? pin : null,
        createdAt: e.created_at ? new Date(String(e.created_at).replace(' ', 'T')) : undefined,
      },
    });
    empId.set(Number(e.id), emp.id);
    count('pegawai');
    const from = [start, firstActivity.get(Number(e.id))].filter(Boolean).sort()[0] ?? today;
    if (str(e.jabatan)) await prisma.employeePositionHistory.create({ data: { employeeId: emp.id, position: String(e.jabatan), startDate: toDbDate(from), note: 'Migrasi dari sistem lama' } }).catch(() => undefined);
    if (unitId) await prisma.employeeUnitHistory.create({ data: { employeeId: emp.id, unitId, startDate: toDbDate(from), note: 'Migrasi dari sistem lama' } }).catch(() => undefined);
    // Jadwal bawaan -> penugasan tetap sejak tanggal aktivitas pertama.
    const sid = e.default_shift_id != null ? scheduleId.get(Number(e.default_shift_id)) : undefined;
    if (sid) {
      await prisma.employeeScheduleAssignment.create({ data: { employeeId: emp.id, scheduleId: sid, kind: 'TETAP', startDate: toDbDate(from), note: 'Jadwal bawaan dari sistem lama' } });
      count('penugasan_tetap');
    }
    // Template wajah.
    if (opt.face !== 'skip' && e.face_descriptors) {
      try {
        const list = (JSON.parse(String(e.face_descriptors)) as unknown[]).map((d) => parseDescriptor(d)).filter(Boolean) as number[][];
        if (list.length) {
          await prisma.employeeBiometric.create({
            data: {
              employeeId: emp.id, modality: 'FACE', model: activeMatcher().model, templateEnc: sealTemplate(activeMatcher().model, list), sampleCount: list.length,
              status: opt.face === 'active' ? 'ACTIVE' : 'PENDING_VERIFICATION', consentVersion: 'migrasi', consentAt: new Date(),
            },
          });
          count(opt.face === 'active' ? 'wajah_aktif' : 'wajah_menunggu_verifikasi');
        }
      } catch {
        warn(`Data wajah ${e.nama} tidak terbaca; dilewati.`);
      }
    }
  }

  // --- Pengguna -------------------------------------------------------------------------------
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  const userId = new Map<number, string>();
  const userOfEmp = new Map<string, string>();
  for (const u of legacy.users) {
    let username = String(u.username).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') || `pengguna${u.id}`;
    if (await prisma.user.findUnique({ where: { username } })) {
      const orig = username;
      username = `${orig}.lama`;
      for (let i = 2; await prisma.user.findUnique({ where: { username } }); i++) username = `${orig}.lama${i}`;
      warn(`Username ${orig} sudah ada di sistem baru; akun lama menjadi ${username}.`);
    }
    const employeeId = u.employee_id != null ? empId.get(Number(u.employee_id)) ?? null : null;
    const hash = String(u.password_hash);
    // Kata sandi bawaan lama wajib diganti saat masuk pertama.
    const weak = u.role === 'admin' && (await import('bcryptjs')).compareSync('admin123', hash);
    const nu = await prisma.user.create({ data: { username, passwordHash: hash, employeeId, mustChangePassword: weak } });
    await prisma.userRole.create({ data: { userId: nu.id, roleId: roles.get(u.role === 'admin' ? 'SUPER_ADMIN' : 'PEGAWAI')!, unitId: null, includeSubunits: true } });
    userId.set(Number(u.id), nu.id);
    if (employeeId) userOfEmp.set(employeeId, nu.id);
    count(u.role === 'admin' ? 'pengguna_admin' : 'pengguna_pegawai');
  }

  // --- Hari libur dan jadwal harian -----------------------------------------------------------
  for (const h of legacy.holidays) {
    if (!isValidDate(str(h.tanggal))) continue;
    const d = toDbDate(String(h.tanggal));
    if (await prisma.holiday.findFirst({ where: { date: d, unitId: null } })) continue;
    await prisma.holiday.create({ data: { date: d, name: String(h.keterangan ?? 'Hari libur') } });
    count('hari_libur');
  }
  for (const sc of legacy.schedules) {
    const eid = empId.get(Number(sc.employee_id));
    if (!eid || !isValidDate(str(sc.tanggal))) continue;
    const sid = sc.shift_id != null ? scheduleId.get(Number(sc.shift_id)) ?? null : null;
    await prisma.employeeScheduleAssignment.create({ data: { employeeId: eid, scheduleId: sid, kind: 'SEMENTARA', startDate: toDbDate(String(sc.tanggal)), endDate: toDbDate(String(sc.tanggal)), note: 'Perubahan harian' } });
    count('jadwal_harian');
  }

  // --- Perangkat dan log mesin ----------------------------------------------------------------
  const devId = new Map<number, { id: string; key: string }>();
  for (const d of legacy.devices) {
    const usb = String(d.koneksi) === 'usb' || String(d.tipe).toLowerCase() === 'p280';
    const secret = str(d.comm_key);
    const nd = await prisma.attendanceDevice.create({
      data: {
        name: String(d.nama), vendor: 'Solution', model: String(d.tipe).toUpperCase(), adapter: usb ? 'FILE_IMPORT' : 'SOLUTION_SOAP', connection: usb ? 'USB' : 'LAN',
        host: usb ? null : str(d.ip), port: usb ? null : Number(d.port) || 80, secretEnc: !usb && secret && secret !== '0' ? encrypt(secret) : null,
        location: str(d.lokasi), syncIntervalMinutes: usb ? 0 : Number(d.auto_sync_menit) || 0,
      },
    });
    devId.set(Number(d.id), { id: nd.id, key: nd.serialNumber || nd.id });
    count('perangkat');
  }
  for (const u of legacy.fpUsers) {
    const pin = cleanPin(u.pin);
    if (!pin) continue;
    const dev = u.device_id != null ? devId.get(Number(u.device_id)) : undefined;
    await prisma.deviceUser.create({ data: { deviceId: dev?.id ?? null, pin, name: str(u.nama), department: str(u.departemen) } }).catch(() => undefined);
  }
  const s = await getSettings();
  const tolMs = Number(s['rules.clockSkewToleranceMinutes']) * 60_000;
  const logKeys = new Set<string>();
  const batch: Prisma.DeviceRawEventCreateManyInput[] = [];
  for (const l of legacy.logs) {
    const pin = cleanPin(l.pin);
    const local = normDateTime(l.waktu);
    if (!pin || !local) { warn(`Log mesin tidak valid dilewati: PIN ${String(l.pin)} ${String(l.waktu)}`); continue; }
    const dev = l.device_id != null ? devId.get(Number(l.device_id)) : undefined;
    const at = zonedToUtc(local.slice(0, 10), local.slice(11), tz);
    logKeys.add(`${pin}|${local}`);
    batch.push({
      deviceId: dev?.id ?? null, devicePin: pin, deviceTime: at, receivedAt: l.imported_at ? zonedToUtc(String(l.imported_at).slice(0, 10), String(l.imported_at).slice(11, 19) || '00:00:00', tz) : new Date(),
      verifyMode: str(l.verify), statusCode: str(l.status_code), payload: { sumber: str(l.sumber), migrasi: true },
      idempotencyKey: rawKey(dev?.key ?? 'berkas', pin, local), clockSkewSuspect: at.getTime() > Date.now() + tolMs,
    });
  }
  for (let i = 0; i < batch.length; i += 2000) {
    const r = await prisma.deviceRawEvent.createMany({ data: batch.slice(i, i + 2000), skipDuplicates: true });
    count('log_mesin', r.count);
  }

  // --- Transaksi absensi lama -----------------------------------------------------------------
  const METHOD: Record<string, string> = { wajah: 'FACE_SELF', dinas_luar: 'FIELD_DUTY', manual: 'MANUAL', klarifikasi: 'MANUAL', fingerprint: 'MANUAL' };
  const pinOf = new Map(legacy.employees.map((e) => [Number(e.id), cleanPin(e.id_mesin)]));
  let minDate = '9999-12-31';
  let maxDate = '0000-01-01';
  const statusDays: { employeeId: string; date: string; status: string | null; dispensation: boolean; note: string | null }[] = [];
  for (const a of legacy.attendance) {
    const eid = empId.get(Number(a.employee_id));
    const date = String(a.tanggal);
    if (!eid || !isValidDate(date)) continue;
    if (date < minDate) minDate = date;
    if (date > maxDate) maxDate = date;
    for (const dir of ['masuk', 'pulang'] as const) {
      const t = splitLocal(a[`jam_${dir}`], date);
      if (!t) continue;
      const m = String(a[`metode_${dir}`] ?? 'manual');
      // Scan mesin yang log mentahnya ikut dimigrasi tidak dibuat ulang sebagai transaksi.
      if (m === 'fingerprint' && logKeys.has(`${pinOf.get(Number(a.employee_id))}|${t.date} ${t.time}`)) continue;
      let photoPath: string | null = null;
      const foto = str(a[`foto_${dir}`]);
      if (foto && opt.uploads) {
        const buf = await readFile(path.join(opt.uploads, path.basename(foto))).catch(() => null);
        if (buf && sniff(buf) === 'jpg') photoPath = await saveFile(`foto/${date.slice(0, 7)}`, buf, 'jpg');
        else warn(`Foto ${foto} tidak ditemukan.`);
      } else if (foto) count('foto_tidak_disalin');
      const ev = await prisma.attendanceEvent.create({
        data: {
          employeeId: eid, direction: dir === 'masuk' ? 'IN' : 'OUT', workDate: toDbDate(date), method: METHOD[m] ?? 'MANUAL',
          occurredAt: zonedToUtc(t.date, t.time, tz), idempotencyKey: `migrasi:${a.id}:${dir}`,
          latitude: a[`lat_${dir}`] != null ? Number(a[`lat_${dir}`]) : null, longitude: a[`lng_${dir}`] != null ? Number(a[`lng_${dir}`]) : null,
          address: str(a[`alamat_${dir}`]), photoPath, note: `Migrasi dari sistem lama (metode: ${m})`,
        },
      });
      await prisma.attendanceVerification.create({ data: { eventId: ev.id, outcome: 'SUCCESS', matcher: 'migrasi', message: 'Dimigrasikan dari sistem lama' } });
      count('transaksi_absensi');
    }
    const st = String(a.status ?? 'hadir');
    const fixed: Record<string, string> = { izin: 'IZIN', sakit: 'SAKIT', cuti: 'CUTI', dinas_luar: 'DINAS_LUAR', alpa: 'TIDAK_HADIR' };
    if (fixed[st] || Number(a.dispensasi)) statusDays.push({ employeeId: eid, date, status: fixed[st] ?? null, dispensation: !!Number(a.dispensasi), note: str(a.keterangan) });
  }

  // --- Klarifikasi -> koreksi -----------------------------------------------------------------
  const KIND: Record<string, [string, string | null]> = {
    lupa_absen_masuk: ['LUPA_MASUK', null], lupa_absen_pulang: ['LUPA_PULANG', null], lupa_absen: ['LUPA_KEDUANYA', null], terlambat: ['TERLAMBAT', null],
    pulang_cepat: ['PULANG_CEPAT', null], izin: ['LAINNYA', 'IZIN'], sakit: ['LAINNYA', 'SAKIT'], cuti: ['LAINNYA', 'CUTI'], dinas_luar: ['LAINNYA', 'DINAS_LUAR'], lainnya: ['LAINNYA', null],
  };
  const STATUS: Record<string, 'PENDING' | 'APPROVED' | 'REJECTED'> = { menunggu: 'PENDING', disetujui: 'APPROVED', ditolak: 'REJECTED' };
  const explained = new Set<string>();
  for (const c of legacy.clarifications) {
    const eid = empId.get(Number(c.employee_id));
    const date = String(c.tanggal);
    if (!eid || !isValidDate(date)) continue;
    const [kind, proposedStatus] = KIND[String(c.jenis)] ?? ['LAINNYA', null];
    const status = STATUS[String(c.status)] ?? 'PENDING';
    let attachmentPath: string | null = null;
    if (str(c.lampiran) && opt.uploads) {
      const buf = await readFile(path.join(opt.uploads, path.basename(String(c.lampiran)))).catch(() => null);
      const ext = buf && sniff(buf);
      if (buf && ext && ['jpg', 'png', 'pdf'].includes(ext)) attachmentPath = await saveFile(`lampiran/${date.slice(0, 7)}`, buf, ext);
    }
    const created = c.created_at ? new Date(String(c.created_at).replace(' ', 'T')) : new Date();
    await prisma.attendanceCorrection.create({
      data: {
        employeeId: eid, workDate: toDbDate(date), kind, proposedStatus,
        proposedCheckIn: str(c.jam_masuk_usulan)?.slice(0, 5) ?? null, proposedCheckOut: str(c.jam_pulang_usulan)?.slice(0, 5) ?? null,
        reason: String(c.alasan ?? '-'), attachmentPath, status, requestedById: userOfEmp.get(eid) ?? fallbackAdmin.id,
        reviewedById: c.reviewed_by != null ? userId.get(Number(c.reviewed_by)) ?? null : null,
        reviewedAt: c.reviewed_at ? new Date(String(c.reviewed_at).replace(' ', 'T')) : status === 'PENDING' ? null : created,
        reviewNote: str(c.catatan_admin), createdAt: created,
      },
    });
    if (status === 'APPROVED' && proposedStatus) explained.add(`${eid}|${date}`);
    count(`koreksi_${status.toLowerCase()}`);
  }
  // Status tetap/dispensasi lama yang tidak berasal dari klarifikasi -> koreksi admin tercatat.
  for (const d of statusDays) {
    if (explained.has(`${d.employeeId}|${d.date}`) && !d.dispensation) continue;
    await prisma.attendanceCorrection.create({
      data: {
        employeeId: d.employeeId, workDate: toDbDate(d.date), kind: 'KOREKSI_ADMIN', proposedStatus: d.status, dispensation: d.dispensation,
        reason: `Status dari sistem lama (migrasi)${d.note ? `: ${d.note}` : ''}`, status: 'APPROVED', requestedById: fallbackAdmin.id, reviewedById: fallbackAdmin.id,
        reviewedAt: new Date(), reviewNote: 'Dipertahankan saat migrasi',
      },
    });
    count('koreksi_status_lama');
  }

  // --- Proses log mesin dan susun ulang rekap -------------------------------------------------
  for (let guard = 0; guard < 100; guard++) {
    const r = await processPendingRawEvents();
    if (!r.processed) {
      if (r.unmatchedPins.length) warn(`ID mesin belum terpetakan ke pegawai: ${r.unmatchedPins.slice(0, 30).join(', ')}. Petakan di Perangkat, Status Sinkronisasi.`);
      break;
    }
  }
  if (minDate <= maxDate) {
    const r = await rebuildActive(null, addDays(minDate, -1), maxDate < today ? maxDate : today);
    count('pegawai_direkap', r.employees);
  }
  await prisma.systemSetting.create({ data: { key: 'migration.sqlite', value: { at: new Date().toISOString(), source: path.basename(file), fingerprint: sha256(String((await stat(file)).size)) } } });
  await prisma.auditLog.create({ data: { actorLabel: 'migrasi', action: 'migration.sqlite', meta: { counts: report.counts, warnings: report.warnings.length } } });

  const out = path.resolve('storage', 'migrasi', `laporan-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.counts, null, 2));
  if (report.warnings.length) console.log(`\n${report.warnings.length} peringatan. Rincian: ${out}`);
  console.log(`\nLaporan: ${out}`);
}

main()
  .catch((e) => { console.error(`Migrasi gagal: ${(e as Error).message}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
