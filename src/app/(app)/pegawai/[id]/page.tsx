import Link from 'next/link';
import { Pencil, ScanFace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { Segmented } from '@/components/app/segmented';
import { MonthStepper } from '@/components/app/month-stepper';
import { PresenceRecap } from '@/components/app/presence-recap';
import { presenceMonth } from '@/lib/services/presence';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { prisma } from '@/lib/db';
import { getEmployee } from '@/lib/services/employees';
import { listAssignments } from '@/lib/services/schedules';
import { plansFor } from '@/lib/attendance/plan';
import { getSettings } from '@/lib/settings';
import { addDays, fmtTanggal, fmtTglPendek, fmtWaktu, fromDbDate, todayIn } from '@/lib/time';
import { EmployeeActions } from './actions';

export const metadata = { title: 'Detail pegawai' };

const TABS = [
  ['profil', 'Profil'],
  ['penempatan', 'Penempatan dan jabatan'],
  ['absensi', 'Absensi'],
  ['jadwal', 'Jadwal'],
  ['riwayat', 'Riwayat perubahan'],
] as const;

export default async function EmployeeDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; bulan?: string }> }) {
  const actor = await requirePage(['employee.read']);
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? 'profil';
  const e = await getEmployee(actor, id);
  const s = await getSettings();
  const tz = s['org.timezone'];
  const name = `${[e.frontTitle, e.fullName].filter(Boolean).join(' ')}${e.backTitle ? `, ${e.backTitle}` : ''}`;
  const d = (x: Date | null) => (x ? fmtTanggal(fromDbDate(x)) : '-');
  const face = e.biometricsInfo.find((b) => b.status === 'ACTIVE') ?? e.biometricsInfo[0];
  return (
    <>
      <PageHeader
        title={name}
        description={[e.employeeNumber && `NIP ${e.employeeNumber}`, e.position, e.unit?.name].filter(Boolean).join(', ')}
        crumbs={[{ href: '/pegawai', label: 'Data Pegawai' }, { label: e.fullName }]}
        actions={
          <>
            {can(actor, 'employee.write') && <Button asChild><Link href={`/pegawai/${id}/ubah`}><Pencil />Ubah</Link></Button>}
            {can(actor, 'biometric.manage') && e.isActive && <Button asChild variant="outline"><Link href={`/pegawai/${id}/wajah`}><ScanFace />Wajah</Link></Button>}
            <EmployeeActions id={id} name={e.fullName} isActive={e.isActive} hasAccount={!!e.user} hasNip={!!e.employeeNumber} hasFace={!!face && face.status !== 'REVOKED'}
              can={{ deactivate: can(actor, 'employee.deactivate'), write: can(actor, 'employee.write'), biometric: can(actor, 'biometric.manage') }} />
          </>
        }
      >
        <Segmented label="Bagian detail pegawai" current={tab} className="mt-5 w-fit" items={TABS.map(([k, label]) => ({ key: k, label, href: `?tab=${k}` }))} />
      </PageHeader>
      <PageBody className="grid gap-6">
        {!e.isActive && <p className="rounded-lg border bg-muted p-3 text-sm">Pegawai nonaktif sejak {d(e.activeEffectiveDate)}. Data dan riwayat absensinya tetap tersimpan.</p>}
        {tab === 'profil' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Data pribadi</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[11rem_1fr]">
                  <dt className="text-muted-foreground">NIP</dt><dd className="tabular">{e.employeeNumber ?? '-'}</dd>
                  <dt className="text-muted-foreground">NIK</dt><dd className="tabular">{e.canSeeNik ? e.nik ?? '-' : e.hasNik ? 'Tersimpan (perlu izin data sensitif)' : '-'}</dd>
                  <dt className="text-muted-foreground">Tempat, tanggal lahir</dt><dd>{[e.birthPlace, e.birthDate ? fmtTanggal(fromDbDate(e.birthDate)) : null].filter(Boolean).join(', ') || '-'}</dd>
                  <dt className="text-muted-foreground">Jenis kelamin</dt><dd>{e.gender === 'L' ? 'Laki-laki' : e.gender === 'P' ? 'Perempuan' : '-'}</dd>
                  <dt className="text-muted-foreground">Alamat</dt><dd className="whitespace-pre-wrap">{e.address ?? '-'}</dd>
                  <dt className="text-muted-foreground">Telepon</dt><dd>{e.phone ?? '-'}</dd>
                  <dt className="text-muted-foreground">Email</dt><dd>{e.email ?? '-'}</dd>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Kepegawaian dan akun</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[11rem_1fr]">
                  <dt className="text-muted-foreground">Status kepegawaian</dt><dd>{e.employmentStatus ?? '-'}</dd>
                  <dt className="text-muted-foreground">Atasan langsung</dt><dd>{e.supervisor ? <Link className="text-primary underline" href={`/pegawai/${e.supervisor.id}`}>{e.supervisor.fullName}</Link> : '-'}</dd>
                  <dt className="text-muted-foreground">Mulai bekerja</dt><dd>{d(e.startDate)}</dd>
                  <dt className="text-muted-foreground">ID mesin absensi</dt><dd className="tabular">{e.machinePin ?? '-'}</dd>
                  <dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={e.isActive ? 'APPROVED' : 'CANCELLED'} label={e.isActive ? 'Aktif' : 'Nonaktif'} /></dd>
                  <dt className="text-muted-foreground">Akun login</dt><dd>{e.user ? `${e.user.username}${e.user.isActive ? '' : ' (nonaktif)'}${e.user.lastLoginAt ? `, terakhir masuk ${fmtWaktu(e.user.lastLoginAt, tz)}` : ', belum pernah masuk'}` : 'Belum ada'}</dd>
                  <dt className="text-muted-foreground">Template wajah</dt>
                  <dd>{face ? <span className="flex flex-wrap items-center gap-2"><StatusBadge status={face.status} />{face.sampleCount} sampel, persetujuan {fmtWaktu(face.consentAt, tz)}</span> : 'Belum terdaftar'}</dd>
                </dl>
              </CardContent>
            </Card>
          </div>
        )}
        {tab === 'penempatan' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4"><CardTitle>Riwayat jabatan dan pangkat</CardTitle></CardHeader>
              <Table><TableHeader><TableRow><TableHead className="pl-6">Periode</TableHead><TableHead>Jabatan</TableHead><TableHead>Pangkat</TableHead><TableHead className="pr-6">Status</TableHead></TableRow></TableHeader>
                <TableBody>{e.positionHistory.map((h) => (
                  <TableRow key={h.id}><TableCell className="pl-6 tabular">{fmtTglPendek(fromDbDate(h.startDate))}<span className="block text-xs text-muted-foreground">sampai {h.endDate ? fmtTglPendek(fromDbDate(h.endDate)) : 'sekarang'}</span></TableCell><TableCell className="whitespace-normal">{h.position ?? '-'}{h.note && <span className="block text-xs text-muted-foreground">{h.note}</span>}</TableCell><TableCell>{h.rank ?? '-'}</TableCell><TableCell className="pr-6">{h.employmentStatus ?? '-'}</TableCell></TableRow>
                ))}</TableBody></Table>
            </Card>
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-4"><CardTitle>Riwayat unit kerja</CardTitle></CardHeader>
              <Table><TableHeader><TableRow><TableHead className="pl-6">Periode</TableHead><TableHead className="pr-6">Unit</TableHead></TableRow></TableHeader>
                <TableBody>{e.unitHistory.map((h) => (
                  <TableRow key={h.id}><TableCell className="pl-6 tabular">{fmtTglPendek(fromDbDate(h.startDate))}<span className="block text-xs text-muted-foreground">sampai {h.endDate ? fmtTglPendek(fromDbDate(h.endDate)) : 'sekarang'}</span></TableCell><TableCell className="pr-6 whitespace-normal">{h.unit?.name ?? 'Tanpa unit'}{h.note && <span className="block text-xs text-muted-foreground">{h.note}</span>}</TableCell></TableRow>
                ))}</TableBody></Table>
            </Card>
          </div>
        )}
        {tab === 'absensi' && <AttendanceTab id={id} tz={tz} bulan={sp.bulan} />}
        {tab === 'jadwal' && <ScheduleTab id={id} tz={tz} />}
        {tab === 'riwayat' && <HistoryTab id={id} tz={tz} allowed={can(actor, 'audit.read') || can(actor, 'employee.write')} />}
      </PageBody>
    </>
  );
}

