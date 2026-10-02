import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { CollapsibleFilters } from '@/components/app/collapsible-filters';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { Segmented } from '@/components/app/segmented';
import { StatusBadge, REQUEST_LABEL } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { KeepParams, Pager, SortableHead, TableToolbar } from '@/components/app/pagination';
import { qs } from '@/lib/list';
import { requirePage } from '@/lib/guard';
import { can, type Actor } from '@/lib/auth/actor';
import { getSettings } from '@/lib/settings';
import { balancesFor, leaveCalendar, listLeave, listLeaveTypes } from '@/lib/services/leave';
import { BULAN, HARI_PENDEK, dateRange, fmtTglPendek, fmtWaktu, fromDbDate, monthBounds, todayIn } from '@/lib/time';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Cuti & Izin' };

type SP = Record<string, string | undefined>;

const shiftMonth = (m: string, n: number) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + n, 1)).toISOString().slice(0, 7);

export default async function LeavePage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requirePage(['leave.request', 'leave.approve', 'leave.manage']);
  const sp = await searchParams;
  const s = await getSettings();
  const tz = s['org.timezone'];
  const today = todayIn(tz);
  const approver = can(actor, 'leave.approve') || can(actor, 'leave.manage');
  const self = !!actor.employeeId && can(actor, 'leave.request');
  const views = [
    ...(self ? [{ key: 'saya', label: 'Pengajuan saya' }] : []),
    ...(approver ? [{ key: 'persetujuan', label: 'Perlu persetujuan' }, { key: 'semua', label: 'Semua pengajuan' }] : []),
    { key: 'kalender', label: 'Kalender' },
  ];
  const view = views.some((v) => v.key === sp.lihat) ? sp.lihat! : views[0].key;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.bulan ?? '') ? sp.bulan! : today.slice(0, 7);

  return (
    <>
      <PageHeader
        title="Cuti & Izin"
        description="Pengajuan, persetujuan berjenjang, dan saldo. Jenis dan kuota mengikuti pengaturan instansi."
        actions={
          <>
            {can(actor, 'leave.manage') && <Button asChild variant="outline"><Link href="/cuti/saldo">Kelola saldo</Link></Button>}
            {self && s['modules.leave'] && <Button asChild><Link href="/cuti/baru"><Plus />Ajukan cuti/izin</Link></Button>}
          </>
        }
      />
      <PageBody className="grid gap-4">
        {!s['modules.leave'] && (
          <Alert variant="warning"><AlertTitle>Modul cuti dan izin dinonaktifkan</AlertTitle><AlertDescription>Pengajuan baru dan persetujuan tidak bisa dilakukan. Riwayat tetap bisa dilihat.</AlertDescription></Alert>
        )}
        <Segmented label="Tampilan" current={view} className="w-fit" items={views.map((v) => ({ ...v, href: `?lihat=${v.key}` }))} />
        {view === 'kalender' ? <CalendarView actor={actor} month={month} today={today} /> : <ListView actor={actor} view={view as 'saya' | 'persetujuan' | 'semua'} sp={sp} tz={tz} year={Number(today.slice(0, 4))} />}
      </PageBody>
    </>
  );
}

