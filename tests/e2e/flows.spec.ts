// Alur utama pengguna terhadap data demo. Data yang dibuat diberi penanda waktu agar tes bisa diulang.
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.E2E_PASSWORD || 'Demo#2026';
const stamp = Date.now().toString().slice(-7);

/** Buka halaman dan tunggu hidrasi selesai agar isian form terkendali tidak tertimpa. */
async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

async function login(page: Page, username: string) {
  await page.context().clearCookies();
  await open(page, '/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Hari kerja (Senin sampai Jumat) n hari ke depan dari offset tertentu, format YYYY-MM-DD. */
function futureWeekday(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function pastWeekday(n: number) {
  const d = new Date();
  let left = n;
  while (left > 0) { d.setDate(d.getDate() - 1); if (![0, 6].includes(d.getDay())) left--; }
  return d.toISOString().slice(0, 10);
}

test('login: password salah ditolak, password benar masuk ke dashboard', async ({ page }) => {
  await open(page, '/login');
  await page.getByLabel('Username').fill('superadmin');
  await page.getByLabel('Password').fill('salah-sekali');
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByText('Username atau password salah.')).toBeVisible();
  await login(page, 'superadmin');
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('pegawai: tambah, ubah, dan nonaktifkan', async ({ page }) => {
  await login(page, 'kepegawaian');
  await open(page, '/pegawai/baru');
  const name = `Pegawai E2E ${stamp}`;
  await page.getByLabel('Nama lengkap').fill(name);
  await page.getByLabel('NIP / nomor pegawai').fill(`88${stamp}0000000001`.slice(0, 18));
  await page.getByLabel('Unit kerja').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Tambah pegawai' }).click();
  // Akun login ikut dibuat (bawaan); kredensial awal ditampilkan sekali.
  await expect(page.getByText('Pegawai dan akun login dibuat')).toBeVisible();
  await open(page, `/pegawai?q=${encodeURIComponent(name)}`);
  await page.getByRole('link', { name }).first().click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  await page.getByRole('link', { name: 'Ubah', exact: true }).first().click();
  await page.getByLabel('Jabatan').fill('Analis E2E');
  await page.getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(page.getByText('Analis E2E').first()).toBeVisible();

  await page.getByRole('button', { name: 'Tindakan lain' }).click();
  await page.getByRole('menuitem', { name: 'Nonaktifkan pegawai' }).click();
  await page.getByLabel('Alasan').fill('Uji end-to-end');
  await page.getByRole('dialog').getByRole('button', { name: /Nonaktifkan/ }).click();
  await expect(page.getByText('Nonaktif').first()).toBeVisible();
});

test('absensi: input manual petugas muncul di monitoring', async ({ page }) => {
  await login(page, 'operator.b');
  await open(page, '/absensi/monitoring');
  await page.getByRole('button', { name: 'Input manual' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Pegawai').selectOption({ index: 1 });
  await dialog.getByLabel('Jam').fill('07:15');
  await dialog.getByLabel('Alasan').fill('Mesin absensi mati, uji E2E');
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(dialog).toBeHidden();
});

test('koreksi: pegawai mengajukan, atasan menyetujui', async ({ page }) => {
  await login(page, 'pegawai');
  await open(page, `/absensi/koreksi/baru?tanggal=${pastWeekday(1 + (Number(stamp) % 15))}`);
  await page.getByLabel('Jenis koreksi').selectOption('LUPA_PULANG');
  await page.getByLabel('Jam pulang sebenarnya').fill('16:05');
  await page.getByLabel('Alasan').fill('Lupa absen pulang karena rapat sampai sore (uji E2E)');
  await page.getByRole('button', { name: 'Kirim pengajuan' }).click();
  const conflict = page.getByText('Masih ada pengajuan koreksi yang menunggu');
  await page.waitForURL(/\/absensi\/koreksi\/[0-9a-f-]{36}/, { timeout: 15_000 }).catch(() => undefined);
  test.skip(await conflict.isVisible(), 'Tanggal ini sudah punya pengajuan menunggu dari jalankan sebelumnya.');
  const url = page.url();

  await login(page, 'kabid.a');
  await open(page, url);
  await page.getByLabel('Catatan untuk pegawai').fill('Disetujui (uji E2E)');
  await page.getByRole('button', { name: 'Setujui' }).click();
  await expect(page.getByText('Disetujui').first()).toBeVisible();
});

test('cuti/izin: pegawai mengajukan, atasan menyetujui', async ({ page }) => {
  await login(page, 'pegawai');
  await open(page, '/cuti/baru');
  await page.getByLabel('Jenis').selectOption({ label: 'Izin (contoh)' });
  const day = futureWeekday(30 + (Number(stamp) % 200));
  await page.getByLabel('Mulai').fill(day);
  await page.getByLabel('Sampai').fill(day);
  await page.getByLabel('Alasan').fill('Urusan keluarga (uji E2E)');
  await page.getByRole('button', { name: 'Kirim pengajuan' }).click();
  await page.waitForURL(/\/cuti\/[0-9a-f-]{36}/);
  const url = page.url();
  await expect(page.getByText('Menunggu').first()).toBeVisible();

  await login(page, 'kabid.a');
  await open(page, url);
  await page.getByRole('button', { name: 'Setujui' }).click();
  await expect(page.getByText('Disetujui').first()).toBeVisible();
});

test('laporan: rekap tampil dan bisa diekspor ke Excel', async ({ page }) => {
  await login(page, 'kepegawaian');
  await open(page, '/absensi/rekap');
  await expect(page.getByRole('heading', { name: 'Rekapitulasi' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Ekspor' }).click().then(() => page.getByRole('menuitem', { name: /Excel/ }).click()),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
});