async function AttendanceTab({ id, tz, bulan }: { id: string; tz: string; bulan?: string }) {
  const today = todayIn(tz);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan ?? '') && bulan! <= today.slice(0, 7) ? bulan! : today.slice(0, 7);
  const data = await presenceMonth(id, month, today);
  return (
    <div className="grid gap-4">
      <div className="flex justify-end"><MonthStepper value={month} href="?tab=absensi&bulan=__bulan__" max={today.slice(0, 7)} /></div>
      <PresenceRecap data={data} tz={tz} detailHref={(d) => `/absensi/rekap/${id}/${d}`} />
    </div>
  );
}

async function ScheduleTab({ id, tz }: { id: string; tz: string }) {
  const actor = await requirePage();
  const today = todayIn(tz);
  const [assignments, plans] = await Promise.all([listAssignments(actor, { employeeId: id, excludeDaily: true }), plansFor(id, today, addDays(today, 13))]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Jadwal 14 hari ke depan</CardTitle></CardHeader>
        <CardContent><ul className="grid gap-2 text-sm">{plans.map((p) => (
          <li key={p.date} className="flex justify-between gap-3 border-b pb-2 last:border-0"><span>{fmtTglPendek(p.date, false)}</span><span className="text-right tabular text-muted-foreground">{p.isOffDay ? p.holidayName ?? 'Libur' : p.schedule ? `${p.schedule.code} ${p.schedule.checkIn} sampai ${p.schedule.checkOut}` : 'Tanpa jadwal'}<span className="block text-xs">{p.source === 'SEMENTARA' ? 'Penugasan sementara' : p.source === 'UNIT' ? 'Dari jadwal unit' : p.source === 'PEGAWAI' ? 'Jadwal pegawai' : ''}</span></span></li>
        ))}</ul></CardContent>
      </Card>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4"><CardTitle>Penugasan jadwal pegawai</CardTitle></CardHeader>
        {assignments.length ? (
          <ul className="divide-y text-sm">{assignments.map((a) => (
            <li key={a.id} className="px-6 py-3"><b>{a.schedule ? `${a.schedule.code} ${a.schedule.name}` : 'Libur'}</b>, {a.kind === 'TETAP' ? 'Tetap' : 'Sementara'}<span className="block text-muted-foreground">{fmtTglPendek(fromDbDate(a.startDate))} sampai {a.endDate ? fmtTglPendek(fromDbDate(a.endDate)) : 'seterusnya'}{a.note ? `, ${a.note}` : ''}</span></li>
          ))}</ul>
        ) : <EmptyState title="Tidak ada penugasan khusus" description="Pegawai mengikuti jadwal unit kerjanya." actions={[{ href: '/jadwal?tab=penugasan', label: 'Atur penugasan' }]} />}
      </Card>
    </div>
  );
}

async function HistoryTab({ id, tz, allowed }: { id: string; tz: string; allowed: boolean }) {
  if (!allowed) return <EmptyState title="Riwayat perubahan hanya untuk petugas kepegawaian dan auditor" description="Akun Anda tidak punya izin melihat audit data pegawai." />;
  const rows = await prisma.auditLog.findMany({ where: { OR: [{ entityId: id }, { meta: { path: ['employeeId'], equals: id } }] }, orderBy: { createdAt: 'desc' }, take: 100 });
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4"><CardTitle>Riwayat perubahan data</CardTitle></CardHeader>
      {rows.length ? (
        <ul className="divide-y text-sm">{rows.map((r) => (
          <li key={r.id} className="grid gap-1 px-6 py-3">
            <div className="flex flex-wrap justify-between gap-2"><b>{r.action}</b><span className="text-muted-foreground">{fmtWaktu(r.createdAt, tz)}, {r.actorLabel}</span></div>
            {r.after ? <pre className="overflow-x-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{JSON.stringify(r.after, null, 1)}</pre> : null}
          </li>
        ))}</ul>
      ) : <EmptyState title="Belum ada riwayat" description="Setiap perubahan data pegawai ini akan tercatat di sini beserta pelakunya." />}
    </Card>
  );
}
