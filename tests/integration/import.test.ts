import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { commitImport, previewImport } from '@/lib/services/employee-import';
import { actorOf, seedFixture } from './helpers';

let f: Awaited<ReturnType<typeof seedFixture>>;
beforeAll(async () => { f = await seedFixture(); });

const csv = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(',')).join('\n'));
const HEAD = ['NIP', 'Nama lengkap', 'Email', 'Kode unit kerja', 'ID mesin absensi', 'Jenis kelamin (L/P)'];

describe('impor pegawai', () => {
  it('pratinjau memisahkan baris baru, pembaruan, dan galat tanpa menyimpan apa pun', async () => {
    const admin = await actorOf(f.users.admin.id);
    const before = await prisma.employee.count();
    const p = await previewImport(admin, csv([
      HEAD,
      ['900000000000000010', 'Pegawai Impor Satu', 'satu@contoh.go.id', 'UJI-A', '201', 'L'],
      ['900000000000000010', 'Duplikat Dalam Berkas', '', 'UJI-A', '', 'P'],
      ['900000000000000011', 'Email Salah', 'bukan-email', 'UJI-B', '', 'P'],
      ['900000000000000012', 'Unit Tidak Dikenal', '', 'TIDAK-ADA', '', 'L'],
      ['900000000000000013', 'PIN Bentrok', '', 'UJI-B', '101', 'L'],
      ['900000000000000003', 'Staf Uji B Diperbarui', '', 'UJI-B', '102', 'L'],
    ]), 'pegawai.csv');
    expect(p.summary).toMatchObject({ total: 6, baru: 1, perbarui: 1, galat: 4 });
    const byLine = Object.fromEntries(p.rows.map((r) => [r.line, r]));
    expect(byLine[3].messages.join()).toContain('NIP sama dengan baris 2');
    expect(byLine[4].messages.join()).toMatch(/email/i);
    expect(byLine[5].messages.join()).toContain('tidak dikenal');
    expect(byLine[6].messages.join()).toContain('ID mesin sudah dipakai');
    expect(await prisma.employee.count()).toBe(before);
  });

  it('commit hanya memproses baris valid', async () => {
    const admin = await actorOf(f.users.admin.id);
    const p = await previewImport(admin, csv([HEAD, ['900000000000000020', 'Pegawai Impor Dua', '', 'UJI-A', '', 'P'], ['', '', '', '', '', '']]), 'pegawai.csv');
    const r = await commitImport(admin, p.token, { updateExisting: false, createAccounts: false });
    expect(r.summary.berhasil).toBe(1);
    expect(await prisma.employee.count({ where: { employeeNumber: '900000000000000020' } })).toBe(1);
  });

  it('operator tanpa izin tulis tidak bisa impor', async () => {
    const op = await actorOf(f.users.operatorB.id);
    await expect(previewImport(op, csv([HEAD]), 'x.csv')).rejects.toMatchObject({ status: 403 });
  });
});
