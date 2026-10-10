import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { Segmented } from '@/components/app/segmented';
import { KeepParams, Pager } from '@/components/app/pagination';
import { requirePage } from '@/lib/guard';
import { assessorLoads, periodOverview, unitMaps } from '@/lib/services/assessment-mapping';
import { monthText } from '@/lib/services/performance';
import { unitOptions } from '@/lib/services/units';
import { qs } from '@/lib/list';
import { AddAssessor, AssessorChip, AutoAssignCard, RemindButton, UnitMapCard } from './forms';

export const metadata = { title: 'Penilai Kinerja' };

export default async function AssessorsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['assess.manage']);
  const { id } = await params;
  const sp = await searchParams;
  const [data, loads, maps, units] = await Promise.all([
    periodOverview(actor, id, { q: sp.q, unitId: sp.unitId, status: sp.status, page: sp.page, per: sp.per }),
    assessorLoads(actor, id),
    unitMaps(actor, id),
    unitOptions(actor, 'assess.manage'),
  ]);
  const { period } = data;
  const pendingTotal = loads.reduce((n, l) => n + l.pending, 0);
  const doneTotal = loads.reduce((n, l) => n + l.done, 0);
  const maxLoad = Math.max(1, ...loads.map((l) => l.total));
  const filters = { q: sp.q, unitId: sp.unitId, status: sp.status };
  const listParams = { ...filters, per: sp.per };
  const filtered = !!(sp.q || sp.unitId || (sp.status && sp.status !== 'semua'));
  return (
    <>
      <PageHeader
        title={`Penilai ${monthText(period.month)}`}
        description={`${doneTotal} dari ${doneTotal + pendingTotal} penilaian selesai. Atur siapa menilai siapa, acak, atau petakan per unit; periksa juga siapa yang belum menilai.`}
        crumbs={[{ href: '/kinerja/periode', label: 'Kelola Penilaian' }, { href: `/kinerja/periode/${id}`, label: monthText(period.month) }, { label: 'Penilai' }]}
        actions={!period.isClosed ? <RemindButton periodId={id} pendingCount={pendingTotal} /> : undefined}
      />
      <PageBody className="grid gap-6">
        {period.isClosed && <p className="rounded-lg border bg-muted px-4 py-3 text-sm">Periode ini sudah ditutup. Buka kembali dari halaman hasil untuk mengubah penilai.</p>}
        {!period.isClosed && (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <AutoAssignCard periodId={id} units={units} peerCount={period.peerCount} />
            <UnitMapCard periodId={id} units={units} />
          </div>
        )}
        {maps.length > 0 && (
          <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary/60 lg:px-6">Riwayat pemetaan unit ({maps.length})</summary>
            <ul className="divide-y border-t text-sm">
              {maps.map((m) => (
                <li key={m.id} className="px-4 py-2.5 lg:px-6"><b>{m.assessorUnit}</b> menilai <b>{m.targetUnit}</b>: {m.mode === 'SEMUA' ? 'semua menilai semua' : `acak, ${m.perTarget} penilai per pegawai`}{m.includeSubunits ? ', termasuk sub-unit' : ''}. <span className="text-muted-foreground tabular-nums">{m.created} penugasan dibuat.</span></li>
              ))}
            </ul>
          </details>
        )}

        <details className="rounded-xl border bg-card" open={loads.length > 0 && loads.length <= 12}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium transition-colors hover:bg-secondary/60 lg:px-6">Beban tiap penilai ({loads.length} penilai)</summary>
          {loads.length === 0 ? <p className="border-t px-4 py-3 text-sm text-muted-foreground lg:px-6">Belum ada penugasan.</p> : (
            <ul className="max-h-96 divide-y overflow-y-auto border-t">
              {loads.map((l) => (
                <li key={l.id} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_14rem_8rem] sm:items-center lg:px-6">
                  <span className="min-w-0 truncate"><span className="font-medium">{l.fullName}</span>{l.unit && <span className="ml-1.5 text-xs text-muted-foreground">{l.unit}</span>}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${(l.total / maxLoad) * 100}%` }} /></span>
                  <span className="tabular-nums text-muted-foreground sm:text-right">{l.done}/{l.total} selesai{l.pending ? `, ${l.pending} belum` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </details>

        <section aria-label="Penilai per pegawai" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented label="Filter status" current={sp.status ?? 'semua'} className="w-fit"
              items={[['semua', 'Semua'], ['belum', 'Ada yang belum menilai'], ['selesai', 'Semua sudah menilai'], ['kurang', 'Belum ada penilai']].map(([k, l]) => ({ key: k, label: l, href: qs({ ...listParams, status: k === 'semua' ? undefined : k, page: undefined }) }))} />
          </div>
          <form method="get" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1.4fr_auto] sm:items-end" aria-label="Cari pegawai">
            <KeepParams values={{ status: sp.status, per: sp.per }} />
            <div className="grid gap-2"><Label htmlFor="q">Cari pegawai</Label><div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="q" name="q" type="search" defaultValue={sp.q} placeholder="Nama atau NIP" className="pl-9" /></div></div>
            <div className="grid gap-2"><Label htmlFor="unitId">Unit kerja</Label><NativeSelect id="unitId" name="unitId" defaultValue={sp.unitId ?? ''}><NativeSelectOption value="">Semua unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect></div>
            <div className="flex gap-2"><Button type="submit">Terapkan</Button>{filtered && <Button asChild variant="outline"><Link href={`/kinerja/periode/${id}/penilai`}>Reset</Link></Button>}</div>
          </form>
          <div className="rounded-xl border bg-card">
            {data.rows.length === 0 ? (
              <EmptyState title={filtered ? 'Tidak ada pegawai yang cocok' : 'Belum ada pegawai'} description={filtered ? 'Coba kata kunci atau filter lain.' : 'Pegawai aktif yang berakun muncul di sini.'} />
            ) : (
              <Table className="table-stack">
                <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Pegawai yang dinilai</TableHead><TableHead>Penilai dan statusnya</TableHead><TableHead className="pr-4 lg:pr-6"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.rows.map((r) => {
                    const done = r.assessors.filter((a) => a.status === 'SUBMITTED').length;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="stack-head pl-4 align-top lg:pl-6"><span className="font-medium">{r.fullName}</span><span className="block text-xs text-muted-foreground">{[r.unit?.name, r.position].filter(Boolean).join(', ') || '-'}</span><span className="mt-1 block text-xs tabular-nums text-muted-foreground">{r.assessors.length ? `${done} dari ${r.assessors.length} sudah menilai` : 'Belum ada penilai'}</span></TableCell>
                        <TableCell data-label="Penilai" className="whitespace-normal">
                          {r.assessors.length === 0 ? <span className="text-sm text-muted-foreground">Belum ada penilai.</span> : (
                            <ul className="flex flex-wrap gap-1.5">
                              {r.assessors.map((a) => <AssessorChip key={a.id} id={a.id} name={a.assessor.fullName} unit={a.assessor.unit?.name ?? null} role={a.role} status={a.status} source={a.source} />)}
                            </ul>
                          )}
                        </TableCell>
                        <TableCell className="pr-4 align-top lg:pr-6">{!period.isClosed && <AddAssessor periodId={id} targetId={r.id} targetName={r.fullName} hasBoss={r.assessors.some((a) => a.role === 'ATASAN')} />}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <Pager total={data.total} page={data.page} pageSize={data.pageSize} params={listParams} />
          </div>
        </section>
      </PageBody>
    </>
  );
}
