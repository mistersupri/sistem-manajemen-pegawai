import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { getDeviceDetail, syncRuns } from '@/lib/services/devices';
import { unitOptions } from '@/lib/services/units';
import { ADAPTERS, adapterList } from '@/lib/devices/registry';
import { getSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';
import { fmtWaktu } from '@/lib/time';
import { DeviceForm } from '../device-form';
import { DeviceControls, RetryButton } from './controls';

export const metadata = { title: 'Detail perangkat' };

const TRIGGER: Record<string, string> = { MANUAL: 'Manual', SCHEDULED: 'Terjadwal', RETRY: 'Ulang', RECONCILE: 'Rekonsiliasi', FILE: 'Impor berkas' };

export default async function DeviceDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePage(['device.read']);
  const { id } = await params;
  const d = await getDeviceDetail(actor, id).catch(() => null);
  if (!d) notFound();
  const [runs, units, s, unit] = await Promise.all([syncRuns(actor, id, 30), unitOptions(actor, 'device.manage'), getSettings(), d.unitId ? prisma.organizationUnit.findUnique({ where: { id: d.unitId } }) : null]);
  const tz = s['org.timezone'];
  const a = ADAPTERS[d.adapter];
  return (
    <>
      <PageHeader
        title={d.name}
        description={[d.vendor, d.model, d.location].filter(Boolean).join(', ') || a?.label}
        crumbs={[{ href: '/perangkat', label: 'Perangkat Absensi' }, { label: d.name }]}
        actions={can(actor, 'device.manage') ? <DeviceForm adapters={adapterList()} units={units} initial={d} /> : undefined}
      />
      <PageBody className="grid gap-6">
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
          <Card>
            <CardHeader><CardTitle>Konfigurasi</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-[12rem_1fr]">
                <dt className="text-muted-foreground">Adapter</dt><dd>{a?.label ?? d.adapter}<span className="block text-xs text-muted-foreground">{a?.note}</span></dd>
                <dt className="text-muted-foreground">Status</dt><dd>{d.isActive ? <StatusBadge status={d.status} /> : <StatusBadge status="CANCELLED" label="Nonaktif" />}</dd>
                <dt className="text-muted-foreground">Nomor seri</dt><dd>{d.serialNumber ?? '-'}</dd>
                <dt className="text-muted-foreground">Alamat</dt><dd className="tabular">{d.host ? `${d.host}${d.port ? `:${d.port}` : ''}` : '-'}</dd>
                <dt className="text-muted-foreground">Comm Key</dt><dd>{d.hasSecret ? 'Tersimpan terenkripsi' : 'Belum diisi'}</dd>
                <dt className="text-muted-foreground">Unit</dt><dd>{unit?.name ?? 'Semua unit'}</dd>
                <dt className="text-muted-foreground">Interval tarik</dt><dd>{d.syncIntervalMinutes ? `Tiap ${d.syncIntervalMinutes} menit` : 'Manual'}; timeout {d.timeoutMs} ms; coba ulang {d.maxRetries} kali</dd>
                <dt className="text-muted-foreground">Kursor terakhir</dt><dd className="tabular">{d.lastSyncCursor ?? '-'}</dd>
                <dt className="text-muted-foreground">Sinkron terakhir</dt><dd>{d.lastSyncAt ? fmtWaktu(d.lastSyncAt, tz) : 'Belum pernah'}</dd>
                <dt className="text-muted-foreground">Transaksi diterima / gagal</dt><dd className="tabular">{d.receivedCount} / {d.failedCount}</dd>
              </dl>
            </CardContent>
          </Card>
          {can(actor, 'device.sync') || can(actor, 'device.manage') ? <DeviceControls id={id} pull={!!a?.pull} active={d.isActive} canSync={can(actor, 'device.sync')} canManage={can(actor, 'device.manage')} /> : null}
        </div>
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4"><CardTitle>Riwayat sinkronisasi</CardTitle></CardHeader>
          {runs.length ? (
            <Table className="table-stack">
              <TableHeader><TableRow><TableHead className="pl-6">Mulai</TableHead><TableHead>Jenis</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Diterima</TableHead><TableHead className="text-right">Baru</TableHead><TableHead className="text-right">Duplikat</TableHead><TableHead className="text-right">Gagal</TableHead><TableHead className="pr-6">Pesan</TableHead></TableRow></TableHeader>
              <TableBody>{runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="stack-head pl-6 tabular">{fmtWaktu(r.startedAt, tz)}</TableCell>
                  <TableCell data-label="Jenis">{TRIGGER[r.trigger] ?? r.trigger}{r.attempt > 1 && <span className="block text-xs text-muted-foreground">percobaan {r.attempt}</span>}</TableCell>
                  <TableCell data-label="Status"><StatusBadge status={r.status} /></TableCell>
                  <TableCell data-label="Diterima" className="tabular md:text-right">{r.received}</TableCell>
                  <TableCell data-label="Baru" className="tabular md:text-right">{r.inserted}</TableCell>
                  <TableCell data-label="Duplikat" className="tabular md:text-right">{r.duplicates}</TableCell>
                  <TableCell data-label="Gagal" className="tabular md:text-right">{r.failed}</TableCell>
                  <TableCell data-label="Pesan" className="pr-6 whitespace-normal text-sm text-muted-foreground">{r.errorMessage ?? ''}{r.status === 'FAILED' && can(actor, 'device.sync') && <RetryButton id={r.id} />}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          ) : <EmptyState title="Belum ada sinkronisasi" description="Riwayat muncul setelah tarik data pertama, baik terjadwal maupun lewat tombol Tarik sekarang." />}
        </Card>
      </PageBody>
    </>
  );
}
