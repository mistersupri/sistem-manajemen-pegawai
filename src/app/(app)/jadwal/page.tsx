import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeepParams, Pager, SortableHead, TableToolbar } from '@/components/app/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { Segmented } from '@/components/app/segmented';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { ConfirmButton } from '@/components/app/confirm-button';
import { requirePage } from '@/lib/guard';
import { can, employeeScopeWhere, scopeOf, type Actor } from '@/lib/auth/actor';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { listAssignmentsPage, listHolidays, listSchedules, scheduleGrid, scheduleRevisions } from '@/lib/services/schedules';
import { unitOptions } from '@/lib/services/units';
import { plansFor } from '@/lib/attendance/plan';
import { BULAN, HARI, HARI_PENDEK, fmtTanggal, fmtTglPendek, fmtWaktu, fromDbDate, monthBounds, todayIn } from '@/lib/time';
import { AssignmentForm, BulkDaysDialog, EndAssignment, HolidayForm, HolidayImport, HolidaySync, HolidayToggle, ScheduleForm, ScheduleGrid } from './forms';
import { HOLIDAY_KIND_LABEL, HOLIDAY_SOURCE_LABEL } from '@/lib/services/holidays';
import { Badge } from '@/components/ui/badge';
import { getSettings } from '@/lib/settings';

export const metadata = { title: 'Jadwal Kerja' };

type SP = Record<string, string | undefined>;

