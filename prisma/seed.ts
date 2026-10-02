// Seed SIMPEG.
// - Selalu: sinkronisasi izin & peran bawaan, dan akun Super Admin pertama bila belum ada pengguna.
// - SEED_DEMO=1: data DEMO fiktif (ditandai "(demo)") untuk pengembangan. Jangan dipakai di produksi.
import 'dotenv/config';
import { prisma } from '../src/lib/db';
import { syncRbac } from '../src/lib/auth/sync';
import { systemActor } from '../src/lib/auth/system';
import { hashPassword } from '../src/lib/auth/password';
import { addDays, todayIn, toDbDate } from '../src/lib/time';
import { createSchedule, createAssignment, createHoliday } from '../src/lib/services/schedules';
import { createEmployee } from '../src/lib/services/employees';
import { saveLeaveType, generateBalances } from '../src/lib/services/leave';
import { runSync } from '../src/lib/services/devices';
import { rebuildRange } from '../src/lib/attendance/record';

const DEMO_PASSWORD = 'Demo#2026';

async function bootstrapAdmin() {
  if (await prisma.user.count()) return;
  const username = (process.env.ADMIN_USERNAME || 'superadmin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || (process.env.SEED_DEMO === '1' ? DEMO_PASSWORD : '');
  if (!password) throw new Error('Set ADMIN_PASSWORD untuk membuat akun Super Admin pertama.');
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
  await prisma.user.create({
    data: { username, passwordHash: await hashPassword(password), mustChangePassword: process.env.SEED_DEMO !== '1', roles: { create: { roleId: role.id } } },
  });
  console.log(`Akun Super Admin dibuat: ${username}${process.env.SEED_DEMO === '1' ? ` / ${DEMO_PASSWORD} (demo)` : ' (password dari ADMIN_PASSWORD, wajib diganti saat masuk pertama)'}`);
}

async function demo() {
  if (await prisma.organizationUnit.findUnique({ where: { code: 'DEMO' } })) {
    console.log('Data demo sudah ada, dilewati.');
    return;
  }
  const actor = systemActor('seed-demo');
  await prisma.systemSetting.upsert({ where: { key: 'org.name' }, update: {}, create: { key: 'org.name', value: 'Instansi Demo' } });

  // Unit kerja (demo)
  const root = await prisma.organizationUnit.create({ data: { code: 'DEMO', name: 'Dinas Demo (demo)' } });
  const sek = await prisma.organizationUnit.create({ data: { code: 'DEMO-SEK', name: 'Sekretariat (demo)', parentId: root.id } });
  const bidA = await prisma.organizationUnit.create({ data: { code: 'DEMO-BA', name: 'Bidang A (demo)', parentId: root.id } });
  const bidB = await prisma.organizationUnit.create({ data: { code: 'DEMO-BB', name: 'Bidang B (demo)', parentId: root.id } });

  // Jadwal (contoh, sesuaikan dengan aturan instansi)
  const reg = await createSchedule(actor, { code: 'REG', name: 'Reguler (contoh)', kind: 'REGULER', checkIn: '07:30', checkOut: '16:00', breakStart: '12:00', breakEnd: '13:00', lateToleranceMin: 15, earlyLeaveToleranceMin: 0, workdays: [1, 2, 3, 4, 5], color: '#1a3a8f' });
  await createSchedule(actor, { code: 'PAGI', name: 'Shift Pagi (contoh)', kind: 'SHIFT', checkIn: '06:00', checkOut: '14:00', lateToleranceMin: 10, earlyLeaveToleranceMin: 0, workdays: [0, 1, 2, 3, 4, 5, 6], color: '#2f855a' });
  await createSchedule(actor, { code: 'MALAM', name: 'Shift Malam (contoh)', kind: 'SHIFT', checkIn: '22:00', checkOut: '06:00', lateToleranceMin: 10, earlyLeaveToleranceMin: 0, workdays: [0, 1, 2, 3, 4, 5, 6], color: '#0c1a45' });
  const tz = 'Asia/Jakarta';
  const today = todayIn(tz);
  const start = addDays(today, -60);
  await createAssignment(actor, { scheduleId: reg.id, unitId: root.id, kind: 'TETAP', startDate: start, endDate: null, note: 'Jadwal bawaan unit (demo)' });
  await createHoliday(actor, { date: addDays(today, 10), name: 'Hari libur contoh (demo)' });

  // Pegawai (fiktif)
  const people: [string, string, string, string, string, string][] = [
    ['900000000000000001', 'Rina Kusuma (demo)', 'Kepala Dinas (demo)', 'PNS', 'IV/b', root.id],
    ['900000000000000002', 'Budi Santoso (demo)', 'Sekretaris (demo)', 'PNS', 'IV/a', sek.id],
    ['900000000000000003', 'Sari Wulandari (demo)', 'Analis Kepegawaian (demo)', 'PNS', 'III/c', sek.id],
    ['900000000000000004', 'Dedi Hartono (demo)', 'Kepala Bidang A (demo)', 'PNS', 'IV/a', bidA.id],
    ['900000000000000005', 'Maya Lestari (demo)', 'Staf Bidang A (demo)', 'PPPK', 'IX', bidA.id],
    ['900000000000000006', 'Agus Firmansyah (demo)', 'Staf Bidang A (demo)', 'PNS', 'III/a', bidA.id],
    ['900000000000000007', 'Lina Marlina (demo)', 'Kepala Bidang B (demo)', 'PNS', 'IV/a', bidB.id],
    ['900000000000000008', 'Hendra Wijaya (demo)', 'Staf Bidang B (demo)', 'Honorer', '', bidB.id],
    ['900000000000000009', 'Fitri Handayani (demo)', 'Staf Bidang B (demo)', 'PPPK', 'IX', bidB.id],
    ['900000000000000010', 'Yusuf Ramadhan (demo)', 'Petugas Keamanan (demo)', 'Honorer', '', sek.id],
  ];
  const ids: Record<string, string> = {};
  for (const [nip, name, position, status, rank, unitId] of people) {
    const pin = String(Number(nip.slice(-3)) + 100);
    const r = await createEmployee(actor, { employeeNumber: nip, fullName: name, position, employmentStatus: status, rank: rank || null, unitId, startDate: start, machinePin: pin, email: null }, { createAccount: false });
    ids[nip] = r.employee.id;
  }
  // Atasan langsung
  const sup = (nip: string, supNip: string) => prisma.employee.update({ where: { id: ids[nip] }, data: { supervisorId: ids[supNip] } });
  await sup('900000000000000002', '900000000000000001');
  await sup('900000000000000003', '900000000000000002');
  await sup('900000000000000010', '900000000000000002');
  await sup('900000000000000004', '900000000000000001');
  await sup('900000000000000005', '900000000000000004');
  await sup('900000000000000006', '900000000000000004');
  await sup('900000000000000007', '900000000000000001');
  await sup('900000000000000008', '900000000000000007');
  await sup('900000000000000009', '900000000000000007');
  // Satpam memakai shift malam (penugasan pegawai, contoh)
  const malam = await prisma.workSchedule.findUniqueOrThrow({ where: { code: 'MALAM' } });
  await createAssignment(actor, { scheduleId: malam.id, employeeId: ids['900000000000000010'], kind: 'TETAP', startDate: start, endDate: null, note: 'Shift malam (demo)' });

  // Akun demo untuk setiap peran
  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  const account = async (username: string, employeeNip: string | null, assignments: [string, string | null][]) => {
    await prisma.user.create({
      data: {
        username, passwordHash: await hashPassword(DEMO_PASSWORD), employeeId: employeeNip ? ids[employeeNip] : null,
        roles: { create: assignments.map(([code, unitId]) => ({ roleId: roles[code], unitId })) },
      },
    });
  };
  await account('kepegawaian', '900000000000000003', [['ADMIN_KEPEGAWAIAN', null], ['PEGAWAI', null]]);
  await account('admin.it', null, [['ADMIN_IT', null]]);
  await account('pimpinan', '900000000000000001', [['PIMPINAN', null], ['PEGAWAI', null]]);
  await account('kabid.a', '900000000000000004', [['PIMPINAN', bidA.id], ['PEGAWAI', null]]);
  await account('operator.b', '900000000000000008', [['OPERATOR_UNIT', bidB.id], ['PEGAWAI', null]]);
  await account('pegawai', '900000000000000005', [['PEGAWAI', null]]);
  await account('auditor', null, [['AUDITOR', null]]);

  // Jenis cuti/izin (contoh; aturan dan kuota harus ditetapkan instansi)
  await saveLeaveType(actor, null, { code: 'CT', name: 'Cuti tahunan (contoh)', attendanceStatus: 'CUTI', usesBalance: true, defaultAnnualQuota: 12, eligibleEmploymentStatuses: ['PNS', 'PPPK'], maxDaysPerRequest: 12, minNoticeDays: 0, approvalLevels: 2, countWorkdaysOnly: true, allowAttachment: false });
  await saveLeaveType(actor, null, { code: 'IZ', name: 'Izin (contoh)', attendanceStatus: 'IZIN', usesBalance: false, eligibleEmploymentStatuses: [], maxDaysPerRequest: 3, minNoticeDays: 0, approvalLevels: 1, countWorkdaysOnly: true, allowAttachment: true });
  await saveLeaveType(actor, null, { code: 'SK', name: 'Sakit (contoh)', attendanceStatus: 'SAKIT', usesBalance: false, eligibleEmploymentStatuses: [], minNoticeDays: 0, approvalLevels: 1, countWorkdaysOnly: true, allowAttachment: true });
  await saveLeaveType(actor, null, { code: 'DL', name: 'Dinas luar (contoh)', attendanceStatus: 'DINAS_LUAR', usesBalance: false, eligibleEmploymentStatuses: [], minNoticeDays: 0, approvalLevels: 1, countWorkdaysOnly: true, allowAttachment: true });
  await generateBalances(actor, Number(today.slice(0, 4)));

  // Mesin simulasi + transaksi contoh
  const device = await prisma.attendanceDevice.create({
    data: { name: 'Mesin simulasi lobi (demo)', vendor: 'Simulasi', model: 'MOCK', adapter: 'MOCK', connection: 'API', host: 'mock://lobi', location: 'Lobi (demo)', syncIntervalMinutes: 0 },
  });
  await runSync(device.id, 'MANUAL', null, { fromCursor: `${addDays(today, -14)} 00:00:00` });
  await prisma.attendanceDevice.create({ data: { name: 'Mesin simulasi offline (demo)', vendor: 'Simulasi', model: 'MOCK', adapter: 'MOCK', connection: 'API', host: 'mock://gagal', location: 'Gudang (demo)' } });

  // Pengajuan cuti contoh: satu disetujui, satu menunggu atasan
  const ct = await prisma.leaveType.findUniqueOrThrow({ where: { code: 'CT' } });
  const iz = await prisma.leaveType.findUniqueOrThrow({ where: { code: 'IZ' } });
  const users = Object.fromEntries((await prisma.user.findMany({ select: { id: true, employeeId: true } })).filter((u) => u.employeeId).map((u) => [u.employeeId!, u.id]));
  const lv = await prisma.leaveRequest.create({
    data: {
      employeeId: ids['900000000000000006'], leaveTypeId: iz.id, startDate: toDbDate(addDays(today, -3)), endDate: toDbDate(addDays(today, -3)), days: 1,
      reason: 'Keperluan keluarga (demo)', status: 'APPROVED', requestedById: users[ids['900000000000000004']] ?? (await prisma.user.findFirstOrThrow()).id,
      approvals: { create: [{ level: 1, approverKind: 'ATASAN', decision: 'APPROVED', decidedAt: new Date(), note: 'Disetujui (demo)' }] },
    },
  });
  await rebuildRange([lv.employeeId], addDays(today, -3), addDays(today, -3));
  await prisma.leaveRequest.create({
    data: {
      employeeId: ids['900000000000000005'], leaveTypeId: ct.id, startDate: toDbDate(addDays(today, 7)), endDate: toDbDate(addDays(today, 8)), days: 2,
      reason: 'Acara keluarga (demo)', requestedById: users[ids['900000000000000005']],
      approvals: { create: [{ level: 1, approverKind: 'ATASAN', approverUserId: users[ids['900000000000000004']] ?? null }, { level: 2, approverKind: 'ADMIN_KEPEGAWAIAN' }] },
    },
  });
  console.log(`Data demo dibuat. Akun demo (password ${DEMO_PASSWORD}): superadmin, kepegawaian, admin.it, pimpinan, kabid.a, operator.b, pegawai, auditor.`);
}

async function main() {
  await syncRbac();
  await bootstrapAdmin();
  if (process.env.SEED_DEMO === '1') await demo();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
