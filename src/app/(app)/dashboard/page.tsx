import Link from 'next/link';
import { AlertTriangle, ArrowRight, Fingerprint, ScanFace } from 'lucide-react';
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
import { unitOptions } from '@/lib/services/units';
import { CATEGORY_LABEL } from '@/lib/services/reports';
import { METHOD_LABEL, STATUS_LABEL } from '@/lib/attendance/engine';
import { fmtJam, fmtTanggal, fmtTglPendek, fmtWaktu, fromDbDate, isValidDate } from '@/lib/time';
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

const SUMMARY_ORDER = ['HADIR', 'TERLAMBAT', 'DINAS_LUAR', 'IZIN_CUTI', 'TIDAK_HADIR', 'BELUM_ABSEN'] as const;

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
  const filtered = !!(f.unitId || f.employmentStatus || f.method);
  const scheduled = SUMMARY_ORDER.reduce((n, k) => n + d.summary[k], 0);
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${fmtTanggal(d.date)} · ${d.totals.active} pegawai aktif${filtered ? ' sesuai filter' : ''}`}
        actions={actor.employeeId ? <Button asChild><Link href="/absensi/saya"><ScanFace />Absensi saya</Link></Button> : undefined}
      />
      <PageBody className="grid gap-6">
        <form method="get" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr_1fr_1fr_auto] lg:items-end" aria-label="Filter dashboard">
          <div className="grid gap-2"><Label htmlFor="tanggal">Tanggal</Label><Input id="tanggal" name="tanggal" type="date" defaultValue={d.date} max={d.date} /></div>
          <div className="grid gap-2"><Label htmlFor="hari">Periode tren</Label>
            <NativeSelect id="hari" name="hari" defaultValue={String(f.days)}>
              {[7, 30, 60, 90].map((n) => <NativeSelectOption key={n} value={n}>{n} hari</NativeSelectOption>)}
            </NativeSelect>
          </div>
          <div className="grid gap-2"><Label htmlFor="unit">Unit kerja</Label>
            <NativeSelect id="unit" name="unit" defaultValue={f.unitId ?? ''}>
              <NativeSelectOption value="">Semua unit dalam kewenangan</NativeSelectOption>
              {units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          <div className="grid gap-2"><Label htmlFor="status">Status kepegawaian</Label>
            <NativeSelect id="status" name="status" defaultValue={f.employmentStatus ?? ''}>
              <NativeSelectOption value="">Semua</NativeSelectOption>
              {d.byStatus.map((s) => <NativeSelectOption key={s.name} value={s.name === 'Belum diisi' ? '' : s.name}>{s.name}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          <div className="grid gap-2"><Label htmlFor="metode">Metode absensi</Label>
            <NativeSelect id="metode" name="metode" defaultValue={f.method ?? ''}>
              <NativeSelectOption value="">Semua metode</NativeSelectOption>
              {Object.entries(METHOD_LABEL).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
            </NativeSelect>
          </div>
          <div className="flex gap-2"><Button type="submit">Terapkan</Button>{filtered && <Button asChild variant="outline"><Link href="/dashboard">Reset</Link></Button>}</div>
        </form>

        <section aria-labelledby="ringkasan" className="grid gap-3">
          <h2 id="ringkasan" className="text-lg font-semibold">Kehadiran {d.date === d.today ? 'hari ini' : fmtTglPendek(d.date)}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {SUMMARY_ORDER.map((k) => (
              <Link key={k} href={`/absensi/monitoring?tanggal=${d.date}&kategori=${k}${f.unitId ? `&unit=${f.unitId}` : ''}`} className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/40">
                <div className="text-sm text-muted-foreground">{CATEGORY_LABEL[k]}</div>
                <div className="mt-1 text-3xl font-bold tabular">{d.summary[k]}</div>
                {k === 'BELUM_ABSEN' && <div className="mt-1 text-xs text-muted-foreground">bukan otomatis tidak hadir</div>}
              </Link>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{scheduled} pegawai dijadwalkan bekerja, {d.summary.LIBUR} libur atau tanpa jadwal.</p>
        </section>

        <div className="grid gap-6 xl:grid-cols-[2fr_1fr] [&>*]:min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>Tren kehadiran {f.days} hari</CardTitle>
              <CardDescription>{fmtTglPendek(d.from)} sampai {fmtTglPendek(d.date)}. Jumlah pegawai per kategori per hari.</CardDescription>
            </CardHeader>
            <CardContent>
              {d.trend.some((t) => t.dijadwalkan || t.hadir || t.terlambat || t.izin) ? (
                <>
                  <TrendChart data={d.trend} />
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium text-primary">Lihat sebagai tabel</summary>
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
            <CardHeader><CardTitle>Perlu tindakan</CardTitle><CardDescription>Pengajuan yang menunggu Anda.</CardDescription></CardHeader>
            <CardContent className="grid gap-2">
              {[
                { n: d.pending.corrections, label: 'Koreksi absensi', href: '/absensi/koreksi?lihat=tinjau', show: can(actor, 'correction.review') },
                { n: d.pending.leave, label: 'Cuti dan izin', href: '/cuti?lihat=persetujuan', show: can(actor, 'leave.approve') || can(actor, 'leave.manage') },
                { n: d.pending.biometrics, label: 'Verifikasi pendaftaran wajah', href: '/pegawai?wajah=menunggu', show: can(actor, 'biometric.manage') },
              ].filter((x) => x.show).map((x) => (
                <Link key={x.href} href={x.href} className="flex min-h-11 items-center justify-between rounded-lg border px-3 py-2 hover:bg-accent/40">
                  <span>{x.label}</span>
                  <span className="flex shrink-0 items-center gap-2">{x.n ? <Badge variant="highlight">{x.n}</Badge> : <span className="text-sm whitespace-nowrap text-muted-foreground">Tidak ada</span>}<ArrowRight className="size-4 text-muted-foreground" /></span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
          <Card>
            <CardHeader><CardTitle>Pegawai per unit</CardTitle></CardHeader>
            <CardContent>{d.byUnit.length ? <BarList items={d.byUnit.slice(0, 10)} total={d.totals.active} /> : <EmptyState title="Belum ada pegawai" />}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Pegawai per status kepegawaian</CardTitle></CardHeader>
            <CardContent>{d.byStatus.length ? <BarList items={d.byStatus} total={d.totals.active} /> : <EmptyState title="Belum ada pegawai" />}</CardContent>
          </Card>
          {can(actor, 'device.read') && (
            <Card>
              <CardHeader><CardTitle>Perangkat absensi</CardTitle><CardAction><Button asChild variant="ghost" size="sm"><Link href="/perangkat">Kelola</Link></Button></CardAction></CardHeader>
              <CardContent className="grid gap-2">
                {d.devices.length ? d.devices.map((x) => (
                  <Link key={x.id} href={`/perangkat/${x.id}`} className="flex min-h-11 items-start justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/40">
                    <span className="flex min-w-0 items-start gap-2">
                      <Fingerprint className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0"><span className="block truncate">{x.name}</span><span className="block text-xs text-muted-foreground">{x.lastSyncAt ? `Sinkron ${fmtWaktu(x.lastSyncAt, d.tz)}` : 'Belum pernah sinkron'}</span></span>
                    </span>
                    <StatusBadge status={x.isActive ? x.status : 'UNKNOWN'} label={x.isActive ? undefined : 'Nonaktif'} className="shrink-0" />
                  </Link>
                )) : <EmptyState title="Belum ada perangkat" actions={[{ href: '/perangkat', label: 'Tambah perangkat' }]} />}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-status-telat-foreground" />Anomali 7 hari terakhir</CardTitle>
            <CardDescription>
              {d.anomalies.unmatchedRaw ? `${d.anomalies.unmatchedRaw} scan mesin belum terhubung ke pegawai. ` : ''}
              {d.anomalies.skewed ? `${d.anomalies.skewed} scan dengan jam perangkat menyimpang. ` : ''}
              Kegagalan verifikasi tidak otomatis dianggap pelanggaran; tinjau sebelum mengambil tindakan.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Rekap yang perlu ditinjau</h3>
              {d.anomalies.reviewRecords.length ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {d.anomalies.reviewRecords.map((r) => (
                    <li key={r.id}><Link href={`/absensi/rekap/${r.employee.id}/${fromDbDate(r.workDate)}`} className="flex min-h-11 justify-between gap-3 px-3 py-2 hover:bg-accent/40"><span>{r.employee.fullName}<span className="block text-xs text-muted-foreground">{r.reviewReason}</span></span><span className="shrink-0 text-muted-foreground">{fmtTglPendek(fromDbDate(r.workDate), false)}</span></Link></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Tidak ada.</p>}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Verifikasi absensi gagal</h3>
              {d.anomalies.failedEvents.length ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {d.anomalies.failedEvents.map((e) => (
                    <li key={e.id} className="flex justify-between gap-3 px-3 py-2">
                      <span>{e.employee?.fullName ?? 'Tidak dikenali'}<span className="block text-xs text-muted-foreground">{OUTCOME_MESSAGE[e.verification?.outcome as Outcome]?.split('.')[0] ?? e.verification?.outcome} · {METHOD_LABEL[e.method] ?? e.method}</span></span>
                      <span className="shrink-0 text-muted-foreground">{fmtWaktu(e.occurredAt, d.tz)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Tidak ada.</p>}
            </div>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

async function EmployeeDashboard() {
  const actor = await requirePage(['attendance.self']);
  const d = await employeeDashboard(actor);
  const p = d.plan;
  const rec = d.todayRec;
  const next = d.openOvernight ? 'Absen pulang shift kemarin' : !rec?.checkInAt ? (p.schedule && !p.isOffDay ? 'Absen masuk sekarang' : null) : !rec.checkOutAt ? 'Absen pulang' : null;
  return (
    <>
      <PageHeader
        title={`Halo, ${d.employee.fullName}`}
        description={[fmtTanggal(d.today), d.employee.position, d.employee.unit?.name].filter(Boolean).join(' · ')}
        actions={next ? <Button asChild size="lg" className="h-12 w-full text-base sm:w-auto"><Link href="/absensi/saya"><ScanFace />{next}</Link></Button> : undefined}
      />
      <PageBody className="grid gap-6">
        {d.faceStatus !== 'ACTIVE' && (
          <Card className="border-status-telat-foreground/25 bg-status-telat">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 text-status-telat-foreground">
              <span>{d.faceStatus === 'PENDING_VERIFICATION' ? 'Pendaftaran wajah Anda menunggu verifikasi petugas.' : 'Wajah Anda belum terdaftar, jadi absen wajah belum bisa dipakai. Anda tetap bisa absen di mesin atau lewat petugas.'}</span>
              {!d.faceStatus && <Button asChild size="sm"><Link href="/absensi/saya/wajah">Daftarkan wajah</Link></Button>}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="grid gap-6 md:grid-cols-[7fr_5fr] md:items-center">
            <div>
              <h2 className="text-sm font-medium text-muted-foreground">Hari ini</h2>
              {p.isOffDay ? (
                <><div className="text-3xl font-bold">Libur</div><p className="text-muted-foreground">{p.holidayName ?? 'Tidak ada jadwal kerja hari ini.'}</p></>
              ) : p.schedule ? (
                <><div className="text-3xl font-bold tabular">{p.schedule.checkIn} sampai {p.schedule.checkOut}</div><p className="text-muted-foreground">{p.schedule.name}, toleransi terlambat {p.schedule.lateToleranceMin} menit</p></>
              ) : (
                <><div className="text-3xl font-bold">Tanpa jadwal</div><p className="text-muted-foreground">Hubungi admin bila seharusnya Anda punya jadwal.</p></>
              )}
              <dl className="mt-4 flex flex-wrap gap-6">
                <div><dt className="text-sm text-muted-foreground">Masuk</dt><dd className="text-xl font-semibold tabular">{fmtJam(rec?.checkInAt, d.tz) ?? 'Belum'}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Pulang</dt><dd className="text-xl font-semibold tabular">{fmtJam(rec?.checkOutAt, d.tz) ?? 'Belum'}</dd></div>
                {rec && <div><dt className="text-sm text-muted-foreground">Status</dt><dd className="mt-1 flex items-center gap-2"><StatusBadge status={rec.status} />{rec.lateMinutes > 0 && <span className="text-sm">terlambat {rec.lateMinutes} mnt</span>}</dd></div>}
              </dl>
              {p.schedule && !p.isOffDay && (
                <div className="mt-4">
                  <Dayline scheduleIn={p.schedule.checkIn} scheduleOut={p.schedule.checkOut} checkIn={fmtJam(rec?.checkInAt, d.tz)} checkOut={fmtJam(rec?.checkOutAt, d.tz)} late={(rec?.lateMinutes ?? 0) > 0} />
                  <div className="flex justify-between text-xs text-muted-foreground" aria-hidden><span>05.00</span><span>13.30</span><span>22.00</span></div>
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Button asChild variant="outline" className="whitespace-normal"><Link href="/absensi/saya/dinas-luar">Sedang di luar kantor? Absen dinas luar</Link></Button>
              <Button asChild variant="outline"><Link href="/absensi/koreksi/baru">Ajukan koreksi absensi</Link></Button>
              <Button asChild variant="outline"><Link href="/cuti/baru">Ajukan cuti atau izin</Link></Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Bulan ini</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                {[
                  ['Hari kerja terjadwal sampai hari ini', d.month.scheduled],
                  ['Hadir (termasuk dinas luar)', d.month.present],
                  ['Terlambat', `${d.month.late} kali${d.month.lateMinutes ? `, ${d.month.lateMinutes} menit` : ''}`],
                  ['Izin, sakit, cuti', d.month.leave],
                  ['Belum ada transaksi', d.month.noRecord],
                ].map(([k, v]) => <div key={String(k)} className="flex justify-between gap-3 border-b pb-2 last:border-0"><dt>{k}</dt><dd className="font-semibold tabular">{v}</dd></div>)}
              </dl>
              {d.month.noRecord > 0 && <p className="mt-3 text-sm text-muted-foreground">Ada hari tanpa transaksi? Cek <Link className="text-primary underline" href="/absensi/saya">riwayat</Link> lalu ajukan koreksi bila perlu.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Jadwal 7 hari</CardTitle></CardHeader>
            <CardContent>
              <ul className="grid gap-2 text-sm">
                {d.upcoming.map((u) => (
                  <li key={u.date} className="flex justify-between gap-3 border-b pb-2 last:border-0">
                    <span>{fmtTglPendek(u.date, false)}</span>
                    <span className="tabular text-muted-foreground">{u.isOffDay ? (u.holidayName ?? 'Libur') : u.schedule ? `${u.schedule.checkIn} sampai ${u.schedule.checkOut}` : 'Tanpa jadwal'}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Saldo cuti {d.today.slice(0, 4)}</CardTitle></CardHeader>
            <CardContent>
              {d.balances.length ? (
                <ul className="grid gap-2 text-sm">
                  {d.balances.map((b) => (
                    <li key={b.leaveType.id} className="flex justify-between gap-3 border-b pb-2 last:border-0">
                      <span>{b.leaveType.name}</span>
                      <span className="tabular">{b.configured ? <><b>{b.remaining}</b> dari {b.entitled} hari{b.reserved ? <span className="block text-xs text-muted-foreground">{b.reserved} hari menunggu</span> : null}</> : <span className="text-muted-foreground">Belum diatur</span>}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Tidak ada jenis cuti yang memakai saldo.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Absensi terakhir</CardTitle><CardAction><Button asChild variant="ghost" size="sm"><Link href="/absensi/saya">Semua riwayat</Link></Button></CardAction></CardHeader>
            <CardContent>
              {d.recent.length ? (
                <ul className="divide-y text-sm">
                  {d.recent.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                      <span>{fmtTglPendek(fromDbDate(r.workDate))}<span className="block text-xs text-muted-foreground tabular">{fmtJam(r.checkInAt, d.tz) ?? '-'} sampai {fmtJam(r.checkOutAt, d.tz) ?? '-'}</span></span>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="Belum ada absensi" description="Riwayat muncul setelah absen pertama, lewat wajah, mesin, atau petugas." />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Status pengajuan</CardTitle></CardHeader>
            <CardContent>
              {d.corrections.length || d.leaves.length ? (
                <ul className="divide-y text-sm">
                  {d.leaves.map((l) => <li key={l.id}><Link href={`/cuti/${l.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2"><span>{l.leaveType.name}<span className="block text-xs text-muted-foreground">{fmtTglPendek(fromDbDate(l.startDate), false)} sampai {fmtTglPendek(fromDbDate(l.endDate))}</span></span><StatusBadge status={l.status} /></Link></li>)}
                  {d.corrections.map((c) => <li key={c.id}><Link href={`/absensi/koreksi/${c.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2"><span>Koreksi {fmtTglPendek(fromDbDate(c.workDate))}<span className="block text-xs text-muted-foreground">{STATUS_LABEL[c.proposedStatus ?? ''] ?? ''}</span></span><StatusBadge status={c.status} /></Link></li>)}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Belum ada pengajuan.</p>}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