const monthLabel = (m: string) => `${BULAN[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const shiftMonth = (m: string, n: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const workdayText = (w: number[]) => [1, 2, 3, 4, 5, 6, 0].filter((d) => w.includes(d)).map((d) => HARI_PENDEK[d]).join(', ');

export default async function SchedulePage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requirePage(['schedule.read', 'attendance.self']);
  const sp = await searchParams;
  const tz = await getSetting('org.timezone');
  const today = todayIn(tz);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.bulan ?? '') ? sp.bulan! : today.slice(0, 7);
  if (!can(actor, 'schedule.read')) return <MySchedule actor={actor} month={month} today={today} />;

  const tab = ['kalender', 'jadwal', 'penugasan', 'libur'].includes(sp.tab ?? '') ? sp.tab! : 'kalender';
  const manage = can(actor, 'schedule.manage');
  const tabs = [
    { key: 'kalender', label: 'Kalender bulanan', href: `?tab=kalender&bulan=${month}` },
    { key: 'jadwal', label: 'Jenis jadwal', href: '?tab=jadwal' },
    { key: 'penugasan', label: 'Penugasan', href: '?tab=penugasan' },
    { key: 'libur', label: 'Hari libur', href: '?tab=libur' },
  ];
  return (
    <>
      <PageHeader
        title="Jadwal Kerja"
        description="Jenis jadwal, penugasan ke pegawai atau unit, perubahan harian, dan hari libur. Setiap perubahan aturan tersimpan sebagai versi baru."
        actions={manage ? <BulkDays actor={actor} month={month} /> : undefined}
      />
      <PageBody className="grid gap-4">
        <Segmented items={tabs} current={tab} label="Bagian jadwal" className="w-fit" />
        {tab === 'kalender' && <GridTab actor={actor} month={month} unitId={sp.unit} today={today} manage={manage} sp={sp} />}
        {tab === 'jadwal' && <SchedulesTab manage={manage} revFor={sp.rev} tz={tz} />}
        {tab === 'penugasan' && <AssignmentsTab actor={actor} manage={manage} sp={sp} today={today} />}
        {tab === 'libur' && <HolidaysTab actor={actor} manage={manage} year={Number(sp.tahun) || Number(today.slice(0, 4))} />}
      </PageBody>
    </>
  );
}

async function BulkDays({ actor, month }: { actor: Actor; month: string }) {
  const [units, schedules] = await Promise.all([unitOptions(actor, 'schedule.manage'), listSchedules()]);
  const { from, to } = monthBounds(month);
  return (
    <BulkDaysDialog
      from={from} to={to} units={units.map((u) => ({ id: u.id, name: u.name }))}
      schedules={schedules.map((s) => ({ id: s.id, name: s.name, code: s.code, checkIn: s.checkIn, checkOut: s.checkOut }))}
    />
  );
}

async function GridTab({ actor, month, unitId, today, manage, sp }: { actor: Actor; month: string; unitId?: string; today: string; manage: boolean; sp: SP }) {
  const units = await unitOptions(actor, 'schedule.read');
  const unit = unitId && units.some((u) => u.id === unitId) ? unitId : undefined;
  const search = sp.q?.trim() || undefined;
  const [grid, schedules] = await Promise.all([scheduleGrid(actor, month, unit, { q: search, page: Number(sp.page) || 1, per: Number(sp.per) || undefined }), listSchedules()]);
  const params = { tab: 'kalender', bulan: month, unit, q: search, per: sp.per };
  const q = (m: string) => `?${new URLSearchParams(Object.entries({ ...params, bulan: m }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" aria-label="Bulan sebelumnya"><Link href={q(shiftMonth(month, -1))}><ChevronLeft /></Link></Button>
          <h2 className="min-w-40 text-center text-lg font-semibold">{monthLabel(month)}</h2>
          <Button asChild variant="outline" size="icon" aria-label="Bulan berikutnya"><Link href={q(shiftMonth(month, 1))}><ChevronRight /></Link></Button>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="kalender" />
          <input type="hidden" name="bulan" value={month} />
          <KeepParams values={{ per: sp.per }} />
          <label className="grid gap-1 text-sm font-medium" htmlFor="gq">Cari pegawai
            <Input id="gq" name="q" type="search" defaultValue={search} placeholder="Nama atau NIP" className="w-56" />
          </label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="unit">Unit kerja
            <NativeSelect id="unit" name="unit" defaultValue={unit ?? ''} className="min-w-56"><NativeSelectOption value="">Semua unit dalam kewenangan</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect>
          </label>
          <Button type="submit" variant="outline">Tampilkan</Button>
        </form>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Keterangan">
        {schedules.map((s) => (
          <li key={s.id} className="inline-flex items-center gap-2"><span className="size-3 rounded-sm" style={{ background: s.color }} aria-hidden /><b>{s.code}</b><span className="text-muted-foreground">{s.checkIn} sampai {s.checkOut}</span></li>
        ))}
        <li className="inline-flex items-center gap-2"><b>L</b><span className="text-muted-foreground">libur / bukan hari kerja</span></li>
        <li className="inline-flex items-center gap-2"><b>LN</b><span className="text-muted-foreground">hari libur</span></li>
        {manage && <li className="inline-flex items-center gap-2"><span className="size-3 rounded-sm ring-1 ring-primary" aria-hidden /><span className="text-muted-foreground">diubah harian</span></li>}
      </ul>
      {grid.rows.length ? (
        <div className="grid min-w-0 gap-0">
          <ScheduleGrid key={`${month}:${unit}:${search}:${grid.page}:${grid.pageSize}`} dates={grid.dates} rows={grid.rows} schedules={schedules} editable={manage} today={today} />
          <div className="rounded-b-xl border border-t-0 bg-card"><Pager total={grid.total} page={grid.page} pageSize={grid.pageSize} params={params} /></div>
        </div>
      ) : <Card>{search || unit
        ? <EmptyState filtered title="Tidak ada pegawai yang cocok" description="Ubah kata kunci atau unit." actions={[{ href: `?tab=kalender&bulan=${month}`, label: 'Hapus filter' }]} />
        : <EmptyState title="Belum ada pegawai aktif" description="Pegawai aktif dalam unit yang dipilih akan tampil di sini." actions={[{ href: '/pegawai/baru', label: 'Tambah pegawai', primary: true }]} />}</Card>}
      {manage && <p className="text-sm text-muted-foreground">Klik sel untuk mengganti jadwal satu hari. Rekap hari yang sudah lewat dihitung ulang otomatis.</p>}
    </>
  );
}

async function SchedulesTab({ manage, revFor, tz }: { manage: boolean; revFor?: string; tz: string }) {
  const rows = await listSchedules(true);
  const revSchedule = revFor ? rows.find((r) => r.id === revFor) : null;
  const revisions = revSchedule ? await scheduleRevisions(revSchedule.id) : [];
  const users = revisions.length ? await prisma.user.findMany({ where: { id: { in: revisions.map((r) => r.changedById).filter(Boolean) as string[] } }, select: { id: true, username: true } }) : [];
  return (
    <>
      {manage && <div><ScheduleForm /></div>}
      <div className="rounded-xl border bg-card">
        <Table className="table-stack">
          <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Jadwal</TableHead><TableHead>Jam kerja</TableHead><TableHead>Hari kerja</TableHead><TableHead>Toleransi</TableHead><TableHead>Versi</TableHead><TableHead>Penugasan</TableHead><TableHead>Status</TableHead><TableHead className="pr-4 lg:pr-6"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={8}><EmptyState title="Belum ada jadwal kerja" description="Tambahkan jadwal sesuai aturan jam kerja instansi Anda." /></TableCell></TableRow>}
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="stack-head pl-4 lg:pl-6"><span className="inline-flex items-center gap-2"><span className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden /><b>{s.code}</b>{s.name}</span><span className="block text-xs text-muted-foreground">{s.kind === 'SHIFT' ? 'Shift' : 'Reguler'}{s.checkOut <= s.checkIn ? ', melewati tengah malam' : ''}</span></TableCell>
                <TableCell data-label="Jam kerja" className="tabular">{s.checkIn} sampai {s.checkOut}{s.breakStart && <span className="block text-xs text-muted-foreground">istirahat {s.breakStart} sampai {s.breakEnd}</span>}</TableCell>
                <TableCell data-label="Hari kerja" className="whitespace-normal">{workdayText(s.workdays)}</TableCell>
                <TableCell data-label="Toleransi" className="tabular">{s.lateToleranceMin} / {s.earlyLeaveToleranceMin} mnt</TableCell>
                <TableCell data-label="Versi"><Link className="text-primary hover:underline" href={`?tab=jadwal&rev=${s.id}#riwayat`}>v{s.version}</Link></TableCell>
                <TableCell data-label="Penugasan" className="tabular">{s._count.assignments}</TableCell>
                <TableCell data-label="Status"><StatusBadge status={s.isActive ? 'ACTIVE' : 'CANCELLED'} label={s.isActive ? 'Aktif' : 'Nonaktif'} /></TableCell>
                <TableCell className="pr-4 lg:pr-6">
                  {manage && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <ScheduleForm initial={s} />
                      <ConfirmButton size="sm" variant={s.isActive ? 'outline-destructive' : 'outline'} destructive={s.isActive} label={s.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        title={s.isActive ? `Nonaktifkan ${s.code}?` : `Aktifkan ${s.code}?`}
                        description={s.isActive ? 'Jadwal nonaktif tidak bisa dipilih untuk penugasan baru. Penugasan yang sudah ada tidak ikut dihitung sampai jadwal diaktifkan lagi.' : 'Jadwal bisa dipilih lagi untuk penugasan.'}
                        confirmLabel={s.isActive ? 'Nonaktifkan' : 'Aktifkan'} url={`/api/v1/schedules/${s.id}/status`} body={{ active: !s.isActive }} success="Status jadwal diperbarui." />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {revSchedule && (
        <Card id="riwayat">
          <CardHeader><CardTitle>Riwayat versi {revSchedule.code}</CardTitle><CardDescription>Aturan lama tetap tersimpan agar rekap periode lalu bisa ditelusuri.</CardDescription></CardHeader>
          <CardContent>
            <ol className="grid gap-3">
              {revisions.map((r) => {
                const x = r.rules as Record<string, unknown>;
                return (
                  <li key={r.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2"><b>Versi {r.version}</b><span className="text-muted-foreground">{fmtWaktu(r.createdAt, tz)}{users.find((u) => u.id === r.changedById) ? ` oleh ${users.find((u) => u.id === r.changedById)!.username}` : ''}</span></div>
                    <p className="mt-1 tabular">{String(x.checkIn)} sampai {String(x.checkOut)}, toleransi {String(x.lateToleranceMin)}/{String(x.earlyLeaveToleranceMin)} mnt, {workdayText((x.workdays as number[]) ?? [])}</p>
                    {r.changeNote && <p className="mt-1 text-muted-foreground">{r.changeNote}</p>}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}
    </>
  );
}

async function AssignmentsTab({ actor, manage, sp, today }: { actor: Actor; manage: boolean; sp: SP; today: string }) {
  const filters = { q: sp.q, jenis: sp.jenis, jadwal: sp.jadwal, keadaan: sp.keadaan };
  const [data, schedules, units] = await Promise.all([
    listAssignmentsPage(actor, { q: sp.q, kind: sp.jenis, scheduleId: sp.jadwal, state: sp.keadaan, page: sp.page, per: sp.per, sort: sp.sort, dir: sp.dir }, today),
    listSchedules(),
    unitOptions(actor, manage ? 'schedule.manage' : 'schedule.read'),
  ]);
  const params = { tab: 'penugasan', ...filters, sort: sp.sort, dir: sp.dir, per: sp.per };
  const sortProps = { sort: data.sort, dir: data.dir, params };
  const filtered = Object.values(filters).some(Boolean);
  return (
    <>
      {manage && (
        <div className="flex flex-wrap items-center gap-3">
          <AssignmentForm schedules={schedules} units={units} canAllUnits={!!scopeOf(actor, 'schedule.manage')?.all} />
          <p className="text-sm text-muted-foreground">Perubahan per hari dilakukan di kalender bulanan atau lewat Atur banyak pegawai.</p>
        </div>
      )}
      <form method="get" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.4fr_1fr_auto] lg:items-end" aria-label="Filter penugasan">
        <input type="hidden" name="tab" value="penugasan" />
        <KeepParams values={{ sort: sp.sort, dir: sp.dir, per: sp.per }} />
        <div className="grid gap-2"><Label htmlFor="q">Cari</Label><div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="q" name="q" type="search" defaultValue={sp.q} placeholder="Pegawai, NIP, unit, atau catatan" className="rounded-full pl-9" /></div></div>
        <div className="grid gap-2"><Label htmlFor="jenis">Jenis</Label><NativeSelect id="jenis" name="jenis" defaultValue={sp.jenis ?? ''}><NativeSelectOption value="">Semua</NativeSelectOption><NativeSelectOption value="TETAP">Tetap</NativeSelectOption><NativeSelectOption value="SEMENTARA">Sementara</NativeSelectOption></NativeSelect></div>
        <div className="grid gap-2"><Label htmlFor="jadwal">Jadwal</Label><NativeSelect id="jadwal" name="jadwal" defaultValue={sp.jadwal ?? ''}><NativeSelectOption value="">Semua jadwal</NativeSelectOption>{schedules.map((x) => <NativeSelectOption key={x.id} value={x.id}>{`${x.code}, ${x.name}`}</NativeSelectOption>)}<NativeSelectOption value="LIBUR">Libur</NativeSelectOption></NativeSelect></div>
        <div className="grid gap-2"><Label htmlFor="keadaan">Masa berlaku</Label><NativeSelect id="keadaan" name="keadaan" defaultValue={sp.keadaan ?? ''}><NativeSelectOption value="">Semua</NativeSelectOption><NativeSelectOption value="berlaku">Sedang berlaku</NativeSelectOption><NativeSelectOption value="akan">Akan datang</NativeSelectOption><NativeSelectOption value="berakhir">Sudah berakhir</NativeSelectOption></NativeSelect></div>
        <div className="flex gap-2"><Button type="submit">Terapkan</Button>{filtered && <Button asChild variant="outline"><Link href="?tab=penugasan">Reset</Link></Button>}</div>
      </form>
      <div className="rounded-xl border bg-card">
        <TableToolbar {...sortProps} sorts={[{ value: 'mulai', label: 'Tanggal mulai' }, { value: 'untuk', label: 'Pegawai atau unit' }, { value: 'jadwal', label: 'Jadwal' }]}>
          <span className="tabular-nums">{data.total.toLocaleString('id-ID')}</span> penugasan{filtered ? ' sesuai filter' : ''}
        </TableToolbar>
        <Table className="table-stack">
          <TableHeader><TableRow>
            <SortableHead label="Untuk" value="untuk" {...sortProps} className="pl-4 lg:pl-6" />
            <SortableHead label="Jadwal" value="jadwal" {...sortProps} />
            <TableHead>Jenis</TableHead>
            <SortableHead label="Berlaku" value="mulai" {...sortProps} firstDir="desc" />
            <TableHead>Catatan</TableHead><TableHead className="pr-4 lg:pr-6"><span className="sr-only">Aksi</span></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.rows.length === 0 && <TableRow><TableCell colSpan={6}>{filtered
              ? <EmptyState filtered title="Tidak ada penugasan yang cocok" description="Ubah kata kunci atau filter." actions={[{ href: '?tab=penugasan', label: 'Hapus filter' }]} />
              : <EmptyState title="Belum ada penugasan" description="Tanpa penugasan, pegawai tercatat tanpa jadwal dan status kehadirannya tidak dinilai terlambat atau tidak hadir." />}</TableCell></TableRow>}
            {data.rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="stack-head pl-4 lg:pl-6">{a.employee ? <Link className="font-medium text-primary hover:underline" href={`/pegawai/${a.employee.id}`}>{a.employee.fullName}</Link> : <span className="font-medium">Unit: {a.unit?.name}</span>}</TableCell>
                <TableCell data-label="Jadwal">{a.schedule ? <span className="inline-flex items-center gap-2"><span className="size-3 rounded-sm" style={{ background: a.schedule.color }} aria-hidden />{a.schedule.code}, {a.schedule.name}</span> : 'Libur'}</TableCell>
                <TableCell data-label="Jenis">{a.kind === 'TETAP' ? 'Tetap' : 'Sementara'}</TableCell>
                <TableCell data-label="Berlaku" className="tabular">{fmtTglPendek(fromDbDate(a.startDate))} sampai {a.endDate ? fmtTglPendek(fromDbDate(a.endDate)) : 'seterusnya'}</TableCell>
                <TableCell data-label="Catatan" className="whitespace-normal text-muted-foreground">{a.note || '-'}</TableCell>
                <TableCell className="pr-4 text-right lg:pr-6">{manage && <EndAssignment id={a.id} startDate={fromDbDate(a.startDate)} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pager total={data.total} page={data.page} pageSize={data.pageSize} params={params} />
      </div>
    </>
  );
}

async function HolidaysTab({ actor, manage, year }: { actor: Actor; manage: boolean; year: number }) {
  const [rows, units, settings] = await Promise.all([listHolidays(year), manage ? unitOptions(actor, 'schedule.manage') : [], getSettings()]);
  const allUnits = !!scopeOf(actor, 'schedule.manage')?.all;
  const last = settings['holidays.lastSync'];
  const tz = settings['org.timezone'];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" aria-label="Tahun sebelumnya"><Link href={`?tab=libur&tahun=${year - 1}`}><ChevronLeft /></Link></Button>
          <h2 className="min-w-20 text-center text-lg font-semibold tabular">{year}</h2>
          <Button asChild variant="outline" size="icon" aria-label="Tahun berikutnya"><Link href={`?tab=libur&tahun=${year + 1}`}><ChevronRight /></Link></Button>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            {allUnits && <HolidaySync year={year} />}
            {allUnits && <HolidayImport year={year} />}
            <HolidayForm units={units} canAllUnits={allUnits} />
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {settings['holidays.autoSync']
          ? <>Libur nasional{settings['holidays.includeCutiBersama'] ? ' dan cuti bersama' : ''} diperbarui otomatis setiap hari untuk tahun ini dan tahun depan. </>
          : <>Pembaruan otomatis libur nasional dimatikan di Pengaturan. </>}
        {last && <span className={last.ok ? '' : 'font-medium text-destructive'}>Terakhir {fmtWaktu(new Date(last.at), tz)}: {last.ok ? last.message : `gagal, ${last.message}`}.</span>}
        {' '}Libur yang tidak berlaku di instansi bisa dinonaktifkan tanpa dihapus.
      </p>
      <div className="rounded-xl border bg-card">
        <Table className="table-stack">
          <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Tanggal</TableHead><TableHead>Keterangan</TableHead><TableHead>Jenis</TableHead><TableHead>Berlaku untuk</TableHead><TableHead>Sumber</TableHead><TableHead className="pr-4 lg:pr-6"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6}><EmptyState title={`Belum ada hari libur ${year}`} description={manage && allUnits ? 'Tekan "Perbarui libur nasional" untuk menarik daftar resmi, atau impor berkas bila server tidak terhubung ke internet.' : 'Daftar libur nasional diperbarui otomatis oleh sistem.'} /></TableCell></TableRow>}
            {rows.map((h) => (
              <TableRow key={h.id} className={h.disabled ? 'text-muted-foreground' : undefined}>
                <TableCell className="stack-head pl-4 lg:pl-6"><span className={h.disabled ? 'line-through' : undefined}>{fmtTanggal(fromDbDate(h.date))}</span></TableCell>
                <TableCell data-label="Keterangan" className="whitespace-normal">{h.name}{h.disabled && <span className="ml-2 text-xs font-medium">(nonaktif)</span>}</TableCell>
                <TableCell data-label="Jenis"><Badge variant={h.kind === 'NASIONAL' ? 'default' : 'netral'}>{HOLIDAY_KIND_LABEL[h.kind] ?? h.kind}</Badge></TableCell>
                <TableCell data-label="Berlaku">{h.unit?.name ?? 'Semua unit'}</TableCell>
                <TableCell data-label="Sumber" className="text-muted-foreground">{HOLIDAY_SOURCE_LABEL[h.source] ?? h.source}</TableCell>
                <TableCell className="pr-4 text-right lg:pr-6">
                  {manage && (h.unitId || allUnits) && (
                    <div className="flex justify-end gap-1">
                      {h.source !== 'MANUAL' && <HolidayToggle id={h.id} name={h.name} disabled={h.disabled} />}
                      <ConfirmButton size="sm" label="Hapus" title={`Hapus ${h.name}?`} description={h.source === 'MANUAL' ? 'Rekap tanggal tersebut dihitung ulang sesuai jadwal kerja biasa.' : 'Libur dari sumber otomatis akan muncul lagi saat pembaruan berikutnya. Pakai "Nonaktifkan" bila tanggal ini memang tidak libur di instansi.'} confirmLabel="Hapus" method="DELETE" url={`/api/v1/holidays/${h.id}`} success="Hari libur dihapus." />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/** Tampilan pegawai: jadwalnya sendiri untuk satu bulan. */
async function MySchedule({ actor, month, today }: { actor: Actor; month: string; today: string }) {
  const { from, to } = monthBounds(month);
  const plans = actor.employeeId ? await plansFor(actor.employeeId, from, to) : [];
  const OFF: Record<string, string> = { HARI_LIBUR: 'Hari libur', BUKAN_HARI_KERJA: 'Bukan hari kerja', LIBUR_TERJADWAL: 'Libur terjadwal' };
  return (
    <>
      <PageHeader title="Jadwal Saya" description="Jadwal kerja Anda per hari. Hubungi admin unit bila ada yang tidak sesuai." />
      <PageBody className="grid gap-4">
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" aria-label="Bulan sebelumnya"><Link href={`?bulan=${shiftMonth(month, -1)}`}><ChevronLeft /></Link></Button>
          <h2 className="min-w-40 text-center text-lg font-semibold">{monthLabel(month)}</h2>
          <Button asChild variant="outline" size="icon" aria-label="Bulan berikutnya"><Link href={`?bulan=${shiftMonth(month, 1)}`}><ChevronRight /></Link></Button>
        </div>
        {!actor.employeeId ? <Card><EmptyState title="Akun ini tidak terhubung ke data pegawai" /></Card> : (
          <div className="rounded-xl border bg-card">
            <ul className="divide-y">
              {plans.map((p) => {
                const wd = new Date(`${p.date}T00:00:00Z`).getUTCDay();
                return (
                  <li key={p.date} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 lg:px-6 ${p.date === today ? 'bg-accent/50' : ''}`} aria-current={p.date === today ? 'date' : undefined}>
                    <span className="min-w-44"><span className="font-medium">{HARI[wd]}, {fmtTglPendek(p.date, false)}</span>{p.date === today && <span className="ml-2 text-xs font-semibold text-primary">Hari ini</span>}</span>
                    <span className={p.isOffDay || !p.schedule ? 'text-muted-foreground' : 'tabular'}>
                      {p.isOffDay ? (p.holidayName ?? OFF[p.offReason ?? ''] ?? 'Libur') : p.schedule ? `${p.schedule.code}, ${p.schedule.checkIn} sampai ${p.schedule.checkOut}` : 'Tanpa jadwal'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </PageBody>
    </>
  );
}
