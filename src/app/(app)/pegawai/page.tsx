import Link from 'next/link';
import { CollapsibleFilters } from '@/components/app/collapsible-filters';
import { Download, Plus, Search, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { Pager, SortLink } from '@/components/app/pagination';
import { StatusBadge } from '@/components/app/status-badge';
import { requirePage } from '@/lib/guard';
import { can } from '@/lib/auth/actor';
import { listEmployees } from '@/lib/services/employees';
import { unitOptions } from '@/lib/services/units';
import { pendingVerifications } from '@/lib/services/biometrics';
import { VerifyButtons } from './verify-buttons';

export const metadata = { title: 'Data Pegawai' };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['employee.read']);
  const sp = await searchParams;
  const params = { q: sp.q, unitId: sp.unitId, status: sp.status, face: sp.face, sort: sp.sort, employmentStatus: sp.employmentStatus };
  const [data, units] = await Promise.all([
    listEmployees(actor, { ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), page: sp.page || 1 }),
    unitOptions(actor, 'employee.read'),
  ]);
  const pending = sp.face === 'menunggu' ? await pendingVerifications(actor) : [];
  const filtered = !!(sp.q || sp.unitId || (sp.status && sp.status !== 'aktif') || sp.face || sp.employmentStatus);
  const exportQs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>).toString();
  return (
    <>
      <PageHeader
        title="Data Pegawai"
        description={`${data.total} pegawai${filtered ? ' sesuai filter' : ''}`}
        actions={
          <>
            {can(actor, 'employee.write') && <Button asChild><Link href="/pegawai/baru"><Plus />Tambah pegawai</Link></Button>}
            {can(actor, 'employee.import') && <Button asChild variant="outline"><Link href="/pegawai/impor"><Upload />Impor</Link></Button>}
            {can(actor, 'employee.export') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline"><Download />Ekspor</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild><a href={`/api/v1/employees/export?format=xlsx&${exportQs}`}>Excel (.xlsx)</a></DropdownMenuItem>
                  <DropdownMenuItem asChild><a href={`/api/v1/employees/export?format=csv&${exportQs}`}>CSV</a></DropdownMenuItem>
                  {can(actor, 'employee.read_sensitive') && <DropdownMenuItem asChild><a href={`/api/v1/employees/export?format=xlsx&nik=1&${exportQs}`}>Excel dengan NIK (tercatat di audit)</a></DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />
      <PageBody className="grid gap-4">
        <CollapsibleFilters active={Object.entries(sp).filter(([k, v]) => v && !['page', 'sort', 'lihat', 'kategori', 'status', 'tab'].includes(k)).length}>
        <form method="get" className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[2fr_1.4fr_1fr_1fr_auto] md:items-end" aria-label="Cari dan filter pegawai">
          <div className="grid gap-2">
            <Label htmlFor="q">Cari</Label>
            <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="q" name="q" type="search" defaultValue={sp.q} placeholder="Nama, NIP, jabatan, atau ID mesin" className="rounded-full pl-9" /></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="unitId">Unit kerja</Label>
            <NativeSelect id="unitId" name="unitId" defaultValue={sp.unitId ?? ''}><NativeSelectOption value="">Semua unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect>
          </div>
          <div className="grid gap-2"><Label htmlFor="status">Status</Label>
            <NativeSelect id="status" name="status" defaultValue={sp.status ?? 'aktif'}><NativeSelectOption value="aktif">Aktif</NativeSelectOption><NativeSelectOption value="nonaktif">Nonaktif</NativeSelectOption><NativeSelectOption value="semua">Semua</NativeSelectOption></NativeSelect>
          </div>
          <div className="grid gap-2"><Label htmlFor="face">Wajah</Label>
            <NativeSelect id="face" name="face" defaultValue={sp.face ?? ''}><NativeSelectOption value="">Semua</NativeSelectOption><NativeSelectOption value="terdaftar">Terdaftar</NativeSelectOption><NativeSelectOption value="belum">Belum terdaftar</NativeSelectOption><NativeSelectOption value="menunggu">Menunggu verifikasi</NativeSelectOption></NativeSelect>
          </div>
          <div className="flex gap-2"><Button type="submit">Terapkan</Button>{filtered && <Button asChild variant="outline"><Link href="/pegawai">Reset</Link></Button>}</div>
        </form>
        </CollapsibleFilters>

        {sp.face === 'menunggu' && pending.length > 0 && (
          <div className="rounded-xl border bg-card">
            <h2 className="border-b px-4 py-3 font-semibold lg:px-6">Pendaftaran wajah menunggu verifikasi</h2>
            <ul className="divide-y">
              {pending.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-6">
                  <span><Link href={`/pegawai/${b.employee.id}`} className="font-medium hover:underline">{b.employee.fullName}</Link><span className="block text-sm text-muted-foreground">{b.employee.unit?.name ?? 'Tanpa unit'}, {b.sampleCount} sampel</span></span>
                  {can(actor, 'biometric.manage') && <VerifyButtons id={b.id} name={b.employee.fullName} />}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl border bg-card">
          <Table className="table-stack">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 lg:pl-6"><SortLink label="Nama" value="nama" current={sp.sort ?? 'nama'} params={params} /></TableHead>
                <TableHead><SortLink label="NIP" value="nip" current={sp.sort ?? 'nama'} params={params} /></TableHead>
                <TableHead>Jabatan</TableHead>
                <TableHead><SortLink label="Unit" value="unit" current={sp.sort ?? 'nama'} params={params} /></TableHead>
                <TableHead>Status kepegawaian</TableHead>
                <TableHead>Wajah</TableHead>
                <TableHead className="pr-4 lg:pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 && (
                <TableRow><TableCell colSpan={7}>
                  {filtered
                    ? <EmptyState filtered title="Tidak ada pegawai yang cocok" description="Coba kata kunci lain atau hapus filter." actions={[{ href: '/pegawai', label: 'Tampilkan semua pegawai' }]} />
                    : <EmptyState title="Belum ada data pegawai" description="Tambahkan satu per satu atau impor dari Excel." actions={can(actor, 'employee.write') ? [{ href: '/pegawai/baru', label: 'Tambah pegawai', primary: true }, { href: '/pegawai/impor', label: 'Impor dari Excel' }] : undefined} />}
                </TableCell></TableRow>
              )}
              {data.rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="stack-head pl-4 lg:pl-6"><Link href={`/pegawai/${e.id}`} className="font-medium text-primary hover:underline">{[e.frontTitle, e.fullName].filter(Boolean).join(' ')}{e.backTitle ? `, ${e.backTitle}` : ''}</Link>{e.email && <span className="block text-xs text-muted-foreground max-md:hidden">{e.email}</span>}
                    <span className="mt-1 block text-sm md:hidden">
                      {[e.position, e.unit?.name].filter(Boolean).join(', ') || 'Jabatan dan unit belum diisi'}
                      <span className="block text-xs text-muted-foreground tabular">{[e.employeeNumber ? `NIP ${e.employeeNumber}` : null, e.employmentStatus, e.faceStatus === 'ACTIVE' ? 'wajah terdaftar' : e.faceStatus === 'PENDING_VERIFICATION' ? 'wajah menunggu verifikasi' : 'wajah belum terdaftar'].filter(Boolean).join(', ')}</span>
                      {!e.isActive && <StatusBadge status="CANCELLED" label="Nonaktif" className="mt-1" />}
                    </span>
                  </TableCell>
                  <TableCell data-label="NIP" className="max-md:hidden! tabular">{e.employeeNumber ?? '-'}{e.machinePin && <span className="block text-xs text-muted-foreground">ID mesin {e.machinePin}</span>}</TableCell>
                  <TableCell data-label="Jabatan" className="max-md:hidden! whitespace-normal">{e.position ?? '-'}{e.rank && <span className="block text-xs text-muted-foreground">{e.rank}</span>}</TableCell>
                  <TableCell data-label="Unit" className="max-md:hidden! whitespace-normal">{e.unit?.name ?? '-'}</TableCell>
                  <TableCell data-label="Status kepegawaian" className="max-md:hidden!">{e.employmentStatus ?? '-'}</TableCell>
                  <TableCell data-label="Wajah" className="max-md:hidden!">{e.faceStatus ? <StatusBadge status={e.faceStatus} /> : <span className="text-sm text-muted-foreground">Belum</span>}</TableCell>
                  <TableCell data-label="Status" className="max-md:hidden! pr-4 lg:pr-6"><StatusBadge status={e.isActive ? 'APPROVED' : 'CANCELLED'} label={e.isActive ? 'Aktif' : 'Nonaktif'} /></TableCell>
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
