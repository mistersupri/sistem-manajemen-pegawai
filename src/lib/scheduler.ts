import { log } from './logger';
import { runDueSyncs } from './services/devices';
import { purgeExpiredPhotos } from './services/retention';

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  const safe = (name: string, fn: () => Promise<unknown>) => () => fn().catch((err) => log.error(`Tugas terjadwal gagal: ${name}`, { err: String(err) }));
  setInterval(safe('sinkronisasi perangkat', runDueSyncs), 60_000).unref();
  setInterval(safe('retensi foto', purgeExpiredPhotos), 3600_000).unref();
  log.info('Penjadwal berjalan', { tasks: ['sinkronisasi perangkat', 'retensi foto'] });
}
