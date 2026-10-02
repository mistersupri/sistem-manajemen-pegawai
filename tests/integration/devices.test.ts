import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { reconcile, saveDevice, syncNow, publicDevice, getDeviceDetail } from '@/lib/services/devices';
import { addDays, todayIn } from '@/lib/time';
import { actorOf, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
beforeAll(async () => { f = await seedFixture(); });

const base = { vendor: 'Simulasi', adapter: 'MOCK', syncIntervalMinutes: 0, timeoutMs: 2000, maxRetries: 0 };

describe('sinkronisasi perangkat', () => {
  it('sinkronisasi ulang dan rekonsiliasi tidak menggandakan raw event', async () => {
    const su = await actorOf(f.users.superUser.id);
    const d = await saveDevice(su, null, { ...base, name: 'Mock uji', host: 'mock://uji', secret: 'rahasia-perangkat' });
    const r1 = await syncNow(su, d.id);
    expect(r1.status).toBe('SUCCESS');
    expect(r1.inserted).toBeGreaterThan(0);
    const count1 = await prisma.deviceRawEvent.count({ where: { deviceId: d.id } });
    const r2 = await syncNow(su, d.id);
    expect(r2.inserted).toBe(0);
    // Rentang yang sudah ditarik sinkronisasi pertama (mock menarik 6 hari terakhir).
    const from = addDays(todayIn('Asia/Jakarta'), -5);
    const rec = await reconcile(su, d.id, from);
    expect(rec.run.inserted).toBe(0);
    expect(rec.run.duplicates).toBeGreaterThan(0);
    expect(await prisma.deviceRawEvent.count({ where: { deviceId: d.id } })).toBe(count1);
  });

  it('scan PIN terdaftar membentuk rekap; PIN asing tetap menunggu pemetaan', async () => {
    const recs = await prisma.attendanceRecord.count({ where: { employeeId: f.stafA.id } });
    expect(recs).toBeGreaterThan(0);
    const unmatched = await prisma.deviceRawEvent.count({ where: { devicePin: '99001', employeeId: null, processedAt: null } });
    expect(unmatched).toBeGreaterThan(0);
  });

  it('perangkat offline tercatat gagal dan berstatus OFFLINE', async () => {
    const su = await actorOf(f.users.superUser.id);
    const d = await saveDevice(su, null, { ...base, name: 'Mock offline', host: 'mock://gagal' });
    await expect(syncNow(su, d.id)).rejects.toMatchObject({ status: 422 });
    const run = await prisma.deviceSyncRun.findFirstOrThrow({ where: { deviceId: d.id }, orderBy: { startedAt: 'desc' } });
    expect(run.status).toBe('FAILED');
    expect((await prisma.attendanceDevice.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('OFFLINE');
  });

  it('secret perangkat tersimpan terenkripsi dan tidak dikirim ke frontend', async () => {
    const su = await actorOf(f.users.superUser.id);
    const d = await prisma.attendanceDevice.findFirstOrThrow({ where: { name: 'Mock uji' } });
    expect(d.secretEnc).toBeTruthy();
    expect(d.secretEnc).not.toContain('rahasia-perangkat');
    const detail = JSON.stringify(await getDeviceDetail(su, d.id));
    expect(detail).not.toContain(d.secretEnc!);
    expect(detail).not.toContain('rahasia-perangkat');
    expect(JSON.stringify(publicDevice(d))).not.toContain('secretEnc');
  });

  it('kolom inti raw event tidak bisa diubah', async () => {
    const r = await prisma.deviceRawEvent.findFirstOrThrow();
    await expect(prisma.deviceRawEvent.update({ where: { id: r.id }, data: { devicePin: '1' } })).rejects.toThrow();
    await expect(prisma.deviceRawEvent.delete({ where: { id: r.id } })).rejects.toThrow();
  });
});
