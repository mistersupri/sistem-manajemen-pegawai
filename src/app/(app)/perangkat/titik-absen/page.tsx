import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { requirePage } from '@/lib/guard';
import { can, scopeOf } from '@/lib/auth/actor';
import { listStations } from '@/lib/services/stations';
import { unitOptions } from '@/lib/services/units';
import { getSettings } from '@/lib/settings';
import { fmtWaktu } from '@/lib/time';
import { CreateStation, StationActions } from './forms';

export const metadata = { title: 'Titik Absen Wajah' };

export default async function StationsPage() {
  const actor = await requirePage(['device.read']);
  const manage = can(actor, 'device.manage');
  const [rows, units, s] = await Promise.all([listStations(actor), manage ? unitOptions(actor, 'device.manage') : [], getSettings()]);
  const canAllUnits = !!scopeOf(actor, 'device.manage')?.all;
  const tz = s['org.timezone'];
  return (
    <>
      <PageHeader
        title="Titik absen wajah"
        description="Tautan rekam wajah tanpa login: buka di tablet kiosk, atau bagikan QR-nya ke ponsel pegawai."
        crumbs={[{ href: '/perangkat', label: 'Perangkat Absensi' }, { label: 'Titik absen' }]}
        actions={manage ? <CreateStation units={units} canAllUnits={canAllUnits} /> : undefined}
      />
      <PageBody className="grid gap-4">
        {!s['methods.faceKiosk'] && <p className="rounded-lg border border-status-telat-foreground/30 bg-status-telat px-4 py-3 text-sm text-status-telat-foreground">Kiosk wajah sedang dimatikan di Pengaturan, Metode Absensi. Titik absen tidak bisa merekam wajah sampai metode itu diaktifkan.</p>}
        <div className="rounded-xl border bg-card">
          <Table className="table-stack">
            <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Titik absen</TableHead><TableHead>Pegawai dikenali</TableHead><TableHead>Aturan</TableHead><TableHead>Status</TableHead><TableHead>Terakhir dipakai</TableHead><TableHead className="text-right">Transaksi</TableHead><TableHead className="pr-4 lg:pr-6"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={7}><EmptyState title="Belum ada titik absen" description={manage ? 'Buat titik absen dengan tombol di atas untuk membuka rekam wajah tanpa login di tablet lobi atau ponsel pegawai.' : 'Titik absen dibuat oleh admin perangkat.'} /></TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.id} className={r.isActive ? undefined : 'text-muted-foreground'}>
                  <TableCell className="stack-head pl-4 lg:pl-6"><span className="font-medium">{r.name}</span><span className="block font-mono text-xs text-muted-foreground">/absen/…{r.tokenHint}</span></TableCell>
                  <TableCell data-label="Pegawai">{r.unit?.name ?? 'Semua unit'}</TableCell>
                  <TableCell data-label="Aturan" className="whitespace-normal text-sm">{[r.requireLocation ? 'Wajib di area kantor' : 'Tanpa batas lokasi', r.allowFieldDuty ? 'Melayani dinas luar' : null].filter(Boolean).join(', ')}</TableCell>
                  <TableCell data-label="Status">{r.isActive ? <StatusBadge status="SUCCESS" label="Aktif" /> : <StatusBadge status="CANCELLED" label="Nonaktif" />}</TableCell>
                  <TableCell data-label="Terakhir dipakai">{r.lastUsedAt ? fmtWaktu(r.lastUsedAt, tz) : 'Belum pernah'}</TableCell>
                  <TableCell data-label="Transaksi" className="tabular md:text-right">{r._count.events}</TableCell>
                  <TableCell className="pr-4 text-right lg:pr-6">{manage && <StationActions station={{ id: r.id, name: r.name, unitId: r.unitId, allowFieldDuty: r.allowFieldDuty, requireLocation: r.requireLocation, isActive: r.isActive }} units={units} canAllUnits={canAllUnits} used={r._count.events > 0} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>Tautan hanya tampil sekali saat dibuat. Lupa atau bocor: pilih <b>Ganti tautan</b>; tautan lama langsung mati.</p>
          <p>Setiap transaksi mencatat titik absen, waktu server, perangkat (user agent), dan jarak wajah, dan bisa ditelusuri dari rekapitulasi. Untuk mencegah titip absen lewat foto, aktifkan deteksi kedip di Metode Absensi.</p>
        </div>
      </PageBody>
    </>
  );
}