async function ListView({ actor, view, sp, tz, year }: { actor: Actor; view: 'saya' | 'persetujuan' | 'semua'; sp: SP; tz: string; year: number }) {
  const status = view === 'persetujuan' ? 'ALL' : (['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL'].includes(sp.status ?? '') ? sp.status! : 'ALL');
  const showEmployee = view !== 'saya';
  const filters = { jenis: sp.jenis, q: showEmployee ? sp.q : undefined, dari: sp.dari, sampai: sp.sampai };
  const [data, balances, types] = await Promise.all([
    listLeave(actor, { view, status, typeId: sp.jenis, q: filters.q, from: sp.dari, to: sp.sampai, page: sp.page, per: sp.per, sort: sp.sort, dir: sp.dir }),
    view === 'saya' && actor.employeeId ? balancesFor(actor.employeeId, year) : Promise.resolve([]),
    listLeaveTypes(true),
  ]);
  const params = { lihat: view, status: view === 'persetujuan' ? undefined : status, ...filters, sort: sp.sort, dir: sp.dir, per: sp.per };
  const sortProps = { sort: data.sort, dir: data.dir, params };
  const filtered = Object.values(filters).some(Boolean);
  return (
    <>
      {balances.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {balances.map((b) => (
            <Card key={b.leaveType.id} className="gap-1 py-4">
              <CardHeader className="px-4"><CardDescription>Sisa {b.leaveType.name} {year}</CardDescription></CardHeader>
              <CardContent className="px-4">
                {b.configured ? (
                  <>
                    <p className="text-2xl font-semibold tabular">{b.remaining} <span className="text-sm font-normal text-muted-foreground">hari</span></p>
                    <p className="text-xs text-muted-foreground">Hak {b.entitled}, terpakai {b.used}{b.reserved ? `, menunggu ${b.reserved}` : ''}</p>
                  </>
                ) : <p className="text-sm text-muted-foreground">Saldo belum diatur admin kepegawaian.</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {view !== 'persetujuan' && (
        <Segmented label="Filter status" current={status} className="w-fit" items={['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((k) => ({ key: k, label: k === 'ALL' ? 'Semua' : REQUEST_LABEL[k], href: qs({ ...params, status: k, page: undefined }) }))} />
      )}
      <CollapsibleFilters active={Object.values(filters).filter(Boolean).length}>
        <form method="get" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1fr_auto] lg:items-end" aria-label="Filter pengajuan">
          <input type="hidden" name="lihat" value={view} />
          {view !== 'persetujuan' && <input type="hidden" name="status" value={status} />}
          <KeepParams values={{ sort: sp.sort, dir: sp.dir, per: sp.per }} />
          {showEmployee ? (
            <div className="grid gap-2"><Label htmlFor="q">Pegawai</Label><div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="q" name="q" type="search" defaultValue={sp.q} placeholder="Nama atau NIP" className="pl-9" /></div></div>
          ) : <div className="max-lg:hidden" />}
          <div className="grid gap-2"><Label htmlFor="jenis">Jenis</Label><NativeSelect id="jenis" name="jenis" defaultValue={sp.jenis ?? ''}><NativeSelectOption value="">Semua jenis</NativeSelectOption>{types.map((t) => <NativeSelectOption key={t.id} value={t.id}>{t.name}</NativeSelectOption>)}</NativeSelect></div>
          <div className="grid gap-2"><Label htmlFor="dari">Tanggal dari</Label><Input id="dari" name="dari" type="date" defaultValue={sp.dari} /></div>
          <div className="grid gap-2"><Label htmlFor="sampai">Sampai</Label><Input id="sampai" name="sampai" type="date" defaultValue={sp.sampai} /></div>
          <div className="flex gap-2"><Button type="submit">Terapkan</Button>{filtered && <Button asChild variant="outline"><Link href={qs({ lihat: view, status: params.status })}>Reset</Link></Button>}</div>
        </form>
      </CollapsibleFilters>
      <div className="rounded-xl border bg-card">
        <TableToolbar {...sortProps} sorts={[{ value: 'diajukan', label: 'Waktu diajukan' }, { value: 'mulai', label: 'Tanggal mulai' }, ...(showEmployee ? [{ value: 'nama', label: 'Nama pegawai' }] : []), { value: 'lama', label: 'Lama' }, { value: 'status', label: 'Status' }]}>
          <span className="tabular-nums">{data.total.toLocaleString('id-ID')}</span> pengajuan{filtered ? ' sesuai filter' : ''}
        </TableToolbar>
        <Table className="table-stack">
          <TableHeader><TableRow>
            {showEmployee && <SortableHead label="Pegawai" value="nama" {...sortProps} className="pl-4 lg:pl-6" />}
            <TableHead className={showEmployee ? '' : 'pl-4 lg:pl-6'}>Jenis</TableHead>
            <SortableHead label="Tanggal" value="mulai" {...sortProps} firstDir="desc" />
            <SortableHead label="Lama" value="lama" {...sortProps} firstDir="desc" />
            <TableHead>Tahap</TableHead>
            <SortableHead label="Diajukan" value="diajukan" {...sortProps} firstDir="desc" />
            <SortableHead label="Status" value="status" {...sortProps} className="pr-4 lg:pr-6" />
          </TableRow></TableHeader>
          <TableBody>
            {data.rows.length === 0 && (
              <TableRow><TableCell colSpan={7}>
                {filtered
                  ? <EmptyState title="Tidak ada pengajuan yang cocok" description="Ubah filter atau rentang tanggal." actions={[{ href: qs({ lihat: view, status: params.status }), label: 'Hapus filter' }]} />
                  : <EmptyState title={view === 'persetujuan' ? 'Tidak ada pengajuan yang menunggu Anda' : 'Belum ada pengajuan'} description={view === 'saya' ? 'Pengajuan cuti, izin, atau sakit akan tampil di sini beserta status persetujuannya.' : 'Pengajuan pegawai di unit Anda akan muncul di sini.'} actions={view === 'saya' && can(actor, 'leave.request') ? [{ href: '/cuti/baru', label: 'Ajukan cuti/izin', primary: true }] : undefined} />}
              </TableCell></TableRow>
            )}
            {data.rows.map((r) => (
              <TableRow key={r.id}>
                {showEmployee && <TableCell className="stack-head pl-4 lg:pl-6"><span className="font-medium">{r.employee.fullName}</span><span className="block text-xs text-muted-foreground">{r.employee.unit?.name ?? ''}</span></TableCell>}
                <TableCell data-label="Jenis" className={showEmployee ? '' : 'stack-head pl-4 lg:pl-6'}><Link className="font-medium text-primary hover:underline" href={`/cuti/${r.id}`}>{r.leaveType.name}</Link></TableCell>
                <TableCell data-label="Tanggal" className="tabular">{fmtTglPendek(fromDbDate(r.startDate))}{r.endDate.getTime() !== r.startDate.getTime() && ` sampai ${fmtTglPendek(fromDbDate(r.endDate))}`}</TableCell>
                <TableCell data-label="Lama" className="tabular">{r.days} hari</TableCell>
                <TableCell data-label="Tahap" className="whitespace-normal text-muted-foreground">{r.status === 'PENDING' ? (r.approvals.find((a) => a.level === r.currentLevel)?.approverKind === 'ADMIN_KEPEGAWAIAN' ? 'Admin kepegawaian' : 'Atasan langsung') : '-'}</TableCell>
                <TableCell data-label="Diajukan" className="text-muted-foreground">{fmtWaktu(r.createdAt, tz)}</TableCell>
                <TableCell data-label="Status" className="pr-4 lg:pr-6"><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pager total={data.total} page={data.page} pageSize={data.pageSize} params={params} />
      </div>
    </>
  );
}

async function CalendarView({ actor, month, today }: { actor: Actor; month: string; today: string }) {
  const rows = await leaveCalendar(actor, month);
  const { from, to } = monthBounds(month);
  const days = dateRange(from, to).map((d) => ({ d, items: rows.filter((r) => fromDbDate(r.startDate) <= d && fromDbDate(r.endDate) >= d) }));
  const busy = days.filter((x) => x.items.length);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>{BULAN[Number(month.slice(5)) - 1]} {month.slice(0, 4)}</CardTitle>
          <CardDescription>Cuti dan izin yang disetujui atau masih menunggu, per tanggal.</CardDescription>
        </div>
        <div className="flex gap-1">
          <Button asChild variant="outline" size="icon" aria-label="Bulan sebelumnya"><Link href={`?lihat=kalender&bulan=${shiftMonth(month, -1)}`}><ChevronLeft /></Link></Button>
          <Button asChild variant="outline" size="icon" aria-label="Bulan berikutnya"><Link href={`?lihat=kalender&bulan=${shiftMonth(month, 1)}`}><ChevronRight /></Link></Button>
        </div>
      </CardHeader>
      <CardContent>
        {busy.length === 0 ? <EmptyState title="Tidak ada cuti atau izin bulan ini" description="Pengajuan yang disetujui atau masih menunggu akan tampil di kalender ini." /> : (
          <ol className="divide-y">
            {busy.map(({ d, items }) => (
              <li key={d} className="grid gap-2 py-3 sm:grid-cols-[9rem_1fr]">
                <span className={cn('font-medium tabular', d === today && 'text-primary')}>{HARI_PENDEK[new Date(`${d}T00:00:00Z`).getUTCDay()]}, {fmtTglPendek(d, false)}</span>
                <ul className="flex flex-wrap gap-2">
                  {items.map((r) => (
                    <li key={r.id}>
                      <Link href={`/cuti/${r.id}`} className="inline-flex min-h-9 items-center gap-2 rounded-md border px-2.5 text-sm hover:bg-accent">
                        {r.employee.fullName}<span className="text-muted-foreground">{r.leaveType.name}</span>{r.status === 'PENDING' && <StatusBadge status="PENDING" />}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
