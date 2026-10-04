import Link from 'next/link';
import { CollapsibleFilters } from '@/components/app/collapsible-filters';
import { ScanFace, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { Dayline } from '@/components/app/dayline';
import { Segmented } from '@/components/app/segmented';
import { KeepParams, Pager, SortableHead, TableToolbar } from '@/components/app/pagination';
import { clampPage, listSchema, sortRows } from '@/lib/list';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { monitoring, CATEGORY_LABEL } from '@/lib/services/reports';
import { unitOptions } from '@/lib/services/units';
import { getSettings } from '@/lib/settings';
import { METHOD_LABEL } from '@/lib/attendance/engine';
import { fmtJam, fmtTanggal, isValidDate } from '@/lib/time';
import { ManualEntry } from './manual-entry';

export const metadata = { title: 'Monitoring Kehadiran' };

const listParams = listSchema(['nama', 'unit', 'masuk', 'pulang', 'status', 'terlambat'] as const, { sort: 'nama' });

export default async function MonitoringPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['attendance.monitor']);
  const sp = await searchParams;
  const [d, units, s] = await Promise.all([
    monitoring(actor, { date: isValidDate(sp.tanggal) ? sp.tanggal : undefined, unitId: sp.unit, category: sp.kategori, method: sp.metode, q: sp.q }),
    unitOptions(actor, 'attendance.monitor'),
    getSettings(),
  ]);
  const base = (k?: string) => `?${new URLSearchParams(Object.fromEntries(Object.entries({ tanggal: d.date, unit: sp.unit, metode: sp.metode, q: sp.q, kategori: k, sort: sp.sort, dir: sp.dir, per: sp.per }).filter(([, v]) => v)) as Record<string, string>)}`;
  const l = listParams.parse(sp);
  const sorted = sortRows(d.rows, ({
    nama: (r) => r.employee.fullName, unit: (r) => r.employee.unit?.name ?? null, masuk: (r) => r.record?.checkInAt?.getTime() ?? null,
    pulang: (r) => r.record?.checkOutAt?.getTime() ?? null, status: (r) => CATEGORY_LABEL[r.category] ?? r.category, terlambat: (r) => r.record?.lateMinutes ?? null,
  } satisfies Record<typeof l.sort, (r: (typeof d.rows)[number]) => string | number | null>)[l.sort], l.dir);
  const page = clampPage(l.page, l.per, sorted.length);
  const rows = sorted.slice((page - 1) * l.per, page * l.per);
  const params = { tanggal: sp.tanggal, unit: sp.unit, metode: sp.metode, q: sp.q, kategori: sp.kategori, sort: sp.sort, dir: sp.dir, per: sp.per };
  const sortProps = { sort: l.sort, dir: l.dir, params };
  return (
    <>
      <PageHeader
        title="Monitoring Kehadiran"
        description={fmtTanggal(d.date)}
        actions={
          <>
            {can(actor, 'attendance.manual_entry') && s['methods.manual'] && <ManualEntry date={d.date} />}
            {can(actor, 'kiosk.operate') && <Button asChild variant="outline"><Link href="/kiosk" target="_blank"><ScanFace />Buka kiosk wajah</Link></Button>}
          </>
        }
      />
      <PageBody className="grid gap-4">
        <CollapsibleFilters active={[sp.unit, sp.metode, sp.q, sp.tanggal].filter(Boolean).length}>
        <form method="get" className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1fr_1.4fr_1.2fr_1.6fr_auto] md:items-end" aria-label="Filter monitoring">
          <div className="grid gap-2"><Label htmlFor="tanggal">Tanggal</Label><Input id="tanggal" name="tanggal" type="date" defaultValue={d.date} /></div>
          <div className="grid gap-2"><Label htmlFor="unit">Unit kerja</Label><NativeSelect id="unit" name="unit" defaultValue={sp.unit ?? ''}><NativeSelectOption value="">Semua unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect></div>
          <div className="grid gap-2"><Label htmlFor="metode">Metode</Label><NativeSelect id="metode" name="metode" defaultValue={sp.metode ?? ''}><NativeSelectOption value="">Semua metode</NativeSelectOption>{Object.entries(METHOD_LABEL).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}</NativeSelect></div>
          <div className="grid gap-2"><Label htmlFor="q">Cari pegawai</Label><div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="q" name="q" type="search" defaultValue={sp.q} placeholder="Nama atau NIP" className="pl-9" /></div></div>
          <input type="hidden" name="kategori" value={sp.kategori ?? ''} />
          <KeepParams values={{ sort: sp.sort, dir: sp.dir, per: sp.per }} />
          <Button type="submit">Terapkan</Button>
        </form>
        </CollapsibleFilters>

        <Segmented label="Kategori kehadiran" current={sp.kategori ?? ''} className="md:w-fit"
          items={[['', 'Semua'], ...Object.entries(CATEGORY_LABEL)].map(([k, label]) => ({
            key: k, label, href: base(k || undefined), count: k ? d.counts[k] ?? 0 : Object.values(d.counts).reduce((a, b) => a + b, 0),
          }))} />

        <div className="rounded-xl border bg-card">
          <TableToolbar {...sortProps} sorts={[{ value: 'nama', label: 'Nama' }, { value: 'masuk', label: 'Jam masuk' }, { value: 'terlambat', label: 'Menit terlambat' }, { value: 'status', label: 'Status' }, { value: 'unit', label: 'Unit' }]}>
            <span className="tabular-nums">{sorted.length.toLocaleString('id-ID')}</span> pegawai
          </TableToolbar>
          <Table className="table-stack">
            <TableHeader><TableRow>
              <SortableHead label="Pegawai" value="nama" {...sortProps} className="pl-4 lg:pl-6" />
              <TableHead>Jadwal</TableHead>
              <SortableHead label="Masuk" value="masuk" {...sortProps} />
              <SortableHead label="Pulang" value="pulang" {...sortProps} />
              <SortableHead label="Status" value="status" {...sortProps} />
              <TableHead className="pr-4 lg:pr-6">Garis hari kerja</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={6}><EmptyState title="Tidak ada pegawai pada kategori ini" actions={sp.kategori || sp.q || sp.unit || sp.metode ? [{ href: `/absensi/monitoring?tanggal=${d.date}`, label: 'Hapus filter' }] : undefined} /></TableCell></TableRow>}
              {rows.map(({ employee: e, plan: p, record: r, status }) => (
                <TableRow key={e.id}>
                  <TableCell className="stack-head pl-4 lg:pl-6">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0"><Link href={`/absensi/rekap/${e.id}/${d.date}`} className="font-medium text-primary hover:underline">{e.fullName}</Link><span className="block text-xs text-muted-foreground">{e.unit?.name ?? ''}</span></span>
                      <span className="shrink-0 md:hidden">{status ? <StatusBadge status={status} /> : <StatusBadge status="LIBUR" label="Tanpa jadwal" />}</span>
                    </span>
                    <span className="mt-1 block text-sm tabular md:hidden">
                      Masuk <b>{fmtJam(r?.checkInAt, d.tz) ?? '--:--'}</b>{r && r.lateMinutes > 0 && <span className="text-[#b4501f]"> (+{r.lateMinutes} mnt)</span>}, pulang <b>{fmtJam(r?.checkOutAt, d.tz) ?? '--:--'}</b>
                      <span className="block text-xs text-muted-foreground">{p.isOffDay ? p.holidayName ?? 'Libur' : p.schedule ? `Jadwal ${p.schedule.code} ${p.schedule.checkIn} sampai ${p.schedule.checkOut}` : 'Tanpa jadwal'}</span>
                    </span>
                  </TableCell>
                  <TableCell data-label="Jadwal" className="max-md:hidden! tabular text-muted-foreground">{p.isOffDay ? p.holidayName ?? 'Libur' : p.schedule ? `${p.schedule.code} ${p.schedule.checkIn}-${p.schedule.checkOut}` : 'Tanpa jadwal'}</TableCell>
                  <TableCell data-label="Masuk" className="max-md:hidden! tabular">{fmtJam(r?.checkInAt, d.tz) ?? '-'}<span className="block text-xs text-muted-foreground">{METHOD_LABEL[r?.checkInMethod ?? ''] ?? ''}</span></TableCell>
                  <TableCell data-label="Pulang" className="max-md:hidden! tabular">{fmtJam(r?.checkOutAt, d.tz) ?? '-'}<span className="block text-xs text-muted-foreground">{METHOD_LABEL[r?.checkOutMethod ?? ''] ?? ''}</span></TableCell>
                  <TableCell data-label="Status" className="max-md:hidden!">{status ? <StatusBadge status={status} /> : <StatusBadge status="LIBUR" label="Tanpa jadwal" />}{r && r.lateMinutes > 0 && <span className="block text-xs text-muted-foreground">{r.lateMinutes} mnt</span>}</TableCell>
                  <TableCell className="pr-4 max-md:hidden lg:pr-6"><Dayline scheduleIn={p.schedule?.checkIn} scheduleOut={p.schedule?.checkOut} checkIn={fmtJam(r?.checkInAt, d.tz)} checkOut={fmtJam(r?.checkOutAt, d.tz)} late={(r?.lateMinutes ?? 0) > 0} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager total={sorted.length} page={page} pageSize={l.per} params={params} />
        </div>
        <p className="text-sm text-muted-foreground">&quot;Belum absen&quot; berarti hari ini belum ada catatan dari wajah, mesin, atau petugas. Tanggal yang sudah lewat tanpa absen tercatat sebagai Alfa; ajukan koreksi bila keliru.</p>
      </PageBody>
    </>
  );
}
