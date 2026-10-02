import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { listDevices } from '@/lib/services/devices';
import { unitOptions } from '@/lib/services/units';
import { ADAPTERS, adapterList } from '@/lib/devices/registry';
import { getSettings } from '@/lib/settings';
import { fmtWaktu } from '@/lib/time';
import { DeviceForm } from './device-form';
import { DeviceRowActions } from './row-actions';

export const metadata = { title: 'Perangkat Absensi' };

export default async function DevicesPage() {
  const actor = await requirePage(['device.read']);
  const [devices, units, s] = await Promise.all([listDevices(actor), unitOptions(actor, 'device.manage'), getSettings()]);
  const tz = s['org.timezone'];
  return (
    <>
      <PageHeader title="Perangkat Absensi" description={`${devices.length} perangkat terdaftar`} actions={can(actor, 'device.manage') ? <DeviceForm adapters={adapterList()} units={units} /> : undefined} />
      <PageBody className="grid gap-4">
        <div className="rounded-xl border bg-card">
          <Table className="table-stack">
            <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Perangkat</TableHead><TableHead>Koneksi</TableHead><TableHead>Status</TableHead><TableHead>Sinkron terakhir</TableHead><TableHead className="text-right">Diterima / gagal</TableHead><TableHead className="pr-4 text-right lg:pr-6"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {devices.length === 0 && <TableRow><TableCell colSpan={6}><EmptyState title="Belum ada perangkat" description="Tambahkan mesin LAN (Solution X302), impor berkas USB (P280), atau mesin simulasi untuk mencoba." /></TableCell></TableRow>}
              {devices.map((d) => {
                const a = ADAPTERS[d.adapter];
                const run = d.syncRuns[0];
                return (
                  <TableRow key={d.id}>
                    <TableCell className="stack-head pl-4 lg:pl-6"><Link className="font-medium text-primary hover:underline" href={`/perangkat/${d.id}`}>{d.name}</Link><span className="block text-xs text-muted-foreground">{[d.vendor, d.model, d.location, d.unit?.name].filter(Boolean).join(' · ')}</span></TableCell>
                    <TableCell data-label="Koneksi" className="whitespace-normal">{a?.label ?? d.adapter}{d.host && <span className="block text-xs text-muted-foreground tabular">{d.host}{d.port ? `:${d.port}` : ''}</span>}{a?.maturity === 'BELUM_DIUJI' && <span className="block text-xs text-status-telat-foreground">Belum diuji dengan unit fisik</span>}</TableCell>
                    <TableCell data-label="Status">{d.isActive ? <StatusBadge status={d.status} /> : <StatusBadge status="CANCELLED" label="Nonaktif" />}</TableCell>
                    <TableCell data-label="Sinkron terakhir">{d.lastSyncAt ? fmtWaktu(d.lastSyncAt, tz) : 'Belum pernah'}{run && <span className="block"><StatusBadge status={run.status} /></span>}</TableCell>
                    <TableCell data-label="Diterima / gagal" className="tabular md:text-right">{d.receivedCount} / {d.failedCount}</TableCell>
                    <TableCell className="pr-4 lg:pr-6"><DeviceRowActions id={d.id} pull={!!a?.pull} active={d.isActive} canSync={can(actor, 'device.sync')} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-sm text-muted-foreground">Server aplikasi harus satu jaringan dengan mesin LAN. Mesin USB (P280) diimpor dari menu Status Sinkronisasi. Panduan lengkap: docs/PERANGKAT.md.</p>
      </PageBody>
    </>
  );
}
