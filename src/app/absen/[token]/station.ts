import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { resolveStation } from '@/lib/services/stations';
import { unitDescendants } from '@/lib/auth/actor';

/** Data bersama halaman titik absen. */
export async function loadStation(token: string) {
  const station = await resolveStation(token);
  const s = await getSettings();
  const logo = s['org.logo'] ? `/api/v1/logo?v=${encodeURIComponent(s['org.logo'])}` : null;
  if (!station) return { station: null, s, logo, enrolled: 0 };
  const unitIds = station.unitId ? (await unitDescendants())(station.unitId) : null;
  const enrolled = await prisma.employeeBiometric.count({ where: { status: 'ACTIVE', employee: { isActive: true, deletedAt: null, ...(unitIds ? { unitId: { in: unitIds } } : {}) } } });
  return { station, s, logo, enrolled };
}

// Token ada di URL: jangan diindeks dan jangan terkirim sebagai referrer ke situs lain.
export const stationMetadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
