import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { KeepParams, Pager, SortableHead, TableToolbar } from '@/components/app/pagination';
import { requirePage } from '@/lib/guard';
import { getSetting } from '@/lib/settings';
import { balanceTable } from '@/lib/services/leave';
import { unitOptions } from '@/lib/services/units';
import { todayIn } from '@/lib/time';
import { BalanceEdit, GenerateBalances } from './forms';

export const metadata = { title: 'Saldo cuti' };

export default async function BalancesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['leave.manage']);
  const sp = await searchParams;
  const thisYear = Number(todayIn(await getSetting('org.timezone')).slice(0, 4));
  const year = Number(sp.tahun) >= 2000 && Number(sp.tahun) <= 2100 ? Number(sp.tahun) : thisYear;
  const units = await unitOptions(actor, 'leave.manage');
  const unit = units.some((u) => u.id === sp.unit) ? sp.unit : undefined;
  const data = await balanceTable(actor, year, { unitId: unit, q: sp.q?.trim() || undefined, page: Number(sp.page) || 1, per: Number(sp.per) || undefined, sort: sp.sort, dir: sp.dir === 'desc' ? 'desc' : 'asc' });
  const params = { tahun: String(year), unit, q: sp.q, sort: sp.sort, dir: sp.dir, per: sp.per };
  const sortProps = { sort: data.sort, dir: data.dir, params };
  const yearHref = (y: number) => `?${new URLSearchParams(Object.entries({ ...params, tahun: String(y) }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <>
      <PageHeader
        title="Saldo cuti"
        description="Hak cuti per pegawai per tahun. Sisa = hak + sisa tahun lalu + penyesuaian, dikurangi yang disetujui dan yang masih menunggu."
        crumbs={[{ href: '/cuti', label: 'Cuti & Izin' }, { label: 'Saldo' }]}
        actions={<GenerateBalances year={year} />}
      />
      <PageBody className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon" aria-label="Tahun sebelumnya"><Link href={yearHref(year - 1)}><ChevronLeft /></Link></Button>
            <h2 className="min-w-20 text-center text-lg font-semibold tabular">{year}</h2>
            <Button asChild variant="outline" size="icon" aria-label="Tahun berikutnya"><Link href={yearHref(year + 1)}><ChevronRight /></Link></Button>
          </div>
          <form className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="tahun" value={year} />
            <label className="grid gap-1 text-sm font-medium" htmlFor="q">Cari<Input id="q" name="q" defaultValue={sp.q ?? ''} placeholder="Nama atau NIP" className="w-56" /></label>
            <label className="grid gap-1 text-sm font-medium" htmlFor="unit">Unit<NativeSelect id="unit" name="unit" defaultValue={unit ?? ''} className="min-w-48"><NativeSelectOption value="">Semua</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect></label>
            <KeepParams values={{ sort: sp.sort, dir: sp.dir, per: sp.per }} />
            <Button type="submit" variant="outline">Tampilkan</Button>
          </form>
        </div>
        {data.types.length === 0 ? (
          <div className="rounded-xl border bg-card"><EmptyState title="Belum ada jenis cuti yang memakai saldo" description="Atur jenis cuti di Pengaturan, Aturan Absensi." actions={[{ href: '/pengaturan/aturan#cuti', label: 'Atur jenis cuti', primary: true }]} /></div>
        ) : (
          <div className="rounded-xl border bg-card">
            <TableToolbar {...sortProps} sorts={[{ value: 'nama', label: 'Nama' }, { value: 'unit', label: 'Unit' }]}>
              <span className="tabular-nums">{data.total.toLocaleString('id-ID')}</span> pegawai
            </TableToolbar>
            <Table className="table-stack">
              <TableHeader><TableRow><SortableHead label="Pegawai" value="nama" {...sortProps} className="pl-4 lg:pl-6" />{data.types.map((t) => <TableHead key={t.id}>{t.name}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {data.rows.length === 0 && <TableRow><TableCell colSpan={data.types.length + 1}><EmptyState title="Tidak ada pegawai" filtered={!!(sp.q || unit)} /></TableCell></TableRow>}
                {data.rows.map((r) => (
                  <TableRow key={r.employee.id}>
                    <TableCell className="stack-head pl-4 lg:pl-6"><span className="font-medium">{r.employee.fullName}</span><span className="block text-xs text-muted-foreground">{[r.employee.employeeNumber, r.employee.unit?.name].filter(Boolean).join(', ')}</span></TableCell>
                    {r.cells.map((c, i) => (
                      <TableCell key={c.leaveTypeId} data-label={data.types[i].name}>
                        <div className="flex items-center gap-3">
                          {c.configured ? (
                            <span className="tabular"><b>{c.remaining}</b><span className="text-muted-foreground"> / {c.entitled}</span>{c.reserved > 0 && <span className="block text-xs text-muted-foreground">{c.reserved} menunggu</span>}</span>
                          ) : <span className="text-sm text-muted-foreground">Belum diatur</span>}
                          <BalanceEdit employee={r.employee.fullName} employeeId={r.employee.id} type={data.types[i]} year={year} cell={c} />
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pager total={data.total} page={data.page} pageSize={data.pageSize} params={params} />
          </div>
        )}
      </PageBody>
    </>
  );
}
