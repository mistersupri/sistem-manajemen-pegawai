// Atur ulang akun Super Admin dari .env: buat bila belum ada, atau ganti password, buka kunci,
// aktifkan, dan pastikan berperan Super Admin. Semua sesi akun itu diakhiri.
//
//   npm run admin:reset                       pakai ADMIN_USERNAME dan ADMIN_PASSWORD dari .env
//   npm run admin:reset -- --username budi    username lain
//   npm run admin:reset -- --hapus-mfa        juga lepaskan MFA (mis. ponsel autentikator hilang)
//
// Tanpa ADMIN_PASSWORD, password sementara dibuat, ditampilkan sekali, dan wajib diganti saat masuk.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { prisma } from '../src/lib/db';
import { syncRbac } from '../src/lib/auth/sync';
import { ensureSuperAdmin } from '../src/lib/auth/admin-account';

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--username');
  const username = (i >= 0 ? args[i + 1] : process.env.ADMIN_USERNAME || 'superadmin').trim().toLowerCase();
  const fromEnv = process.env.ADMIN_PASSWORD || '';
  const password = fromEnv || `Sementara-${randomBytes(6).toString('base64url')}9`;
  await syncRbac();
  const r = await ensureSuperAdmin(prisma, { username, password, mustChangePassword: !fromEnv, reset: true });
  if (args.includes('--hapus-mfa')) await prisma.user.update({ where: { username }, data: { mfaEnabled: false, mfaSecretEnc: null } });
  await prisma.auditLog.create({ data: { actorLabel: 'admin:reset (CLI)', action: 'user.reset_password', entityType: 'User', meta: { username, created: r === 'created', mfaCleared: args.includes('--hapus-mfa') } } });
  console.log(`${r === 'created' ? 'Akun dibuat' : 'Akun diatur ulang'}: ${username}`);
  console.log(fromEnv ? 'Password: sesuai ADMIN_PASSWORD di .env' : `Password sementara (wajib diganti saat masuk): ${password}`);
}

main()
  .catch((err) => { console.error(`Gagal: ${(err as Error).message}`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
