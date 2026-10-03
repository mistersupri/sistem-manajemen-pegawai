import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldDuty } from '@/components/app/field-duty';
import { InvalidStation } from '../invalid';
import { loadStation, stationMetadata } from '../station';

export const metadata = { title: 'Absen dinas luar', ...stationMetadata };

export default async function StationFieldDutyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { station, s, logo } = await loadStation(token);
  if (!station || !station.allowFieldDuty) return <InvalidStation org={s['org.name']} />;
  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 lg:px-6">
          {logo && <img src={logo} alt="" className="h-10 object-contain" />}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold">Absen dinas luar</h1>
            <p className="truncate text-sm text-muted-foreground">{s['org.name']}, {station.name}</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link href={`/absen/${token}`}><ArrowLeft />Absen wajah</Link></Button>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">Ambil selfie di lokasi tugas. Wajah dikenali otomatis; foto diberi stempel jam server, koordinat GPS, dan keterangan. Tidak perlu masuk akun.</p>
        {!s['methods.fieldDuty']
          ? <p className="rounded-xl border bg-card p-6">Absen dinas luar sedang dinonaktifkan.</p>
          : <FieldDuty org={s['org.name']} storePhoto={!!s['privacy.storeFieldDutyPhotos']} geocode={!!s['geo.reverseGeocode']} endpoint={`/api/v1/absen/${token}/dinas-luar`} />}
      </div>
    </main>
  );
}
