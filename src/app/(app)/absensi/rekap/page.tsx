import Link from 'next/link';
import { CollapsibleFilters } from '@/components/app/collapsible-filters';
import { Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { Pager } from '@/components/app/pagination';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { dailyRecords, recap } from '@/lib/services/reports';
import { unitOptions } from '@/lib/services/units';
import { getSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';
import { METHOD_LABEL, STATUS_LABEL } from '@/lib/attendance/engine';
import { addDays, fmtJam, fmtTglPendek, fromDbDate, isValidDate, monthBounds, todayIn, weekdayOf } from '@/lib/time';
import { Recalculate } from './recalculate';

export const metadata = { title: 'Rekapitulasi' };

export default async function RecapPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['attendance.report']);
  const sp = await searchParams;
  const tz = (await getSettings())['org.timezone'];
  const today = todayIn(tz);
  const month = monthBounds(today.slice(0, 7));
  const from = isValidDate(sp.dari) ? sp.dari : month.from;
  const to = isValidDate(sp.sampai) ? sp.sampai : today;
  const view = sp.tampilan === 'harian' ? 'harian' : 'rekap';
  const f = { from, to, unitId: sp.unit ?? '', status: sp.status ?? '', method: sp.metode ?? '', deviceId: sp.mesin ?? '', q: sp.q ?? '' };
  const params = { dari: from, sampai: to, unit: sp.unit, status: sp.status, metode: sp.metode, mesin: sp.mesin, q: sp.q, tampilan: view };
  const qs = (extra: Record<string, string | undefined>) => `?${new URLSearchParams(Object.fromEntries(Object.entries({ ...params, ...extra }).filter(([, v]) => v)) as Record<string, string>)}`;
  const [units, devices] = await Promise.all([unitOptions(actor, 'attendance.report'), prisma.attendanceDevice.findMany({ where: { deletedAt: null }, select: { id: true, name: true } })]);
  const exportQs = new URLSearchParams(Object.fromEntries(Object.entries({ from, to, unitId: f.unitId, status: f.status, method: f.method, deviceId: f.deviceId, q: f.q }).filter(([, v]) => v)) as Record<string, string>).toString();
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const presets = [
    ['Hari ini', today, today], ['Minggu ini', monday, today], ['Bulan ini', month.from, today],
    ['Bulan lalu', monthBounds(addDays(month.from, -1).slice(0, 7)).from, monthBounds(addDays(month.from, -1).slice(0, 7)).to],
  ];

  return (
    <>
      <PageHeader
        title="Rekapitulasi absensi"
        description={`${fmtTglPendek(from)} sampai ${fmtTglPendek(to)}`}
        actions={
          <>
            {can(actor, 'attendance.export') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button><Download />Ekspor</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild><a href={`/api/v1/attendance/export?format=xlsx&${exportQs}`}>Excel (rekap dan detail)</a></DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={`/api/v1/attendance/export?format=pdf&${exportQs}`}>PDF rekap</a></DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={`/api/v1/attendance/export?format=csv-rekap&${exportQs}`}>CSV rekap</a></DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={`/api/v1/attendance/export?format=csv&${exportQs}`}>CSV detail harian</a></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {can(actor, 'attendance.recalculate') && <Recalculate from={from} to={to} />}
          </>
        }
      />
      <PageBody className="grid gap-4">
        <CollapsibleFilters active={Object.entries(sp).filter(([k, v]) => v && !['page', 'sort', 'lihat', 'kategori', 'status', 'tab'].includes(k)).length}>
        <form method="get" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.3fr_1fr_1fr_1.3fr_auto] lg:items-end" aria-label="Filter rekap">
          <div className="grid gap-2"><Label htmlFor="dari">Dari</Label><Input id="dari" name="dari" type="date" defaultValue={from} /></div>
          <div className="grid gap-2"><Label htmlFor="sampai">Sampai</Label><Input id="sampai" name="sampai" type="date" defaultValue={to} /></div>
          <div className="grid gap-2"><Label htmlFor="unit">Unit kerja</Label><NativeSelect id="unit" name="unit" defaultValue={f.unitId}><NativeSelectOption value="">Semua unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect></div>
          <div className="grid gap-2"><Label htmlFor="status">Status</Label><NativeSelect id="status" name="status" defaultValue={f.status}><NativeSelectOption value="">Semua</NativeSelectOption>{Object.entries(STATUS_LABEL).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}</NativeSelect></div>
          <div className="grid gap-2"><Label htmlFor="metode">Metode</Label><NativeSelect id="metode" name="metode" defaultValue={f.method}><NativeSelectOption value="">Semua</NativeSelectOption>{Object.entries(METHOD_LABEL).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}</NativeSelect></div>
          <div className="grid gap-2"><Label htmlFor="q">Pegawai</Label><div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="q" name="q" type="search" defaultValue={f.q} placeholder="Nama atau NIP" className="rounded-full pl-9" /></div></div>
          <input type="hidden" name="tampilan" value={view} />
          <div className="flex gap-2"><Button type="submit">Terapkan</Button></div>
          {devices.length > 0 && (
            <div className="grid gap-2 sm:col-span-2 lg:col-span-2"><Label htmlFor="mesin">Perangkat sumber</Label><NativeSelect id="mesin" name="mesin" defaultValue={f.deviceId}><NativeSelectOption value="">Semua</NativeSelectOption>{devices.map((d) => <NativeSelectOption key={d.id} value={d.id}>{d.name}</NativeSelectOption>)}</NativeSelect></div>
          )}
          <div className="flex flex-wrap items-end gap-1.5 sm:col-span-2 lg:col-span-5">
            {presets.map(([label, a, b]) => <Button key={label} asChild size="sm" variant={from === a && to === b ? 'secondary' : 'ghost'}><Link href={qs({ dari: a, sampai: b, page: undefined })}>{label}</Link></Button>)}
          </div>
        </form>
        </CollapsibleFilters>

        <nav className="flex w-fit gap-1 rounded-full border bg-card p-1" aria-label="Tampilan">
          {[['rekap', 'Rekap per pegawai'], ['harian', 'Detail harian']].map(([k, label]) => (
            <Link key={k} href={qs({ tampilan: k, page: undefined })} aria-current={view === k ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium ${view === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{label}</Link>
          ))}
        </nav>

        {view === 'rekap' ? <RecapTable actorPromise={recap(actor, f)} /> : <DailyTable data={await dailyRecords(actor, f, { page: Number(sp.page) || 1 })} tz={tz} params={params} />}
        <p className="text-sm text-muted-foreground">&quot;Tanpa transaksi&quot; = hari kerja terjadwal yang sudah lewat tanpa catatan apa pun. Bukan otomatis tidak hadir; status tidak hadir hanya ditetapkan petugas setelah pemeriksaan.</p>
      </PageBody>
    </>
  );
}

async function RecapTable({ actorPromise }: { actorPromise: ReturnType<typeof recap> }) {
  const { rows, filter } = await actorPromise;
  return (
    <div className="rounded-xl border bg-card">
      <Table className="table-stack stack-grid">
        <TableHeader><TableRow>
          <TableHead className="pl-4 lg:pl-6">Pegawai</TableHead><TableHead className="text-right">Hari kerja</TableHead><TableHead className="text-right">Hadir</TableHead><TableHead className="text-right">Terlambat</TableHead>
          <TableHead className="text-right">Pulang awal</TableHead><TableHead className="text-right">Dinas luar</TableHead><TableHead className="text-right">Izin/sakit/cuti</TableHead><TableHead className="text-right">Tidak hadir</TableHead><TableHead className="text-right">Tanpa transaksi</TableHead><TableHead className="pr-4 text-right lg:pr-6">Kehadiran</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={10}><EmptyState filtered title="Tidak ada data untuk filter ini" /></TableCell></TableRow>}
          {rows.map((r) => (
            <TableRow key={r.employeeId}>
              <TableCell className="stack-head pl-4 lg:pl-6"><Link className="font-medium text-primary hover:underline" href={`/absensi/rekap?tampilan=harian&dari=${filter.from}&sampai=${filter.to}&q=${encodeURIComponent(r.employeeNumber ?? r.name)}`}>{r.name}</Link><span className="block text-xs text-muted-foreground">{r.unit ?? ''}</span></TableCell>
              <TableCell data-label="Hari kerja" className="tabular md:text-right">{r.scheduledDays}</TableCell>
              <TableCell data-label="Hadir" className="tabular md:text-right">{r.present}</TableCell>
              <TableCell data-label="Terlambat" className="tabular md:text-right">{r.late}{r.lateMinutes ? <span className="block text-xs text-muted-foreground">{r.lateMinutes} mnt</span> : null}</TableCell>
              <TableCell data-label="Pulang awal" className="tabular md:text-right">{r.earlyLeave}{r.earlyLeaveMinutes ? <span className="block text-xs text-muted-foreground">{r.earlyLeaveMinutes} mnt</span> : null}</TableCell>
              <TableCell data-label="Dinas luar" className="tabular md:text-right">{r.fieldDuty}</TableCell>
              <TableCell data-label="Izin/sakit/cuti" className="tabular md:text-right">{r.permit + r.sick + r.leave}</TableCell>
              <TableCell data-label="Tidak hadir" className="tabular md:text-right">{r.absent}</TableCell>
              <TableCell data-label="Tanpa transaksi" className="tabular md:text-right">{r.noRecord ? <StatusBadge status="TERLAMBAT" label={String(r.noRecord)} /> : 0}</TableCell>
              <TableCell data-label="Kehadiran" className="pr-4 tabular md:text-right lg:pr-6">{r.attendancePct == null ? '-' : `${r.attendancePct}%`}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DailyTable({ data, tz, params }: { data: Awaited<ReturnType<typeof dailyRecords>>; tz: string; params: Record<string, string | undefined> }) {
  return (
    <div className="rounded-xl border bg-card">
      <Table className="table-stack stack-grid">
        <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Tanggal</TableHead><TableHead>Pegawai</TableHead><TableHead>Jadwal</TableHead><TableHead>Masuk</TableHead><TableHead>Pulang</TableHead><TableHead>Status</TableHead><TableHead className="pr-4 lg:pr-6">Catatan</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.rows.length === 0 && <TableRow><TableCell colSpan={7}><EmptyState filtered title="Tidak ada catatan absensi untuk filter ini" /></TableCell></TableRow>}
          {data.rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="stack-head pl-4 lg:pl-6"><Link className="font-medium text-primary hover:underline" href={`/absensi/rekap/${r.employeeId}/${fromDbDate(r.workDate)}`}>{fmtTglPendek(fromDbDate(r.workDate))}</Link></TableCell>
              <TableCell data-label="Pegawai" className="span-all">{r.employee.fullName}<span className="block text-xs text-muted-foreground">{r.employee.unit?.name ?? ''}</span></TableCell>
              <TableCell data-label="Jadwal" className="tabular text-muted-foreground">{r.schedule ? `${r.schedule.code} ${r.schedule.checkIn}-${r.schedule.checkOut}` : '-'}</TableCell>
              <TableCell data-label="Masuk" className="tabular">{fmtJam(r.checkInAt, tz) ?? '-'}<span className="block text-xs text-muted-foreground">{METHOD_LABEL[r.checkInMethod ?? ''] ?? ''}</span></TableCell>
              <TableCell data-label="Pulang" className="tabular">{fmtJam(r.checkOutAt, tz) ?? '-'}<span className="block text-xs text-muted-foreground">{METHOD_LABEL[r.checkOutMethod ?? ''] ?? ''}</span></TableCell>
              <TableCell data-label="Status"><StatusBadge status={r.status} />{r.lateMinutes > 0 && <span className="block text-xs text-muted-foreground">{r.lateMinutes} mnt</span>}</TableCell>
              <TableCell data-label="Catatan" className="span-all pr-4 whitespace-normal text-sm text-muted-foreground lg:pr-6">{[r.dispensation && 'Dispensasi', r.reviewReason, r.note].filter(Boolean).join('; ')}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager total={data.total} page={data.page} pageSize={data.pageSize} params={params} />
    </div>
  );
}
