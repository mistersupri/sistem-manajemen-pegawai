import { CollapsibleFilters } from '@/components/app/collapsible-filters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { KeepParams, Pager, SortableHead, TableToolbar } from '@/components/app/pagination';
import { requirePage } from '@/lib/guard';
import { getSetting } from '@/lib/settings';
import { listAudit } from '@/lib/services/settings-admin';
import { fmtWaktu, isValidDate } from '@/lib/time';

export const metadata = { title: 'Audit Log' };

const AREAS = [
  ['auth', 'Masuk dan keluar'], ['user', 'Pengguna'], ['role', 'Peran'], ['employee', 'Pegawai'], ['biometric', 'Data wajah'], ['attendance', 'Absensi'],
  ['correction', 'Koreksi'], ['leave', 'Cuti & izin'], ['schedule', 'Jadwal'], ['holiday', 'Hari libur'], ['device', 'Perangkat'], ['settings', 'Pengaturan'], ['unit', 'Unit kerja'], ['privacy', 'Privasi'],
];

function Json({ label, value }: { label: string; value: unknown }) {
  if (value == null || (typeof value === 'object' && !Object.keys(value as object).length)) return null;
  return <div><span className="text-xs font-medium text-muted-foreground">{label}</span><pre className="mt-0.5 max-h-48 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre></div>;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['audit.read']);
  const sp = await searchParams;
  const q = { q: sp.q?.trim() || undefined, action: sp.action || undefined, result: (sp.result === 'SUCCESS' || sp.result === 'FAILURE' ? sp.result : undefined) as 'SUCCESS' | 'FAILURE' | undefined, from: isValidDate(sp.from) ? sp.from : undefined, to: isValidDate(sp.to) ? sp.to : undefined, page: sp.page, per: sp.per, sort: sp.sort, dir: sp.dir };
  const [data, tz] = await Promise.all([listAudit(actor, q), getSetting('org.timezone')]);
  const filtered = !!(q.q || q.action || q.result || q.from || q.to);
  const params = { q: q.q, action: q.action, result: q.result, from: q.from, to: q.to, sort: sp.sort, dir: sp.dir, per: sp.per };
  const sortProps = { sort: data.sort, dir: data.dir, params };
  return (
    <>
      <PageHeader title="Audit Log" description="Catatan siapa melakukan apa dan kapan. Hanya bisa ditambah; tidak bisa diubah atau dihapus dari aplikasi maupun database." crumbs={[{ label: 'Pengaturan' }, { label: 'Audit Log' }]} />
      <PageBody className="grid gap-4">
        <CollapsibleFilters active={Object.entries(sp).filter(([k, v]) => v && !['page', 'sort', 'lihat', 'kategori', 'status', 'tab'].includes(k)).length}>
        <form className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4">
          <label className="grid gap-1 text-sm font-medium" htmlFor="q">Cari<Input id="q" name="q" defaultValue={q.q ?? ''} placeholder="Pelaku, aksi, atau ID data" className="w-60" /></label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="action">Area<NativeSelect id="action" name="action" defaultValue={q.action ?? ''} className="min-w-44"><NativeSelectOption value="">Semua</NativeSelectOption>{AREAS.map(([v, l]) => <NativeSelectOption key={v} value={v}>{l}</NativeSelectOption>)}</NativeSelect></label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="result">Hasil<NativeSelect id="result" name="result" defaultValue={q.result ?? ''} className="min-w-32"><NativeSelectOption value="">Semua</NativeSelectOption><NativeSelectOption value="SUCCESS">Berhasil</NativeSelectOption><NativeSelectOption value="FAILURE">Gagal</NativeSelectOption></NativeSelect></label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="from">Dari<Input id="from" name="from" type="date" defaultValue={q.from ?? ''} /></label>
          <label className="grid gap-1 text-sm font-medium" htmlFor="to">Sampai<Input id="to" name="to" type="date" defaultValue={q.to ?? ''} /></label>
          <KeepParams values={{ sort: sp.sort, dir: sp.dir, per: sp.per }} />
          <Button type="submit">Terapkan</Button>
          {filtered && <Button asChild variant="outline"><a href="/pengaturan/audit">Reset</a></Button>}
        </form>
        </CollapsibleFilters>
        <div className="rounded-xl border bg-card">
          <TableToolbar {...sortProps} sorts={[{ value: 'waktu', label: 'Waktu' }, { value: 'pelaku', label: 'Pelaku' }, { value: 'aksi', label: 'Aksi' }]}>
            <span className="tabular-nums">{data.total.toLocaleString('id-ID')}</span> catatan{filtered ? ' sesuai filter' : ''}
          </TableToolbar>
          <Table className="table-stack">
            <TableHeader><TableRow><SortableHead label="Waktu" value="waktu" {...sortProps} firstDir="desc" className="pl-4 lg:pl-6" /><SortableHead label="Pelaku" value="pelaku" {...sortProps} /><SortableHead label="Aksi" value="aksi" {...sortProps} /><TableHead>Data</TableHead><TableHead>Hasil</TableHead><TableHead className="pr-4 lg:pr-6">Rincian</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.rows.length === 0 && <TableRow><TableCell colSpan={6}><EmptyState title="Tidak ada catatan" filtered={filtered} description={filtered ? 'Ubah kata kunci, area, atau rentang tanggal.' : undefined} actions={filtered ? [{ href: '/pengaturan/audit', label: 'Hapus filter' }] : undefined} /></TableCell></TableRow>}
              {data.rows.map((a) => (
                <TableRow key={a.id} className="align-top">
                  <TableCell className="stack-head pl-4 tabular lg:pl-6">{fmtWaktu(a.createdAt, tz)}</TableCell>
                  <TableCell data-label="Pelaku">{a.actorLabel ?? '-'}{a.ip && <span className="block text-xs text-muted-foreground">{a.ip}</span>}</TableCell>
                  <TableCell data-label="Aksi"><code className="text-xs">{a.action}</code></TableCell>
                  <TableCell data-label="Data" className="text-xs text-muted-foreground">{a.entityType ?? '-'}{a.entityId && <span className="block max-w-40 truncate" title={a.entityId}>{a.entityId}</span>}</TableCell>
                  <TableCell data-label="Hasil"><StatusBadge status={a.result === 'SUCCESS' ? 'SUCCESS' : 'FAILED'} label={a.result === 'SUCCESS' ? 'Berhasil' : 'Gagal'} /></TableCell>
                  <TableCell className="pr-4 lg:pr-6">
                    {(a.before || a.after || a.meta) ? (
                      <details className="max-w-md">
                        <summary className="cursor-pointer text-sm text-primary">Lihat</summary>
                        <div className="mt-2 grid gap-2"><Json label="Sebelum" value={a.before} /><Json label="Sesudah" value={a.after} /><Json label="Keterangan" value={a.meta} /></div>
                      </details>
                    ) : <span className="text-muted-foreground">-</span>}
                  </TableCell>
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
