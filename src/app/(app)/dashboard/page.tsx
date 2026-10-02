import Link from 'next/link';
import { ChevronRight, FilePen, MapPin, Plane, ScanFace } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { TrendChart } from '@/components/app/trend-chart';
import { BarList } from '@/components/app/bar-list';
import { Dayline } from '@/components/app/dayline';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { adminDashboard, employeeDashboard } from '@/lib/services/dashboard';
import { monitoring } from '@/lib/services/reports';
import { RegisterBar } from '@/components/app/register-bar';
import { TodayBoard, type BoardRow } from '@/components/app/today-board';
import { FilterPopover } from '@/components/app/filter-popover';
import { unitOptions } from '@/lib/services/units';
import { CATEGORY_LABEL } from '@/lib/services/reports';
import { METHOD_LABEL, STATUS_LABEL } from '@/lib/attendance/engine';
import { BULAN, HARI_PENDEK, fmtJam, fmtTanggal, fmtTglPendek, fmtWaktu, fromDbDate, isValidDate, zonedParts } from '@/lib/time';
import { OUTCOME_MESSAGE, type Outcome } from '@/lib/services/attendance';

export const metadata = { title: 'Dashboard' };

type SP = Promise<Record<string, string | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const actor = await requirePage();
  const sp = await searchParams;
  if (can(actor, 'dashboard.view')) return <AdminDashboard actorId={actor.userId} sp={sp} />;
  if (actor.employeeId) return <EmployeeDashboard />;
  return (
    <PageBody><EmptyState title="Belum ada akses" description="Akun ini belum memiliki peran. Hubungi administrator untuk penugasan peran." /></PageBody>
  );
}

const SUMMARY_ORDER = ['HADIR', 'DINAS_LUAR', 'TERLAMBAT', 'IZIN_CUTI', 'TIDAK_HADIR', 'BELUM_ABSEN'] as const;
// Urutan papan: yang perlu dicek dulu di atas.
const BOARD_ORDER: Record<string, number> = { BELUM_ABSEN: 0, TERLAMBAT: 1, TIDAK_HADIR: 2, DINAS_LUAR: 3, IZIN_CUTI: 4, HADIR: 5 };
const BOARD_LIMIT = 15;

