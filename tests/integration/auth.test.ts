import { beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { mockNextHeaders, PASSWORD, seedFixture } from './helpers';

let jar: Map<string, string>;
beforeAll(async () => {
  await seedFixture();
  vi.resetModules();
  jar = mockNextHeaders();
});

const code = async (p: Promise<unknown>) => { try { await p; return 'OK'; } catch (e) { return (e as AppError).code; } };

describe('login', () => {
  it('berhasil dengan password benar dan menyimpan sesi sebagai hash', async () => {
    const { login } = await import('@/lib/services/auth');
    const r = await login('stafa.uji', PASSWORD);
    expect(r.mfaRequired).toBe(false);
    const token = jar.get('simpeg_session')!;
    expect(token).toBeTruthy();
    const sessions = await prisma.session.findMany({ where: { user: { username: 'stafa.uji' } } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).not.toBe(token);
  });

  it('pesan gagal sama untuk username tidak ada dan password salah', async () => {
    const { login } = await import('@/lib/services/auth');
    const a = await login('tidak.ada', 'x').catch((e: AppError) => e.message);
    const b = await login('stafb.uji', 'salah').catch((e: AppError) => e.message);
    expect(a).toBe(b);
  });

  it('akun dikunci sementara setelah 5 kali gagal, termasuk untuk password benar', async () => {
    const { login } = await import('@/lib/services/auth');
    for (let i = 0; i < 4; i++) expect(await code(login('kabid.uji', 'salah'))).toBe('UNAUTHENTICATED');
    expect(await code(login('kabid.uji', 'salah'))).toBe('UNAUTHENTICATED');
    expect(await code(login('kabid.uji', PASSWORD))).toBe('LOCKED');
    const fails = await prisma.auditLog.count({ where: { action: 'auth.login', result: 'FAILURE', meta: { path: ['username'], equals: 'kabid.uji' } } });
    expect(fails).toBe(6);
  });
});
