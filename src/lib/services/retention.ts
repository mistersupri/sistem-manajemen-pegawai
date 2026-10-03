import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db';
import { env } from '../env';
import { log } from '../logger';
import { getSettings } from '../settings';

/**
 * Hapus berkas foto absensi (storage/foto) yang melewati masa retensi. Baris transaksi tetap ada
 * (immutable) dan path-nya tetap tercatat sebagai jejak; hanya berkasnya yang dihapus.
 * Penghapusan dicatat di audit log hanya bila ada berkas yang benar-benar terhapus.
 */
export async function purgeExpiredPhotos() {
  const days = (await getSettings())['privacy.photoRetentionDays'];
  if (!days) return { removed: 0 };
  const cutoff = Date.now() - Number(days) * 86400_000;
  const base = path.resolve(env().STORAGE_DIR, 'foto');
  let removed = 0;
  const months = await readdir(base).catch(() => [] as string[]);
  for (const m of months) {
    const dir = path.join(base, m);
    const files = await readdir(dir).catch(() => [] as string[]);
    for (const f of files) {
      const full = path.join(dir, f);
      const st = await stat(full).catch(() => null);
      if (!st?.isFile() || st.mtimeMs >= cutoff) continue;
      await rm(full, { force: true });
      removed++;
    }
  }
  if (removed) {
    await prisma.auditLog.create({ data: { actorLabel: 'sistem', action: 'privacy.photo_purge', meta: { removed, olderThanDays: days } } });
    log.info('Foto melewati retensi dihapus', { removed });
  }
  return { removed };
}
