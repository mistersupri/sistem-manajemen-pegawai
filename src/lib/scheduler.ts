import { log } from './logger';
import { runDueSyncs } from './services/devices';
import { purgeExpiredPhotos } from './services/retention';
import { autoSyncHolidays } from './services/holidays';
import { runAttendanceReminders, runReportReminders } from './services/reminders';
import { remindAssessors } from './services/assessment';

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  const safe = (name: string, fn: () => Promise<unknown>) => () => fn().catch((err) => log.error(`Tugas terjadwal gagal: ${name}`, { err: String(err) }));
  setInterval(safe('sinkronisasi perangkat', runDueSyncs), 60_000).unref();
  setInterval(safe('retensi foto', purgeExpiredPhotos), 3600_000).unref();
  setInterval(safe('pengingat absensi', () => runAttendanceReminders()), 60_000).unref();
  setInterval(safe('pengingat laporan', () => runReportReminders()), 5 * 60_000).unref();
  setInterval(safe('pengingat penilaian', () => remindAssessors()), 3600_000).unref();
  // Libur nasional: dicek tiap jam, ditarik paling sering sekali per 20 jam (3 jam bila gagal).
  setTimeout(safe('hari libur nasional', () => autoSyncHolidays()), 30_000).unref();
  setInterval(safe('hari libur nasional', () => autoSyncHolidays()), 3600_000).unref();
  log.info('Penjadwal berjalan', { tasks: ['sinkronisasi perangkat', 'retensi foto', 'pengingat absensi', 'pengingat laporan', 'pengingat penilaian', 'hari libur nasional'] });
}
