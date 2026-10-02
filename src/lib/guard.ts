import { redirect, notFound } from 'next/navigation';
import { getActor } from './auth/session';
import { can, canAny, type Actor } from './auth/actor';
import type { Permission } from './auth/catalog';
import { getSettings } from './settings';
import { ADMIN_ROLE_CODES } from './auth/catalog';

/** Untuk halaman server: wajib login; opsional wajib salah satu izin (selain itu 404). */
export async function requirePage(perms?: Permission[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect('/login');
  if (perms && perms.length && !canAny(actor, perms)) notFound();
  return actor;
}

/** Apakah pengguna wajib menyelesaikan langkah akun (ganti password / pasang MFA) dulu. */
export async function pendingAccountStep(actor: Actor) {
  if (actor.mustChangePassword) return 'password';
  const s = await getSettings();
  if (s['security.mfaRequiredForAdmins'] && !actor.mfaEnabled && actor.roleCodes.some((r) => ADMIN_ROLE_CODES.includes(r))) return 'mfa';
  return null;
}

export { can, canAny };
