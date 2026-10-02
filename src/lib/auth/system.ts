import { ALL_PERMISSIONS } from './catalog';
import type { Actor } from './actor';

/** Aktor sistem untuk seed, migrasi, dan scheduler (semua izin, semua unit). */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

/** userId untuk kolom created_by (kosong bila aksi oleh sistem). */
export const realUserId = (actor: Pick<Actor, 'userId'>) => (actor.userId === SYSTEM_USER_ID ? null : actor.userId);

export function systemActor(label = 'sistem'): Actor {
  return {
    userId: SYSTEM_USER_ID,
    username: label,
    displayName: label,
    employeeId: null,
    roleCodes: ['SUPER_ADMIN'],
    mfaEnabled: true,
    mustChangePassword: false,
    sessionId: null,
    permissions: new Map(ALL_PERMISSIONS.map((p) => [p, { all: true } as const])),
  };
}
