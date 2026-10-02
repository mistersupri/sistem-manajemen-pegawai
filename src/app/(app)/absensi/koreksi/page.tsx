import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge, REQUEST_LABEL } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { Pager } from '@/components/app/pagination';
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
  const [data, s] = await Promise.all([listCorrections(actor, { scope: view, status, page: sp.page }), getSettings()]);
  const link = (x: Record<string, string>) => `?${new URLSearchParams({ lihat: view, status, ...x })}`;
  return (
    <>
      <PageHeader
        title="Koreksi Absensi"
        description="Pengajuan perbaikan absensi dengan alasan dan persetujuan. Nilai awal tetap tersimpan."
        actions={actor.employeeId && can(actor, 'correction.request') ? <Button asChild><Link href="/absensi/koreksi/baru"><Plus />Ajukan koreksi</Link></Button> : undefined}
      />
      <PageBody className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {canReview && actor.employeeId && (
            <nav className="flex gap-1 rounded-full border bg-card p-1" aria-label="Tampilan">
              {[['saya', 'Pengajuan saya'], ['tinjau', 'Perlu ditinjau']].map(([k, l]) => (
                <Link key={k} href={`?lihat=${k}`} aria-current={view === k ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium ${view === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{l}</Link>
              ))}
            </nav>
          )}
          <nav className="flex flex-wrap gap-1 rounded-full border bg-card p-1" aria-label="Filter status">
            {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL'].map((k) => (
              <Link key={k} href={link({ status: k })} aria-current={status === k ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium ${status === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{k === 'ALL' ? 'Semua' : REQUEST_LABEL[k]}</Link>
            ))}
          </nav>
        </div>
        <div className="rounded-xl border bg-card">
          <Table className="table-stack">
            <TableHeader><TableRow>{view === 'tinjau' && <TableHead className="pl-4 lg:pl-6">Pegawai</TableHead>}<TableHead className={view === 'tinjau' ? '' : 'pl-4 lg:pl-6'}>Tanggal absensi</TableHead><TableHead>Jenis</TableHead><TableHead>Usulan</TableHead><TableHead>Diajukan</TableHead><TableHead className="pr-4 lg:pr-6">Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.rows.length === 0 && <TableRow><TableCell colSpan={6}><EmptyState title={view === 'tinjau' ? 'Tidak ada koreksi untuk ditinjau' : 'Belum ada pengajuan koreksi'} description={view === 'saya' ? `Ajukan koreksi bila lupa absen atau ada gangguan alat, maksimal ${s['rules.backdateDays']} hari ke belakang.` : undefined} /></TableCell></TableRow>}
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
          <Pager total={data.total} page={data.page} pageSize={data.pageSize} params={{ lihat: view, status }} />
        </div>
      </PageBody>
    </>
  );
}
