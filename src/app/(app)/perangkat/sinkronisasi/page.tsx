import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { requirePage } from '@/lib/guard';
import { can, employeeScopeWhere } from '@/lib/auth/actor';
import { listDevices, syncRuns, unmatchedPins } from '@/lib/services/devices';
import { getSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';
import { fmtWaktu } from '@/lib/time';
import { ImportFile, MapPin } from './forms';

export const metadata = { title: 'Status Sinkronisasi' };

export default async function SyncPage() {
  const actor = await requirePage(['device.read']);
  const [runs, devices, pins, s] = await Promise.all([syncRuns(actor, undefined, 40), listDevices(actor), unmatchedPins(actor), getSettings()]);
  const tz = s['org.timezone'];
  const canMap = can(actor, 'employee.write') || can(actor, 'device.manage');
  const employees = canMap ? await prisma.employee.findMany({ where: { AND: [{ deletedAt: null, isActive: true, machinePin: null }, employeeScopeWhere(actor, can(actor, 'employee.write') ? 'employee.write' : 'device.manage')] }, select: { id: true, fullName: true, employeeNumber: true }, orderBy: { fullName: 'asc' } }) : [];
  return (
    <>
      <PageHeader title="Status Sinkronisasi" description="Riwayat tarik data, impor berkas USB, dan pemetaan ID mesin ke pegawai." crumbs={[{ href: '/perangkat', label: 'Perangkat Absensi' }, { label: 'Status sinkronisasi' }]} />
      <PageBody className="grid gap-6">
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {can(actor, 'device.sync') && <ImportFile devices={devices.filter((d) => d.adapter === 'FILE_IMPORT').map((d) => ({ id: d.id, name: d.name }))} />}
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-4"><CardTitle>ID mesin belum terhubung ({pins.length})</CardTitle><CardDescription>Scan dari ID ini disimpan tetapi belum masuk rekap sampai dipetakan ke pegawai.</CardDescription></CardHeader>
            {pins.length ? (
              <ul className="max-h-[28rem] divide-y overflow-y-auto">
                {pins.map((p) => (
                  <li key={p.pin} className="grid gap-2 px-6 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <span><b className="tabular">ID {p.pin}</b> {p.name && `(${p.name})`}<span className="block text-xs text-muted-foreground">{[p.department, p.device, `${p.scans} scan`, p.lastScan && `terakhir ${fmtWaktu(p.lastScan, tz)}`].filter(Boolean).join(', ')}</span></span>
                    {canMap && <MapPin pin={p.pin} name={p.name} employees={employees} />}
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="Semua ID mesin sudah terhubung" />}
          </Card>
        </div>
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4"><CardTitle>Riwayat sinkronisasi semua perangkat</CardTitle></CardHeader>
          {runs.length ? (
            <Table className="table-stack">
              <TableHeader><TableRow><TableHead className="pl-6">Mulai</TableHead><TableHead>Perangkat / berkas</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Diterima</TableHead><TableHead className="text-right">Baru</TableHead><TableHead className="text-right">Duplikat</TableHead><TableHead className="pr-6">Pesan</TableHead></TableRow></TableHeader>
              <TableBody>{runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="stack-head pl-6 tabular">{fmtWaktu(r.startedAt, tz)}</TableCell>
                  <TableCell data-label="Perangkat">{r.deviceId ? <Link className="text-primary hover:underline" href={`/perangkat/${r.deviceId}`}>{r.device?.name}</Link> : 'Tanpa perangkat'}{r.fileName && <span className="block text-xs text-muted-foreground">{r.fileName}</span>}</TableCell>
                  <TableCell data-label="Status"><StatusBadge status={r.status} /></TableCell>
                  <TableCell data-label="Diterima" className="tabular md:text-right">{r.received}</TableCell>
                  <TableCell data-label="Baru" className="tabular md:text-right">{r.inserted}</TableCell>
                  <TableCell data-label="Duplikat" className="tabular md:text-right">{r.duplicates}</TableCell>
                  <TableCell data-label="Pesan" className="pr-6 whitespace-normal text-sm text-muted-foreground">{r.errorMessage ?? ''}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          ) : <EmptyState title="Belum ada sinkronisasi" />}
        </Card>
      </PageBody>
    </>
  );
}
