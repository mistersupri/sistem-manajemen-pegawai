// Dijalankan sekali saat server Next.js mulai. Menjalankan penjadwal di dalam proses:
// tarik data perangkat otomatis (tiap menit dicek) dan pembersihan foto sesuai retensi (tiap jam).
// Untuk beberapa instance aplikasi, set DISABLE_SCHEDULER=1 di semua kecuali satu instance.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.DISABLE_SCHEDULER === '1') return;
  const { startScheduler } = await import('./lib/scheduler');
  startScheduler();
}
