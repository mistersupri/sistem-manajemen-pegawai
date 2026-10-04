import Link from 'next/link';
import { CalendarCheck, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/app/empty-state';
import { CATEGORY_COLOR } from '@/components/app/attendance-colors';
import { durasi, jamDetik, statusText, type presenceMonth } from '@/lib/services/presence';
import { BULAN_PENDEK } from '@/lib/time';
import { cn } from '@/lib/utils';

type Data = Awaited<ReturnType<typeof presenceMonth>>;

const tgl = (d: string) => `${d.slice(8)} ${BULAN_PENDEK[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

/** Judul kartu bergaya e-TPP: ikon dalam kotak biru muda, judul, dan keterangan. */
function CardHead({ icon: Icon, title, description }: { icon: typeof FileText; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary" aria-hidden><Icon className="size-5" /></span>
      <div className="min-w-0">
        <h2 className="text-base leading-tight font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/** Satu kelompok rincian: kolom kategori menyatu ke bawah, jenis absensi, jumlah hari. */
function GroupTable({ group }: { group: Data['groups'][number] }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <p className="border-b bg-muted px-4 py-2.5 text-sm font-semibold sm:hidden">{group.label}</p>
      <table className="w-full text-sm">
        <thead className="bg-muted text-xs text-muted-foreground max-sm:sr-only">
          <tr>
            <th scope="col" className="w-32 px-4 py-2.5 text-left font-semibold max-sm:hidden">Kategori</th>
            <th scope="col" className="px-4 py-2.5 text-left font-semibold">Jenis Absensi</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r, i) => (
            <tr key={r.label} className="border-t first:border-t-0 sm:first:border-t">
              {i === 0 && <th scope="rowgroup" rowSpan={group.rows.length} className="border-r px-4 py-3 text-left align-top font-semibold max-sm:hidden">{group.label}</th>}
              <td className="px-4 py-2.5 whitespace-normal">{r.label}</td>
              <td className={cn('px-4 py-2.5 text-right whitespace-nowrap tabular-nums', r.days ? 'font-semibold' : 'text-muted-foreground')}>{r.days} Hari</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Rekapitulasi presensi satu pegawai untuk satu bulan (gaya e-TPP):
 * ringkasan, Detail Rekap per jenis absensi, lalu tabel harian.
 */
export function PresenceRecap({ data, tz, detailHref, correctionHref }: {
  data: Data;
  tz: string;
  detailHref?: (date: string) => string;
  correctionHref?: (date: string) => string;
}) {
  const s = data.summary;
  const tiles = [
    { label: 'Hari kerja', value: s.workdays, color: 'var(--primary)' },
    { label: 'Hadir', value: s.hadir, color: CATEGORY_COLOR.HADIR },
    { label: 'Terlambat', value: s.terlambat, color: CATEGORY_COLOR.TERLAMBAT },
    { label: 'Pulang cepat', value: s.pulangCepat, color: '#d97706' },
    { label: 'Izin, sakit, cuti', value: s.izinCuti, color: CATEGORY_COLOR.IZIN_CUTI },
    { label: 'Dinas luar', value: s.dinasLuar, color: CATEGORY_COLOR.DINAS_LUAR },
    { label: 'Alfa', value: s.alfa, color: CATEGORY_COLOR.TIDAK_HADIR },
    { label: 'Alfa awal/akhir', value: s.alfaSebagian, color: CATEGORY_COLOR.ALFA_SEBAGIAN },
  ];
  const [kehadiran, dinas, cuti] = data.groups;
  return (
    <div className="grid gap-5">
      <section aria-label="Ringkasan bulan ini" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border bg-card p-3.5">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />{t.label}</p>
            <p className="mt-1.5 text-2xl leading-none font-semibold tabular-nums">{t.value}</p>
          </div>
        ))}
      </section>

      <Card className="gap-5 p-4 sm:p-6">
        <CardHead icon={FileText} title="Detail Rekap Presensi / Absensi" description="Ringkasan jenis absensi beserta jumlah waktu yang diakumulasi." />
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="grid gap-5"><GroupTable group={kehadiran} /><GroupTable group={dinas} /></div>
          <GroupTable group={cuti} />
        </div>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-b p-4 sm:px-6"><CardHead icon={CalendarCheck} title="Rincian Harian" description="Jadwal, jam datang dan pulang, lokasi, serta keterangan setiap hari." /></div>
        {data.days.length === 0 ? <EmptyState title="Bulan ini belum berjalan" description="Rincian harian muncul mulai tanggal 1 bulan tersebut." /> : (
          <div className="overflow-x-auto">
            <table className="table-stack stack-grid presence-table w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  {['#', 'Tanggal', 'Shift Datang', 'Shift Pulang', 'Jam Datang', 'Lokasi Datang', 'Jam Pulang', 'Lokasi Pulang', 'Terlambat', 'Pulang Cepat', 'Keterangan'].map((h) => (
                    <th key={h} scope="col" className="border-b px-2.5 py-3 text-left align-bottom leading-snug font-semibold first:pl-5 last:pr-5 max-md:first:hidden">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.days.map((d, i) => {
                  const fix = correctionHref && !!d.status && ['ALFA', 'ALFA_AWAL', 'ALFA_AKHIR'].includes(d.status);
                  const note = d.note ? <span className="font-medium">{d.note}</span> : d.status && d.status !== 'HADIR' ? <span className="text-muted-foreground">{statusText(d.status)}</span> : !d.shiftIn && !d.hasRecord ? <span className="text-muted-foreground">Tanpa jadwal kerja</span> : null;
                  return (
                    <tr key={d.date} className={cn('border-b align-top last:border-b-0', d.off ? 'is-off bg-off text-off-foreground' : 'transition-colors duration-150 hover:bg-secondary/60')}>
                      <td className="px-2.5 py-3 pl-5 text-muted-foreground tabular-nums max-md:hidden">{i + 1}</td>
                      <td className="stack-head px-2.5 py-3 font-medium whitespace-nowrap">
                        {detailHref && d.hasRecord ? <Link href={detailHref(d.date)} className="text-primary underline-offset-4 hover:underline">{tgl(d.date)}</Link> : tgl(d.date)}
                      </td>
                      <td data-label="Shift datang" className="px-2.5 py-3 tabular-nums">{d.off ? '00:00' : d.shiftIn ?? '-'}</td>
                      <td data-label="Shift pulang" className="px-2.5 py-3 tabular-nums">{d.off ? '00:00' : d.shiftOut ?? '-'}</td>
                      <td data-label="Jam datang" className="px-2.5 py-3 tabular-nums">{jamDetik(d.checkIn, tz) ?? ''}</td>
                      <td data-label="Lokasi datang" className="min-w-36 px-2.5 py-3 text-xs whitespace-normal">{d.placeIn && <span className="line-clamp-2 uppercase" title={d.placeIn}>{d.placeIn}</span>}</td>
                      <td data-label="Jam pulang" className="px-2.5 py-3 tabular-nums">{jamDetik(d.checkOut, tz) ?? ''}</td>
                      <td data-label="Lokasi pulang" className="min-w-36 px-2.5 py-3 text-xs whitespace-normal">{d.placeOut && <span className="line-clamp-2 uppercase" title={d.placeOut}>{d.placeOut}</span>}</td>
                      <td data-label="Terlambat" className={cn('px-2.5 py-3 tabular-nums', !d.lateMinutes && 'zero')}><span className={cn(d.lateMinutes > 0 && 'font-semibold text-[#b4501f]')}>{durasi(d.lateMinutes)}</span></td>
                      <td data-label="Pulang cepat" className={cn('px-2.5 py-3 tabular-nums', !d.earlyMinutes && 'zero')}><span className={cn(d.earlyMinutes > 0 && 'font-semibold text-[#b4501f]')}>{durasi(d.earlyMinutes)}</span></td>
                      <td data-label="Keterangan" className="span-all min-w-40 px-2.5 py-3 pr-5 whitespace-normal">
                        {d.off ? <span className="font-semibold">{d.offLabel}</span> : (note || fix) ? (
                          <span className="grid gap-0.5">
                            {note}
                            {fix && <Link href={correctionHref!(d.date)} className="w-fit text-xs font-medium text-primary underline-offset-4 hover:underline">Ajukan koreksi</Link>}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
