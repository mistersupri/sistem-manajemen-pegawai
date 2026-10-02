import Link from 'next/link';
import { ScanFace, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { Dayline } from '@/components/app/dayline';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { monitoring, CATEGORY_LABEL } from '@/lib/services/reports';
import { unitOptions } from '@/lib/services/units';
import { getSettings } from '@/lib/settings';
import { METHOD_LABEL } from '@/lib/attendance/engine';
import { fmtJam, fmtTanggal, isValidDate } from '@/lib/time';
import { ManualEntry } from './manual-entry';

export const metadata = { title: 'Monitoring Kehadiran' };

export default async function MonitoringPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['attendance.monitor']);
  const sp = await searchParams;
  const [d, units, s] = await Promise.all([
    monitoring(actor, { date: isValidDate(sp.tanggal) ? sp.tanggal : undefined, unitId: sp.unit, category: sp.kategori, method: sp.metode, q: sp.q }),
    unitOptions(actor, 'attendance.monitor'),
    getSettings(),
  ]);
  const base = (k?: string) => `?${new URLSearchParams(Object.fromEntries(Object.entries({ tanggal: d.date, unit: sp.unit, metode: sp.metode, q: sp.q, kategori: k }).filter(([, v]) => v)) as Record<string, string>)}`;
  return (
    <>
      <PageHeader
        title="Monitoring Kehadiran"
        description={fmtTanggal(d.date)}
        actions={
          <>
            {can(actor, 'attendance.manual_entry') && s['methods.manual'] && <ManualEntry employees={d.rows.map((r) => ({ id: r.employee.id, name: r.employee.fullName }))} date={d.date} />}
            {can(actor, 'kiosk.operate') && <Button asChild variant="outline"><Link href="/kiosk" target="_blank"><ScanFace />Buka kiosk wajah</Link></Button>}
          </>
        }
      />
      <PageBody className="grid gap-4">
        <form method="get" className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1fr_1.4fr_1.2fr_1.6fr_auto] md:items-end" aria-label="Filter monitoring">
          <div className="grid gap-2"><Label htmlFor="tanggal">Tanggal</Label><Input id="tanggal" name="tanggal" type="date" defaultValue={d.date} /></div>
          <div className="grid gap-2"><Label htmlFor="unit">Unit kerja</Label><NativeSelect id="unit" name="unit" defaultValue={sp.unit ?? ''}><NativeSelectOption value="">Semua unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect></div>
          <div className="grid gap-2"><Label htmlFor="metode">Metode</Label><NativeSelect id="metode" name="metode" defaultValue={sp.metode ?? ''}><NativeSelectOption value="">Semua metode</NativeSelectOption>{Object.entries(METHOD_LABEL).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}</NativeSelect></div>
          <div className="grid gap-2"><Label htmlFor="q">Cari pegawai</Label><div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="q" name="q" type="search" defaultValue={sp.q} placeholder="Nama atau NIP" className="rounded-full pl-9" /></div></div>
          <input type="hidden" name="kategori" value={sp.kategori ?? ''} />
          <Button type="submit">Terapkan</Button>
        </form>

        <nav className="flex flex-wrap gap-1 rounded-full border bg-card p-1" aria-label="Kategori kehadiran">
          {[['', 'Semua'], ...Object.entries(CATEGORY_LABEL)].map(([k, label]) => {
            const active = (sp.kategori ?? '') === k;
            const n = k ? d.counts[k] ?? 0 : Object.values(d.counts).reduce((a, b) => a + b, 0);
            return (
              <Link key={k || 'all'} href={base(k || undefined)} aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-medium ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {label}<span className={`rounded-full px-1.5 text-xs tabular ${active ? 'bg-white/20' : 'bg-muted'}`}>{n}</span>
              </Link>
            );
          })}
        </nav>

        <div className="rounded-xl border bg-card">
          <Table className="table-stack">
            <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Pegawai</TableHead><TableHead>Jadwal</TableHead><TableHead>Masuk</TableHead><TableHead>Pulang</TableHead><TableHead>Status</TableHead><TableHead className="pr-4 lg:pr-6">Garis hari kerja</TableHead></TableRow></TableHeader>
            <TableBody>
              {d.rows.length === 0 && <TableRow><TableCell colSpan={6}><EmptyState filtered={!!(sp.kategori || sp.q || sp.unit || sp.metode)} title="Tidak ada pegawai pada kategori ini" /></TableCell></TableRow>}
              {d.rows.map(({ employee: e, plan: p, record: r, category }) => (
                <TableRow key={e.id}>
                  <TableCell className="stack-head pl-4 lg:pl-6"><Link href={`/absensi/rekap/${e.id}/${d.date}`} className="font-medium text-primary hover:underline">{e.fullName}</Link><span className="block text-xs text-muted-foreground">{e.unit?.name ?? ''}</span></TableCell>
                  <TableCell data-label="Jadwal" className="tabular text-muted-foreground">{p.isOffDay ? p.holidayName ?? 'Libur' : p.schedule ? `${p.schedule.code} ${p.schedule.checkIn}-${p.schedule.checkOut}` : 'Tanpa jadwal'}</TableCell>
                  <TableCell data-label="Masuk" className="tabular">{fmtJam(r?.checkInAt, d.tz) ?? '-'}<span className="block text-xs text-muted-foreground">{METHOD_LABEL[r?.checkInMethod ?? ''] ?? ''}</span></TableCell>
                  <TableCell data-label="Pulang" className="tabular">{fmtJam(r?.checkOutAt, d.tz) ?? '-'}<span className="block text-xs text-muted-foreground">{METHOD_LABEL[r?.checkOutMethod ?? ''] ?? ''}</span></TableCell>
                  <TableCell data-label="Status">{r ? <StatusBadge status={r.status} /> : <StatusBadge status="TANPA_TRANSAKSI" label={CATEGORY_LABEL[category]} />}{r && r.lateMinutes > 0 && <span className="block text-xs text-muted-foreground">{r.lateMinutes} mnt</span>}</TableCell>
                  <TableCell className="pr-4 max-md:hidden lg:pr-6"><Dayline scheduleIn={p.schedule?.checkIn} scheduleOut={p.schedule?.checkOut} checkIn={fmtJam(r?.checkInAt, d.tz)} checkOut={fmtJam(r?.checkOutAt, d.tz)} late={(r?.lateMinutes ?? 0) > 0} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-sm text-muted-foreground">&quot;Belum ada transaksi&quot; berarti belum ada catatan dari wajah, mesin, atau petugas. Ini bukan penetapan tidak hadir; petugas menetapkan status lewat koreksi absensi setelah pemeriksaan.</p>
      </PageBody>
    </>
  );
}
