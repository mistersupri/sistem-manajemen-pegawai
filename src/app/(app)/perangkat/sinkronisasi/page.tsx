import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { requirePage } from '@/lib/guard';
import { can, employeeScopeWhere } from '@/lib/auth/actor';
import { listDevices, syncRunsPage, unmatchedPins } from '@/lib/services/devices';
import { Pager, SortableHead, TableToolbar } from '@/components/app/pagination';
import { Segmented } from '@/components/app/segmented';
import { qs } from '@/lib/list';
import { getSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';
import { fmtWaktu } from '@/lib/time';
import { ImportFile, MapPin } from './forms';

export const metadata = { title: 'Status Sinkronisasi' };

export default async function SyncPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['device.read']);
  const sp = await searchParams;
  const [data, devices, pins, s] = await Promise.all([syncRunsPage(actor, { deviceId: sp.mesin, status: sp.status, page: sp.page, per: sp.per, sort: sp.sort, dir: sp.dir }), listDevices(actor), unmatchedPins(actor), getSettings()]);
  const runs = data.rows;
  const params = { mesin: sp.mesin, status: sp.status, sort: sp.sort, dir: sp.dir, per: sp.per };
  const sortProps = { sort: data.sort, dir: data.dir, params };
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
          <CardHeader className="gap-3 border-b py-4">
            <CardTitle>Riwayat sinkronisasi</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="Filter status" current={sp.status ?? ''} items={[['', 'Semua'], ['SUCCESS', 'Berhasil'], ['PARTIAL', 'Sebagian'], ['FAILED', 'Gagal']].map(([k, l]) => ({ key: k, label: l, href: qs({ ...params, status: k || undefined, page: undefined }) }))} />
              {devices.length > 1 && (
                <form method="get" className="flex items-center gap-2">
                  {sp.status && <input type="hidden" name="status" value={sp.status} />}
                  <label htmlFor="mesin" className="text-sm text-muted-foreground">Perangkat</label>
                  <NativeSelect id="mesin" name="mesin" size="sm" defaultValue={sp.mesin ?? ''} className="min-w-44"><NativeSelectOption value="">Semua</NativeSelectOption>{devices.map((d) => <NativeSelectOption key={d.id} value={d.id}>{d.name}</NativeSelectOption>)}</NativeSelect>
                  <Button type="submit" size="sm" variant="outline">Tampilkan</Button>
                </form>
              )}
            </div>
          </CardHeader>
          <TableToolbar {...sortProps} sorts={[{ value: 'mulai', label: 'Waktu mulai' }, { value: 'diterima', label: 'Jumlah diterima' }, { value: 'baru', label: 'Jumlah baru' }]}>
            <span className="tabular-nums">{data.total.toLocaleString('id-ID')}</span> sinkronisasi
          </TableToolbar>
          {runs.length ? (
            <Table className="table-stack">
              <TableHeader><TableRow><SortableHead label="Mulai" value="mulai" {...sortProps} firstDir="desc" className="pl-6" /><TableHead>Perangkat / berkas</TableHead><TableHead>Status</TableHead><SortableHead label="Diterima" value="diterima" {...sortProps} align="right" firstDir="desc" /><SortableHead label="Baru" value="baru" {...sortProps} align="right" firstDir="desc" /><TableHead className="text-right">Duplikat</TableHead><TableHead className="pr-6">Pesan</TableHead></TableRow></TableHeader>
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
          ) : <EmptyState filtered={!!(sp.status || sp.mesin)} title={sp.status || sp.mesin ? 'Tidak ada sinkronisasi yang cocok' : 'Belum ada sinkronisasi'} description={sp.status || sp.mesin ? undefined : 'Tarik data dari halaman perangkat, atau impor berkas USB di atas.'} actions={sp.status || sp.mesin ? [{ href: '/perangkat/sinkronisasi', label: 'Hapus filter' }] : [{ href: '/perangkat', label: 'Buka daftar perangkat' }]} />}
          <Pager total={data.total} page={data.page} pageSize={data.pageSize} params={params} />
        </Card>
      </PageBody>
    </>
  );
}
