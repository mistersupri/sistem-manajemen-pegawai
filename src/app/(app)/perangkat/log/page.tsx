import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { Pager } from '@/components/app/pagination';
import { StatusBadge } from '@/components/app/status-badge';
import { requirePage } from '@/lib/guard';
import { listDevices, rawEvents } from '@/lib/services/devices';
import { getSettings } from '@/lib/settings';
import { addDays, fmtWaktu, fromDbDate, isValidDate, todayIn } from '@/lib/time';

export const metadata = { title: 'Log Perangkat' };

export default async function RawLogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['device.read']);
  const sp = await searchParams;
  const tz = (await getSettings())['org.timezone'];
  const today = todayIn(tz);
  const from = isValidDate(sp.dari) ? sp.dari : addDays(today, -7);
  const to = isValidDate(sp.sampai) ? sp.sampai : today;
  const [data, devices] = await Promise.all([rawEvents(actor, { from, to, deviceId: sp.mesin, q: sp.q || undefined, page: sp.page || 1 }), listDevices(actor)]);
  const params = { dari: from, sampai: to, mesin: sp.mesin, q: sp.q };
  return (
    <>
      <PageHeader title="Log Perangkat" description="Transaksi mentah dari perangkat. Data ini tidak bisa diubah atau dihapus." crumbs={[{ href: '/perangkat', label: 'Perangkat Absensi' }, { label: 'Log' }]} />
      <PageBody className="grid gap-4">
        <form method="get" className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1fr_1fr_1.5fr_1.5fr_auto] md:items-end">
          <div className="grid gap-2"><Label htmlFor="dari">Dari</Label><Input id="dari" name="dari" type="date" defaultValue={from} /></div>
          <div className="grid gap-2"><Label htmlFor="sampai">Sampai</Label><Input id="sampai" name="sampai" type="date" defaultValue={to} /></div>
          <div className="col-span-2 grid gap-2 md:col-span-1"><Label htmlFor="mesin">Perangkat</Label><NativeSelect id="mesin" name="mesin" defaultValue={sp.mesin ?? ''}><NativeSelectOption value="">Semua</NativeSelectOption>{devices.map((d) => <NativeSelectOption key={d.id} value={d.id}>{d.name}</NativeSelectOption>)}</NativeSelect></div>
          <div className="col-span-2 grid gap-2 md:col-span-1"><Label htmlFor="q">ID mesin atau nama</Label><div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="q" name="q" type="search" defaultValue={sp.q} className="rounded-full pl-9" /></div></div>
          <Button type="submit" className="col-span-2 md:col-span-1">Terapkan</Button>
        </form>
        <div className="rounded-xl border bg-card">
          <Table className="table-stack">
            <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Waktu perangkat</TableHead><TableHead>Diterima server</TableHead><TableHead>ID mesin</TableHead><TableHead>Pegawai</TableHead><TableHead>Perangkat</TableHead><TableHead className="pr-4 lg:pr-6">Pemrosesan</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.rows.length === 0 && <TableRow><TableCell colSpan={6}><EmptyState filtered title="Tidak ada scan pada periode ini" /></TableCell></TableRow>}
              {data.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="stack-head pl-4 tabular lg:pl-6">{fmtWaktu(r.deviceTime, tz)}{r.clockSkewSuspect && <span className="block text-xs text-status-telat-foreground">jam perangkat menyimpang</span>}</TableCell>
                  <TableCell data-label="Diterima" className="tabular text-muted-foreground">{fmtWaktu(r.receivedAt, tz)}</TableCell>
                  <TableCell data-label="ID mesin" className="tabular">{r.devicePin}</TableCell>
                  <TableCell data-label="Pegawai">{r.employee ? <Link className="text-primary hover:underline" href={`/absensi/rekap/${r.employee.id}/${r.workDate ? fromDbDate(r.workDate) : today}`}>{r.employee.fullName}</Link> : <Link className="text-status-telat-foreground underline" href="/perangkat/sinkronisasi">Belum dipetakan</Link>}</TableCell>
                  <TableCell data-label="Perangkat">{r.device?.name ?? 'Impor berkas'}</TableCell>
                  <TableCell data-label="Pemrosesan" className="pr-4 lg:pr-6">{r.processedAt ? <StatusBadge status="SUCCESS" label={r.workDate ? `Tgl kerja ${fromDbDate(r.workDate)}` : 'Diproses'} /> : <StatusBadge status="PENDING" label="Tertunda" />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pager total={data.total} page={data.page} pageSize={data.pageSize} params={params} />
        </div>
      </PageBody>
    </>
  );
}
