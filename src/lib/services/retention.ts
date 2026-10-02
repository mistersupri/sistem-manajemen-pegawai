import { prisma } from '../db';
import { log } from '../logger';
import { getSettings } from '../settings';
import { removeStored } from '../storage';

/**
 * Hapus berkas foto absensi yang melewati masa retensi. Baris transaksi tetap ada (immutable);
 * berkasnya dihapus dan dicatat di audit. Path foto lama tetap tercatat sebagai jejak, tetapi
 * berkasnya tidak lagi tersedia.
 */
export async function purgeExpiredPhotos() {
  const days = (await getSettings())['privacy.photoRetentionDays'];
  if (!days) return { removed: 0 };
  const cutoff = new Date(Date.now() - Number(days) * 86400_000);
  const rows = await prisma.attendanceEvent.findMany({ where: { photoPath: { not: null }, occurredAt: { lt: cutoff } }, select: { id: true, photoPath: true }, take: 2000 });
  let removed = 0;
  for (const r of rows) {
    try {
      await removeStored(r.photoPath);
      removed++;
    } catch {
      // berkas sudah tidak ada
    }
  }
  if (removed) {
    await prisma.auditLog.create({ data: { actorLabel: 'sistem', action: 'privacy.photo_purge', meta: { removed, olderThanDays: days } } });
    log.info('Foto melewati retensi dihapus', { removed });
  }
  return { removed };
}
