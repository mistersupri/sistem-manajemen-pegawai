import Link from 'next/link';
import { ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { MonthStepper } from '@/components/app/month-stepper';
import { PresenceRecap } from '@/components/app/presence-recap';
import { requirePage } from '@/lib/guard';
import { getSetting } from '@/lib/settings';
import { presenceMonth } from '@/lib/services/presence';
import { BULAN, todayIn } from '@/lib/time';

export const metadata = { title: 'Rekapitulasi Presensi' };

export default async function MyPresence({ searchParams }: { searchParams: Promise<{ bulan?: string }> }) {
  const actor = await requirePage(['attendance.self']);
  if (!actor.employeeId) return <PageBody><EmptyState title="Akun tidak terhubung dengan data pegawai" description="Rekap presensi hanya untuk akun pegawai." /></PageBody>;
  const tz = await getSetting('org.timezone');
  const today = todayIn(tz);
  const sp = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.bulan ?? '') && sp.bulan! <= today.slice(0, 7) ? sp.bulan! : today.slice(0, 7);
  const data = await presenceMonth(actor.employeeId, month, today);
  const employeeId = actor.employeeId;
  return (
    <>
      <PageHeader
        title="Rekapitulasi Presensi/Absensi"
        description={`${BULAN[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}${month === today.slice(0, 7) ? ', sampai hari ini' : ''}.`}
        actions={
          <>
            <MonthStepper value={month} href="?bulan=__bulan__" max={today.slice(0, 7)} />
            <Button asChild><Link href="/absensi/saya/absen"><ScanFace />Absen sekarang</Link></Button>
          </>
        }
      />
      <PageBody>
        <PresenceRecap data={data} tz={tz}
          detailHref={(d) => `/absensi/rekap/${employeeId}/${d}`}
          correctionHref={(d) => `/absensi/koreksi/baru?tanggal=${d}`} />
      </PageBody>
    </>
  );
}