async function AdminDashboard({ sp }: { actorId: string; sp: Record<string, string | undefined> }) {
  const actor = await requirePage(['dashboard.view']);
  const f = {
    date: isValidDate(sp.tanggal) ? sp.tanggal : undefined,
    days: Number(sp.hari) || 30,
    unitId: sp.unit || undefined,
    employmentStatus: sp.status || undefined,
    method: sp.metode || undefined,
  };
  const [d, units] = await Promise.all([adminDashboard(actor, f), unitOptions(actor, 'dashboard.view')]);
  const canMonitor = can(actor, 'attendance.monitor');
  const mon = canMonitor ? await monitoring(actor, { date: d.date, unitId: f.unitId ?? '' }) : null;
  const filtered = !!(f.unitId || f.employmentStatus || f.method);
  const scheduled = SUMMARY_ORDER.reduce((n, k) => n + d.summary[k], 0);
  const isToday = d.date === d.today;
  const now = isToday ? zonedParts(new Date(), d.tz).time.slice(0, 5) : null;
  const unitName = units.find((u) => u.id === f.unitId)?.name;
  const filterSummary = [unitName, f.employmentStatus, f.method ? METHOD_LABEL[f.method] : null].filter(Boolean).join(', ') || 'Semua unit';
  const monitorHref = (k: string) => `/absensi/monitoring?tanggal=${d.date}&kategori=${k}${f.unitId ? `&unit=${f.unitId}` : ''}`;
  const boardRows: BoardRow[] = (mon?.rows ?? [])
    .filter((r) => r.category !== 'LIBUR')
    .sort((a, b) => (BOARD_ORDER[a.category] ?? 9) - (BOARD_ORDER[b.category] ?? 9) || a.employee.fullName.localeCompare(b.employee.fullName))
    .map((r) => ({
      id: r.employee.id, name: r.employee.fullName, unit: r.employee.unit?.name ?? null, href: `/absensi/rekap/${r.employee.id}/${d.date}`,
      category: r.category, status: r.record?.status ?? 'TANPA_TRANSAKSI',
      scheduleIn: r.plan.schedule?.checkIn ?? null, scheduleOut: r.plan.schedule?.checkOut ?? null,
      checkIn: fmtJam(r.record?.checkInAt, d.tz), checkOut: fmtJam(r.record?.checkOutAt, d.tz), late: (r.record?.lateMinutes ?? 0) > 0,
    }));
  const actions = [
    { n: d.pending.corrections, label: 'Koreksi absensi', href: '/absensi/koreksi?lihat=tinjau', show: can(actor, 'correction.review') },
    { n: d.pending.leave, label: 'Cuti dan izin', href: '/cuti?lihat=persetujuan', show: can(actor, 'leave.approve') || can(actor, 'leave.manage') },
    { n: d.pending.biometrics, label: 'Pendaftaran wajah', href: '/pegawai?face=menunggu', show: can(actor, 'biometric.manage') },
  ].filter((x) => x.show);
  const decisions = (className: string) => actions.length > 0 && (
<Card className={`gap-3 ${className}`}>
              <CardHeader><CardTitle>Menunggu keputusan Anda</CardTitle></CardHeader>
              <CardContent>
                <ul className="-mx-2 grid">
                  {actions.map((x) => (
                    <li key={x.href}>
                      <Link href={x.href} className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 hover:bg-accent/60">
                        <span className={x.n ? 'font-medium' : 'text-muted-foreground'}>{x.label}</span>
                        {x.n ? <Badge variant="highlight" className="tabular">{x.n}</Badge> : <span className="text-sm text-muted-foreground">Tidak ada</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
  );
  const offline = d.devices.filter((x) => x.isActive && x.status === 'OFFLINE');

  return (
    <>
      <PageHeader
        title={isToday ? fmtTanggal(d.date) : `Kehadiran ${fmtTanggal(d.date)}`}
        description={`${d.totals.active} pegawai aktif${filtered ? ' sesuai filter' : ' dalam kewenangan Anda'}. ${scheduled} dijadwalkan bekerja${d.summary.LIBUR ? `, ${d.summary.LIBUR} libur atau tanpa jadwal` : ''}.`}
        actions={
          <>
            <FilterPopover summary={filterSummary}>
              <form method="get" className="grid gap-3" aria-label="Filter dashboard">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2"><Label htmlFor="tanggal">Tanggal</Label><Input id="tanggal" name="tanggal" type="date" defaultValue={d.date} max={d.today} /></div>
                  <div className="grid gap-2"><Label htmlFor="hari">Periode tren</Label>
                    <NativeSelect id="hari" name="hari" defaultValue={String(f.days)}>{[7, 30, 60, 90].map((n) => <NativeSelectOption key={n} value={n}>{n} hari</NativeSelectOption>)}</NativeSelect>
                  </div>
                </div>
                <div className="grid gap-2"><Label htmlFor="unit">Unit kerja</Label>
                  <NativeSelect id="unit" name="unit" defaultValue={f.unitId ?? ''}><NativeSelectOption value="">Semua unit dalam kewenangan</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2"><Label htmlFor="status">Status kepegawaian</Label>
                    <NativeSelect id="status" name="status" defaultValue={f.employmentStatus ?? ''}><NativeSelectOption value="">Semua</NativeSelectOption>{d.byStatus.filter((s) => s.name !== 'Belum diisi').map((s) => <NativeSelectOption key={s.name} value={s.name}>{s.name}</NativeSelectOption>)}</NativeSelect>
                  </div>
                  <div className="grid gap-2"><Label htmlFor="metode">Metode absensi</Label>
                    <NativeSelect id="metode" name="metode" defaultValue={f.method ?? ''}><NativeSelectOption value="">Semua</NativeSelectOption>{Object.entries(METHOD_LABEL).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}</NativeSelect>
                  </div>
                </div>
                <div className="flex gap-2"><Button type="submit">Terapkan</Button>{(filtered || !isToday) && <Button asChild variant="outline"><Link href="/dashboard">Kembali ke hari ini</Link></Button>}</div>
              </form>
            </FilterPopover>
            {actor.employeeId && <Button asChild><Link href="/absensi/saya"><ScanFace />Absensi saya</Link></Button>}
          </>
        }
      />
      <PageBody className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="grid min-w-0 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Kehadiran {isToday ? 'hari ini' : fmtTglPendek(d.date)}</CardTitle>
              <CardDescription>Dari {scheduled} pegawai yang dijadwalkan bekerja. Belum ada transaksi belum tentu tidak hadir.</CardDescription>
            </CardHeader>
            <CardContent>
              <RegisterBar total={scheduled} hrefFor={monitorHref} items={SUMMARY_ORDER.map((k) => ({ key: k, label: CATEGORY_LABEL[k], count: d.summary[k] }))} />
            </CardContent>
          </Card>

          {decisions('xl:hidden')}

          {mon && (
            <Card className="gap-3">
              <CardHeader>
                <CardTitle>Papan {isToday ? 'hari ini' : fmtTglPendek(d.date)}</CardTitle>
                <CardDescription>Yang belum ada transaksi dan terlambat ditampilkan paling atas.</CardDescription>
                <CardAction><Button asChild variant="ghost" size="sm"><Link href={`/absensi/monitoring?tanggal=${d.date}${f.unitId ? `&unit=${f.unitId}` : ''}`}>Monitoring</Link></Button></CardAction>
              </CardHeader>
              <CardContent>
                {boardRows.length ? (
                  <>
                    <TodayBoard rows={boardRows.slice(0, BOARD_LIMIT)} now={now} />
                    {boardRows.length > BOARD_LIMIT && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {BOARD_LIMIT} dari {boardRows.length} pegawai ditampilkan. <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/absensi/monitoring?tanggal=${d.date}${f.unitId ? `&unit=${f.unitId}` : ''}`}>Lihat semua di Monitoring</Link>
                      </p>
                    )}
                  </>
                ) : <EmptyState title="Tidak ada pegawai yang dijadwalkan" description="Atur jadwal kerja agar papan kehadiran terisi." actions={[{ href: '/jadwal', label: 'Buka jadwal kerja' }]} />}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Tren {f.days} hari</CardTitle>
              <CardDescription>Jumlah pegawai per kategori per hari, {fmtTglPendek(d.from)} sampai {fmtTglPendek(d.date)}.</CardDescription>
            </CardHeader>
            <CardContent>
              {d.trend.some((t) => t.dijadwalkan || t.hadir || t.terlambat || t.izin) ? (
                <>
                  <TrendChart data={d.trend} />
                  <details className="mt-3 text-sm">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary">Lihat sebagai tabel</summary>
                    <div className="mt-2 max-h-72 overflow-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">Tanggal</th><th className="p-2 text-right">Dijadwalkan</th><th className="p-2 text-right">Hadir</th><th className="p-2 text-right">Terlambat</th><th className="p-2 text-right">Izin/sakit/cuti</th><th className="p-2 text-right">Belum ada transaksi</th></tr></thead>
                        <tbody>{d.trend.map((t) => <tr key={t.date} className="border-t"><td className="p-2">{fmtTglPendek(t.date)}</td><td className="p-2 text-right">{t.dijadwalkan}</td><td className="p-2 text-right">{t.hadir}</td><td className="p-2 text-right">{t.terlambat}</td><td className="p-2 text-right">{t.izin}</td><td className="p-2 text-right">{t.tanpaTransaksi}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </details>
                </>
              ) : <EmptyState title="Belum ada data kehadiran" description="Tren muncul setelah ada jadwal kerja dan transaksi absensi pada periode ini." />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Komposisi pegawai aktif</CardTitle></CardHeader>
            <CardContent className="grid gap-8 md:grid-cols-2">
              <section aria-labelledby="per-unit"><h3 id="per-unit" className="mb-3 text-sm font-semibold">Per unit kerja</h3>{d.byUnit.length ? <BarList items={d.byUnit.slice(0, 8)} total={d.totals.active} /> : <p className="text-sm text-muted-foreground">Belum ada pegawai.</p>}</section>
              <section aria-labelledby="per-status"><h3 id="per-status" className="mb-3 text-sm font-semibold">Per status kepegawaian</h3>{d.byStatus.length ? <BarList items={d.byStatus} total={d.totals.active} /> : <p className="text-sm text-muted-foreground">Belum ada pegawai.</p>}</section>
            </CardContent>
          </Card>
        </div>

        <aside className="grid min-w-0 gap-6" aria-label="Perlu tindakan dan status">
          {decisions('hidden xl:flex')}
          {can(actor, 'device.read') && (
            <Card className="gap-3">
              <CardHeader>
                <CardTitle>Mesin absensi</CardTitle>
                {offline.length > 0 && <CardDescription className="font-medium text-destructive">{offline.length} mesin tidak terhubung</CardDescription>}
                <CardAction><Button asChild variant="ghost" size="sm"><Link href="/perangkat">Kelola</Link></Button></CardAction>
              </CardHeader>
              <CardContent>
                {d.devices.length ? (
                  <ul className="-mx-2 grid">
                    {d.devices.map((x) => (
                      <li key={x.id}>
                        <Link href={`/perangkat/${x.id}`} className="grid min-h-11 grid-cols-[1fr_auto] items-center gap-x-3 rounded-md px-2 py-1.5 hover:bg-accent/60">
                          <span className="min-w-0 truncate text-sm font-medium">{x.name}</span>
                          <StatusBadge status={x.isActive ? x.status : 'UNKNOWN'} label={x.isActive ? undefined : 'Nonaktif'} />
                          <span className="col-span-2 text-xs text-muted-foreground">{x.lastSyncAt ? `Sinkron ${fmtWaktu(x.lastSyncAt, d.tz)}` : 'Belum pernah sinkron'}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <EmptyState title="Belum ada mesin absensi" actions={[{ href: '/perangkat', label: 'Tambah mesin' }]} />}
              </CardContent>
            </Card>
          )}

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Perlu ditinjau</CardTitle>
              <CardDescription>7 hari terakhir. Verifikasi gagal bukan pelanggaran; periksa dulu sebelum menindaklanjuti.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {(d.anomalies.unmatchedRaw > 0 || d.anomalies.skewed > 0) && (
                <ul className="grid gap-1">
                  {d.anomalies.unmatchedRaw > 0 && <li><Link className="font-medium text-primary underline-offset-4 hover:underline" href="/perangkat/sinkronisasi">{d.anomalies.unmatchedRaw} scan mesin belum terhubung ke pegawai</Link></li>}
                  {d.anomalies.skewed > 0 && <li><Link className="font-medium text-primary underline-offset-4 hover:underline" href="/perangkat/log">{d.anomalies.skewed} scan dengan jam mesin menyimpang</Link></li>}
                </ul>
              )}
              {d.anomalies.reviewRecords.length > 0 && (
                <ul className="-mx-2 grid">
                  {d.anomalies.reviewRecords.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <Link href={`/absensi/rekap/${r.employee.id}/${fromDbDate(r.workDate)}`} className="block rounded-md px-2 py-1.5 hover:bg-accent/60">
                        <span className="flex justify-between gap-3"><span className="truncate font-medium">{r.employee.fullName}</span><span className="shrink-0 text-muted-foreground">{fmtTglPendek(fromDbDate(r.workDate), false)}</span></span>
                        <span className="block text-xs text-muted-foreground">{r.reviewReason}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {d.anomalies.failedEvents.length > 0 && (
                <div>
                  <h3 className="mb-1 font-semibold">Verifikasi absensi gagal</h3>
                  <ul className="grid gap-2">
                    {d.anomalies.failedEvents.slice(0, 5).map((e) => (
                      <li key={e.id}>
                        <span className="flex justify-between gap-3"><span className="truncate">{e.employee?.fullName ?? 'Wajah tidak dikenali'}</span><span className="shrink-0 text-muted-foreground">{fmtWaktu(e.occurredAt, d.tz)}</span></span>
                        <span className="block text-xs text-muted-foreground">{OUTCOME_MESSAGE[e.verification?.outcome as Outcome]?.split('.')[0] ?? e.verification?.outcome}, lewat {(METHOD_LABEL[e.method] ?? e.method).toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!d.anomalies.unmatchedRaw && !d.anomalies.skewed && !d.anomalies.reviewRecords.length && !d.anomalies.failedEvents.length && <p className="text-muted-foreground">Tidak ada yang perlu ditinjau.</p>}
            </CardContent>
          </Card>
        </aside>
      </PageBody>
    </>
  );
}

async function EmployeeDashboard() {
  const actor = await requirePage(['attendance.self']);
  const d = await employeeDashboard(actor);
  const p = d.plan;
  const rec = d.todayRec;
  const workday = !!p.schedule && !p.isOffDay;
  const next = d.openOvernight ? 'Absen pulang shift kemarin' : !rec?.checkInAt ? (workday ? 'Absen masuk' : null) : !rec.checkOutAt ? 'Absen pulang' : null;
  const checkIn = fmtJam(rec?.checkInAt, d.tz);
  const checkOut = fmtJam(rec?.checkOutAt, d.tz);
  const firstName = d.employee.fullName.split(' ')[0];
  return (
    <>
      <PageHeader title={`Halo, ${firstName}`} description={<>{fmtTanggal(d.today)}<span className="block">{[d.employee.position, d.employee.unit?.name].filter(Boolean).join(', ')}</span></>} />
      <PageBody className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Card className="gap-0 overflow-hidden py-0">
            <div className="grid gap-5 p-4 sm:p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-base font-semibold">Absensi hari ini</h2>
                <p className="text-sm text-muted-foreground">
                  {p.isOffDay ? (p.holidayName ?? 'Libur') : p.schedule ? `${p.schedule.name}, ${p.schedule.checkIn} sampai ${p.schedule.checkOut}` : 'Tidak ada jadwal kerja'}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">Masuk</dt>
                  <dd className={`clock mt-1 text-[2.75rem] ${checkIn ? '' : 'text-muted-foreground/50'}`}>{checkIn ?? '--:--'}</dd>
                  {rec && rec.lateMinutes > 0 && <dd className="mt-1 text-sm font-medium text-[#b4501f]">Terlambat {rec.lateMinutes} menit</dd>}
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Pulang</dt>
                  <dd className={`clock mt-1 text-[2.75rem] ${checkOut ? '' : 'text-muted-foreground/50'}`}>{checkOut ?? '--:--'}</dd>
                  {rec && rec.earlyLeaveMinutes > 0 && <dd className="mt-1 text-sm font-medium text-[#b4501f]">Pulang awal {rec.earlyLeaveMinutes} menit</dd>}
                </div>
              </dl>
              {workday && (
                <div>
                  <Dayline scheduleIn={p.schedule!.checkIn} scheduleOut={p.schedule!.checkOut} checkIn={checkIn} checkOut={checkOut} late={(rec?.lateMinutes ?? 0) > 0} now={d.now} />
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground tabular" aria-hidden><span>05.00</span><span>13.30</span><span>22.00</span></div>
                </div>
              )}
              {rec && <p className="flex items-center gap-2 text-sm">Status <StatusBadge status={rec.status} />{p.schedule && <span className="text-muted-foreground">toleransi terlambat {p.schedule.lateToleranceMin} menit</span>}</p>}
              {next ? (
                <Button asChild size="lg" variant="highlight" className="h-14 w-full text-base font-semibold"><Link href="/absensi/saya"><ScanFace className="size-5" />{next}</Link></Button>
              ) : (
                <p className="rounded-lg bg-muted px-4 py-3 text-sm">{p.isOffDay ? 'Hari ini libur. Tidak perlu absen.' : rec?.checkOutAt ? 'Absen masuk dan pulang hari ini sudah tercatat.' : 'Tidak ada jadwal kerja hari ini. Hubungi admin bila seharusnya ada.'}</p>
              )}
            </div>
            <nav aria-label="Aksi lain" className="grid border-t sm:grid-cols-3">
              {[
                { href: '/dinas-luar', label: 'Absen dinas luar', icon: MapPin },
                { href: '/absensi/koreksi/baru', label: 'Ajukan koreksi', icon: FilePen },
                { href: '/cuti/baru', label: 'Ajukan cuti atau izin', icon: Plane },
              ].map((a) => (
                <Link key={a.href} href={a.href} className="flex min-h-12 items-center gap-3 border-b px-4 text-sm font-medium last:border-b-0 hover:bg-accent/50 sm:justify-center sm:border-r sm:border-b-0 sm:last:border-r-0">
                  <a.icon className="size-4 text-primary" aria-hidden />{a.label}<ChevronRight className="ml-auto size-4 text-muted-foreground sm:hidden" aria-hidden />
                </Link>
              ))}
            </nav>
          </Card>

          {d.faceStatus !== 'ACTIVE' && (
            <Alert variant="warning">
              <ScanFace />
              <AlertTitle>{d.faceStatus === 'PENDING_VERIFICATION' ? 'Pendaftaran wajah menunggu verifikasi' : 'Wajah belum terdaftar'}</AlertTitle>
              <AlertDescription>
                <p>{d.faceStatus === 'PENDING_VERIFICATION' ? 'Petugas kepegawaian akan memverifikasi. Sementara itu, absen lewat mesin atau petugas.' : 'Daftarkan wajah agar bisa absen dari ponsel. Sampai saat itu, absen lewat mesin atau petugas.'}</p>
                {!d.faceStatus && <Button asChild size="sm" className="mt-2"><Link href="/absensi/saya/wajah">Daftarkan wajah</Link></Button>}
              </AlertDescription>
            </Alert>
          )}

          <Card className="gap-3">
            <CardHeader><CardTitle>Minggu ini</CardTitle></CardHeader>
            <CardContent>
              <ol className="grid grid-cols-7 gap-1.5 text-center">
                {d.upcoming.map((u) => {
                  const dt = new Date(`${u.date}T00:00:00Z`);
                  const isToday = u.date === d.today;
                  const off = u.isOffDay || !u.schedule;
                  return (
                    <li key={u.date} aria-current={isToday ? 'date' : undefined} className={`rounded-lg border px-0.5 py-2 ${isToday ? 'border-primary bg-accent' : off ? 'bg-muted/60' : ''}`} title={u.holidayName ?? undefined}>
                      <span className="block text-xs text-muted-foreground">{HARI_PENDEK[dt.getUTCDay()]}</span>
                      <span className="block text-lg font-bold tabular">{dt.getUTCDate()}</span>
                      <span className="block text-[11px] leading-tight text-muted-foreground tabular">{off ? 'Libur' : u.schedule!.checkIn.replace(':', '.')}</span>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader><CardTitle>Riwayat terakhir</CardTitle><CardAction><Button asChild variant="ghost" size="sm"><Link href="/absensi/saya">Semua</Link></Button></CardAction></CardHeader>
            <CardContent>
              {d.recent.length ? (
                <ul className="divide-y">
                  {d.recent.map((r) => (
                    <li key={r.id}>
                      <Link href={`/absensi/rekap/${d.employee.id}/${fromDbDate(r.workDate)}`} className="grid min-h-12 grid-cols-[1fr_auto_auto] items-center gap-3 py-2 text-sm hover:bg-accent/40">
                        <span>{fmtTglPendek(fromDbDate(r.workDate), false)}</span>
                        <span className="tabular text-muted-foreground">{fmtJam(r.checkInAt, d.tz) ?? '--:--'} sampai {fmtJam(r.checkOutAt, d.tz) ?? '--:--'}</span>
                        <StatusBadge status={r.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="Belum ada absensi" description="Riwayat muncul setelah absen pertama, lewat wajah, mesin, atau petugas." />}
            </CardContent>
          </Card>
        </div>

        <aside className="grid min-w-0 gap-6" aria-label="Ringkasan bulan ini dan pengajuan">
          <Card className="gap-3">
            <CardHeader><CardTitle>{BULAN[Number(d.today.slice(5, 7)) - 1]}</CardTitle><CardDescription>Sampai hari ini, dari {d.month.scheduled} hari kerja terjadwal.</CardDescription></CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {[
                  ['Hadir', d.month.present],
                  ['Terlambat', d.month.late],
                  ['Izin, sakit, cuti', d.month.leave],
                  ['Belum ada transaksi', d.month.noRecord],
                ].map(([k, v]) => <div key={String(k)}><dt className="text-sm text-muted-foreground">{k}</dt><dd className="text-2xl font-bold tabular">{v}</dd></div>)}
              </dl>
              {d.month.noRecord > 0 && <p className="mt-3 text-sm text-muted-foreground">Ada hari tanpa transaksi? Periksa <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/absensi/saya">riwayat</Link>, lalu ajukan koreksi bila perlu.</p>}
            </CardContent>
          </Card>

          {d.balances.length > 0 && (
            <Card className="gap-3">
              <CardHeader><CardTitle>Saldo cuti {d.today.slice(0, 4)}</CardTitle></CardHeader>
              <CardContent>
                <ul className="grid gap-3">
                  {d.balances.map((b) => (
                    <li key={b.leaveType.id}>
                      {b.configured ? (
                        <>
                          <div className="flex items-baseline justify-between gap-3 text-sm"><span>{b.leaveType.name}</span><span className="tabular"><b className="text-lg">{b.remaining}</b> dari {b.entitled} hari</span></div>
                          <div className="mt-1 h-1.5 rounded-full bg-muted" aria-hidden><div className="h-1.5 rounded-full bg-[#1baf7a]" style={{ width: `${Math.max(0, (b.remaining / Math.max(1, b.entitled)) * 100)}%` }} /></div>
                          {b.reserved > 0 && <p className="mt-1 text-xs text-muted-foreground">{b.reserved} hari menunggu persetujuan</p>}
                        </>
                      ) : <div className="flex justify-between gap-3 text-sm"><span>{b.leaveType.name}</span><span className="text-muted-foreground">Belum diatur</span></div>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="gap-3">
            <CardHeader><CardTitle>Pengajuan</CardTitle></CardHeader>
            <CardContent>
              {d.corrections.length || d.leaves.length ? (
                <ul className="divide-y text-sm">
                  {d.leaves.map((l) => <li key={l.id}><Link href={`/cuti/${l.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:bg-accent/40"><span>{l.leaveType.name}<span className="block text-xs text-muted-foreground">{fmtTglPendek(fromDbDate(l.startDate), false)} sampai {fmtTglPendek(fromDbDate(l.endDate))}</span></span><StatusBadge status={l.status} /></Link></li>)}
                  {d.corrections.map((c) => <li key={c.id}><Link href={`/absensi/koreksi/${c.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 hover:bg-accent/40"><span>Koreksi {fmtTglPendek(fromDbDate(c.workDate))}{c.proposedStatus && <span className="block text-xs text-muted-foreground">{STATUS_LABEL[c.proposedStatus] ?? ''}</span>}</span><StatusBadge status={c.status} /></Link></li>)}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Belum ada pengajuan koreksi, cuti, atau izin.</p>}
            </CardContent>
          </Card>
        </aside>
      </PageBody>
    </>
  );
}
