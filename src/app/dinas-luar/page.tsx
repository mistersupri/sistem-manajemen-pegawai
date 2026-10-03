import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/app/empty-state';
import { FieldDuty } from '@/components/app/field-duty';
import { pendingAccountStep, requirePage } from '@/lib/guard';
import { prisma } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const metadata = { title: 'Absen dinas luar' };

/** Halaman dinas luar tanpa menu aplikasi, untuk dipasang di layar utama ponsel. */
export default async function FieldDutyStandalone() {
  const actor = await requirePage(['attendance.self'], '/dinas-luar');
  if (await pendingAccountStep(actor)) redirect('/dashboard');
  const s = await getSettings();
  const logo = s['org.logo'] ? `/api/v1/logo?v=${encodeURIComponent(s['org.logo'])}` : null;
  const [emp, face] = actor.employeeId ? await Promise.all([
    prisma.employee.findUnique({ where: { id: actor.employeeId } }),
    prisma.employeeBiometric.findFirst({ where: { employeeId: actor.employeeId, status: 'ACTIVE' }, select: { id: true } }),
  ]) : [null, null];
  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 lg:px-6">
          {logo && <img src={logo} alt="" className="h-10 object-contain" />}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold">Absen dinas luar</h1>
            <p className="truncate text-sm text-muted-foreground">{emp ? emp.fullName : s['org.name']}</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link href="/dashboard"><ArrowLeft />Beranda</Link></Button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        {!emp ? <EmptyState title="Akun tidak terhubung dengan data pegawai" description="Absen dinas luar hanya untuk akun pegawai. Minta admin kepegawaian menghubungkan akun ini ke data Anda." actions={[{ href: '/dashboard', label: 'Kembali ke beranda' }]} />
          : !s['methods.fieldDuty'] ? <EmptyState title="Absen dinas luar sedang dinonaktifkan" description="Ajukan dinas luar lewat menu Cuti & Izin, atau hubungi admin kepegawaian." actions={[{ href: '/cuti/baru', label: 'Ajukan dinas luar' }]} />
          : !face ? <EmptyState title="Wajah Anda belum terdaftar atau belum diverifikasi" description="Foto dinas luar dicocokkan dengan wajah terdaftar. Sementara itu, ajukan dinas luar lewat menu Cuti & Izin." actions={[{ href: '/absensi/saya/wajah', label: 'Daftarkan wajah', primary: true }, { href: '/cuti/baru', label: 'Ajukan dinas luar' }]} />
          : (
            <>
              <p className="mb-4 max-w-3xl text-sm text-muted-foreground">Ambil selfie di lokasi tugas. Foto diberi stempel jam server, koordinat GPS, dan keterangan. Simpan halaman ini ke layar utama ponsel agar bisa dibuka langsung.</p>
              <FieldDuty employee={{ name: emp.fullName, nip: emp.employeeNumber }} org={s['org.name']} storePhoto={!!s['privacy.storeFieldDutyPhotos']} geocode={!!s['geo.reverseGeocode']} />
            </>
          )}
      </div>
    </main>
  );
}
