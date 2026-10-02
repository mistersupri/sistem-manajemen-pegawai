import Link from 'next/link';
import { Check, ChevronRight, FilePen, MapPin, Plane, ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dayline } from '@/components/app/dayline';
import { StatusBadge } from '@/components/app/status-badge';
import { cn } from '@/lib/utils';

// Keadaan contoh yang paling informatif: sudah absen masuk (terlambat), belum pulang, pukul 12.42.
export const DAY = {
  schedule: { name: 'Reguler', checkIn: '07:30', checkOut: '16:00', tolerance: 5 },
  checkIn: '07:42', checkOut: null as string | null, lateMinutes: 12, now: '12:42', next: 'Absen pulang',
};

const OTHER = [
  { href: '/dinas-luar', label: 'Absen dinas luar', icon: MapPin },
  { href: '/absensi/koreksi/baru', label: 'Ajukan koreksi', icon: FilePen },
  { href: '/cuti/baru', label: 'Ajukan cuti atau izin', icon: Plane },
];

function OtherActions({ className }: { className?: string }) {
  return (
    <nav aria-label="Aksi lain" className={cn('grid border-t sm:grid-cols-3', className)}>
      {OTHER.map((a) => (
        <Link key={a.href} href={a.href} className="flex min-h-12 items-center gap-3 border-b px-4 text-sm font-medium last:border-b-0 hover:bg-accent/50 sm:justify-center sm:border-r sm:border-b-0 sm:last:border-r-0">
          <a.icon className="size-4 text-primary" aria-hidden />{a.label}<ChevronRight className="ml-auto size-4 text-muted-foreground sm:hidden" aria-hidden />
        </Link>
      ))}
    </nav>
  );
}

/** Jam besar: dua angka jam sebagai elemen utama, garis hari di bawahnya (rancangan saat ini). */
export function BigClock() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="grid gap-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-base font-semibold">Absensi hari ini</h2>
          <p className="text-sm text-muted-foreground">{DAY.schedule.name}, {DAY.schedule.checkIn} sampai {DAY.schedule.checkOut}</p>
        </div>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-muted-foreground">Masuk</dt>
            <dd className="clock mt-1 text-[2.75rem]">{DAY.checkIn}</dd>
            <dd className="mt-1 text-sm font-medium text-[#b4501f]">Terlambat {DAY.lateMinutes} menit</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Pulang</dt>
            <dd className="clock mt-1 text-[2.75rem] text-muted-foreground">--:--</dd>
          </div>
        </dl>
        <div>
          <Dayline scheduleIn={DAY.schedule.checkIn} scheduleOut={DAY.schedule.checkOut} checkIn={DAY.checkIn} late now={DAY.now} />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular" aria-hidden><span>05.00</span><span>13.30</span><span>22.00</span></div>
        </div>
        <p className="flex items-center gap-2 text-sm">Status <StatusBadge status="TERLAMBAT" /><span className="text-muted-foreground">toleransi terlambat {DAY.schedule.tolerance} menit</span></p>
        <Button asChild size="lg" variant="highlight" className="h-14 w-full text-base font-semibold"><Link href="/absensi/saya"><ScanFace className="size-5" />{DAY.next}</Link></Button>
      </div>
      <OtherActions />
    </Card>
  );
}

/** Linimasa: hari kerja dibaca sebagai urutan langkah; aksi berikutnya berada tepat di langkah yang belum selesai. */
export function Timeline() {
  const steps = [
    { key: 'jadwal', time: DAY.schedule.checkIn, title: 'Jadwal masuk', note: `${DAY.schedule.name}, toleransi ${DAY.schedule.tolerance} menit`, state: 'done' as const },
    { key: 'masuk', time: DAY.checkIn, title: 'Absen masuk tercatat', note: `Terlambat ${DAY.lateMinutes} menit`, state: 'warn' as const },
    { key: 'pulang', time: DAY.schedule.checkOut, title: 'Absen pulang', note: 'Bisa dilakukan mulai pukul 16.00, atau lebih awal dengan keterangan', state: 'next' as const },
  ];
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="grid gap-4 p-4 sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-semibold">Absensi hari ini</h2>
          <span className="clock text-lg text-muted-foreground" aria-label={`Sekarang pukul ${DAY.now}`}>{DAY.now}</span>
        </div>
        <ol className="grid">
          {steps.map((s, i) => (
            <li key={s.key} className="grid grid-cols-[3.5rem_1.5rem_1fr] gap-x-3">
              <span className={cn('clock pt-0.5 text-right text-base', s.state === 'next' && 'text-muted-foreground')}>{s.time}</span>
              <span className="relative flex justify-center" aria-hidden>
                <span className={cn('mt-1.5 size-3 rounded-full border-2', s.state === 'done' && 'border-primary bg-primary', s.state === 'warn' && 'border-[#eb6834] bg-[#eb6834]', s.state === 'next' && 'border-highlight bg-card')} />
                {i < steps.length - 1 && <span className="absolute top-5 bottom-0 w-px bg-border" />}
              </span>
              <div className={cn('pb-5', i === steps.length - 1 && 'pb-0')}>
                <p className="font-medium">{s.title}</p>
                <p className={cn('text-sm', s.state === 'warn' ? 'font-medium text-[#b4501f]' : 'text-muted-foreground')}>{s.note}</p>
                {s.state === 'next' && (
                  <Button asChild size="lg" variant="highlight" className="mt-3 h-12 w-full text-base font-semibold sm:w-auto"><Link href="/absensi/saya"><ScanFace className="size-5" />{DAY.next}</Link></Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <OtherActions />
    </Card>
  );
}

/** Satu aksi: tombol untuk langkah berikutnya jadi fokus; fakta hari ini diringkas jadi satu kalimat dan dua baris kecil. */
export function OneAction() {
  return (
    <div className="grid gap-4">
      <Card className="gap-0 overflow-hidden bg-navy py-0 text-white">
        <div className="grid gap-4 p-5 sm:p-6">
          <p className="text-sm text-white/80">Langkah berikutnya</p>
          <p className="text-2xl font-bold">Absen pulang mulai pukul 16.00</p>
          <p className="text-sm text-white/80">Masuk tercatat {DAY.checkIn}, terlambat {DAY.lateMinutes} menit. Jadwal {DAY.schedule.name.toLowerCase()} {DAY.schedule.checkIn} sampai {DAY.schedule.checkOut}.</p>
          <Button asChild size="lg" variant="highlight" className="h-16 w-full text-lg font-semibold"><Link href="/absensi/saya"><ScanFace className="size-6" />{DAY.next}</Link></Button>
        </div>
      </Card>
      <Card className="gap-0 py-0">
        <dl className="divide-y text-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3"><dt className="flex items-center gap-2"><Check className="size-4 text-primary" aria-hidden />Masuk</dt><dd className="tabular font-semibold">{DAY.checkIn} <span className="font-medium text-[#b4501f]">(+{DAY.lateMinutes} mnt)</span></dd></div>
          <div className="flex items-center justify-between gap-3 px-4 py-3"><dt className="flex items-center gap-2"><span className="size-4" aria-hidden />Pulang</dt><dd className="tabular text-muted-foreground">belum</dd></div>
        </dl>
        <OtherActions />
      </Card>
    </div>
  );
}
