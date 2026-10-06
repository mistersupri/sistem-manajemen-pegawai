import Link from 'next/link';
import { FileUp, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { CollapsibleFilters } from '@/components/app/collapsible-filters';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge, REQUEST_LABEL } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { Segmented } from '@/components/app/segmented';
import { KeepParams, Pager, SortableHead, TableToolbar } from '@/components/app/pagination';
import { qs } from '@/lib/list';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { KIND_LABEL, listCorrections } from '@/lib/services/corrections';
import { getSettings } from '@/lib/settings';
import { fmtTglPendek, fmtWaktu, fromDbDate } from '@/lib/time';

export const metadata = { title: 'Koreksi Absensi' };

export default async function CorrectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['correction.request', 'correction.review']);
  const sp = await searchParams;
  const canReview = can(actor, 'correction.review');
  const view = sp.lihat === 'tinjau' && canReview ? 'tinjau' : actor.employeeId ? 'saya' : canReview ? 'tinjau' : 'saya';
  const status = sp.status ?? (view === 'tinjau' ? 'PENDING' : 'ALL');
  const filters = { jenis: sp.jenis, q: sp.q, dari: sp.dari, sampai: sp.sampai };
  const [data, s] = await Promise.all([
    listCorrections(actor, { scope: view, status, kind: sp.jenis, q: view === 'tinjau' ? sp.q : undefined, from: sp.dari, to: sp.sampai, page: sp.page, per: sp.per, sort: sp.sort, dir: sp.dir }),
    getSettings(),
  ]);
  const params = { lihat: view, status, ...filters, sort: sp.sort, dir: sp.dir, per: sp.per };
  const link = (x: Record<string, string>) => qs({ ...params, page: undefined, ...x });
  const sortProps = { sort: data.sort, dir: data.dir, params };
  const filtered = Object.values(filters).some(Boolean);
  return (
    <>
      <PageHeader
        title="Koreksi Absensi"
        description="Pengajuan perbaikan absensi dengan alasan dan persetujuan. Nilai awal tetap tersimpan."
        actions={
          <>
            {canReview && <Button asChild variant="outline"><Link href="/absensi/koreksi/impor"><FileUp />Impor dari Excel</Link></Button>}
            {actor.employeeId && can(actor, 'correction.request') && <Button asChild><Link href="/absensi/koreksi/baru"><Plus />Ajukan koreksi</Link></Button>}
          </>
        }
      />
      <PageBody className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {canReview && actor.employeeId && (
            <Segmented label="Tampilan" current={view} items={[['saya', 'Pengajuan saya'], ['tinjau', 'Perlu ditinjau']].map(([k, l]) => ({ key: k, label: l, href: qs({ lihat: k }) }))} />
          )}
          <Segmented label="Filter status" current={status} items={['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL'].map((k) => ({ key: k, label: k === 'ALL' ? 'Semua' : REQUEST_LABEL[k], href: link({ status: k }) }))} />
        </div>
        <CollapsibleFilters active={Object.values(filters).filter(Boolean).length}>
          <form method="get" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1fr_auto] lg:items-end" aria-label="Filter koreksi">
            <input type="hidden" name="lihat" value={view} />
            <input type="hidden" name="status" value={status} />
            <KeepParams values={{ sort: sp.sort, dir: sp.dir, per: sp.per }} />
            {view === 'tinjau' ? (
              <div className="grid gap-2"><Label htmlFor="q">Pegawai</Label><div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="q" name="q" type="search" defaultValue={sp.q} placeholder="Nama atau NIP" className="pl-9" /></div></div>
            ) : <div className="max-lg:hidden" />}
            <div className="grid gap-2"><Label htmlFor="jenis">Jenis</Label><NativeSelect id="jenis" name="jenis" defaultValue={sp.jenis ?? ''}><NativeSelectOption value="">Semua jenis</NativeSelectOption>{Object.entries(KIND_LABEL).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}</NativeSelect></div>
            <div className="grid gap-2"><Label htmlFor="dari">Tanggal absensi dari</Label><Input id="dari" name="dari" type="date" defaultValue={sp.dari} /></div>
            <div className="grid gap-2"><Label htmlFor="sampai">Sampai</Label><Input id="sampai" name="sampai" type="date" defaultValue={sp.sampai} /></div>
            <div className="flex gap-2"><Button type="submit">Terapkan</Button>{filtered && <Button asChild variant="outline"><Link href={qs({ lihat: view, status })}>Reset</Link></Button>}</div>
          </form>
        </CollapsibleFilters>
        <div className="rounded-xl border bg-card">
          <TableToolbar {...sortProps} sorts={[{ value: 'diajukan', label: 'Waktu diajukan' }, { value: 'tanggal', label: 'Tanggal absensi' }, ...(view === 'tinjau' ? [{ value: 'nama', label: 'Nama pegawai' }] : []), { value: 'status', label: 'Status' }]}>
            <span className="tabular-nums">{data.total.toLocaleString('id-ID')}</span> pengajuan{filtered ? ' sesuai filter' : ''}
          </TableToolbar>
          <Table className="table-stack">
            <TableHeader><TableRow>
              {view === 'tinjau' && <SortableHead label="Pegawai" value="nama" {...sortProps} className="pl-4 lg:pl-6" />}
              <SortableHead label="Tanggal absensi" value="tanggal" {...sortProps} firstDir="desc" className={view === 'tinjau' ? '' : 'pl-4 lg:pl-6'} />
              <TableHead>Jenis</TableHead><TableHead>Usulan</TableHead>
              <SortableHead label="Diajukan" value="diajukan" {...sortProps} firstDir="desc" />
              <SortableHead label="Status" value="status" {...sortProps} className="pr-4 lg:pr-6" />
            </TableRow></TableHeader>
            <TableBody>
              {data.rows.length === 0 && <TableRow><TableCell colSpan={6}>{filtered
                ? <EmptyState title="Tidak ada pengajuan yang cocok" description="Ubah filter atau rentang tanggal." actions={[{ href: qs({ lihat: view, status }), label: 'Hapus filter' }]} />
                : <EmptyState title={view === 'tinjau' ? 'Tidak ada koreksi untuk ditinjau' : 'Belum ada pengajuan koreksi'} description={view === 'saya' ? `Ajukan koreksi bila lupa absen atau ada gangguan alat, maksimal ${s['rules.backdateDays']} hari ke belakang.` : 'Pengajuan baru dari pegawai di unit Anda akan muncul di sini.'} actions={view === 'saya' && can(actor, 'correction.request') ? [{ href: '/absensi/koreksi/baru', label: 'Ajukan koreksi', primary: true }] : undefined} />}</TableCell></TableRow>}
              {data.rows.map((c) => (
                <TableRow key={c.id}>
                  {view === 'tinjau' && <TableCell className="stack-head pl-4 lg:pl-6"><span className="font-medium">{c.employee.fullName}</span><span className="block text-xs text-muted-foreground">{c.employee.unit?.name ?? ''}</span></TableCell>}
                  <TableCell data-label="Tanggal" className={view === 'tinjau' ? '' : 'stack-head pl-4 lg:pl-6'}><Link className="font-medium text-primary hover:underline" href={`/absensi/koreksi/${c.id}`}>{fmtTglPendek(fromDbDate(c.workDate))}</Link></TableCell>
                  <TableCell data-label="Jenis" className="whitespace-normal">{KIND_LABEL[c.kind] ?? c.kind}</TableCell>
                  <TableCell data-label="Usulan" className="tabular">{[c.proposedCheckIn && `masuk ${c.proposedCheckIn}`, c.proposedCheckOut && `pulang ${c.proposedCheckOut}`, c.proposedStatus].filter(Boolean).join(', ') || '-'}</TableCell>
                  <TableCell data-label="Diajukan" className="text-muted-foreground">{fmtWaktu(c.createdAt, s['org.timezone'])}</TableCell>
                  <TableCell data-label="Status" className="pr-4 lg:pr-6"><StatusBadge status={c.status} /></TableCell>
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
