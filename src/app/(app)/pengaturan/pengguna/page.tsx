import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { Segmented } from '@/components/app/segmented';
import { StatusBadge } from '@/components/app/status-badge';
import { EmptyState } from '@/components/app/empty-state';
import { requirePage } from '@/lib/guard';
import { can, employeeScopeWhere, scopeOf } from '@/lib/auth/actor';
import { PERMISSIONS } from '@/lib/auth/catalog';
import { prisma } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { listRoles, listUsersPage } from '@/lib/services/users';
import { KeepParams, Pager, SortableHead, TableToolbar } from '@/components/app/pagination';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Label } from '@/components/ui/label';
import { qs } from '@/lib/list';
import { Search } from 'lucide-react';
import { unitOptions } from '@/lib/services/units';
import { fmtWaktu } from '@/lib/time';
import { BulkBar, BulkHeadCell, BulkRowCell, BulkSelect } from '@/components/app/bulk-select';
import { CreateUser, RoleChip, RolePermissions, UserActions } from './forms';

export const metadata = { title: 'Pengguna & Peran' };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage(['user.manage', 'role.manage']);
  const sp = await searchParams;
  const tabs = [...(can(actor, 'user.manage') ? [{ key: 'pengguna', label: 'Pengguna', href: '?tab=pengguna' }] : []), ...(can(actor, 'role.manage') ? [{ key: 'peran', label: 'Peran & izin', href: '?tab=peran' }] : [])];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0].key;
  return (
    <>
      <PageHeader title="Pengguna & Peran" description="Akun, peran dengan cakupan unit, dan izin tiap peran. Semua perubahan tercatat di audit log." crumbs={[{ label: 'Pengaturan' }, { label: 'Pengguna & Peran' }]} />
      <PageBody className="grid gap-4">
        {tabs.length > 1 && <Segmented items={tabs} current={tab} label="Bagian" className="w-fit" />}
        {tab === 'pengguna' ? <UsersTab sp={sp} actorId={actor.userId} actor={actor} /> : <RolesTab locked={!scopeOf(actor, 'role.manage')?.all} />}
      </PageBody>
    </>
  );
}

async function UsersTab({ sp, actorId, actor }: { sp: Record<string, string | undefined>; actorId: string; actor: Awaited<ReturnType<typeof requirePage>> }) {
  const filters = { q: sp.q, status: sp.status, role: sp.role, mfa: sp.mfa };
  const [data, roles, units, tz] = await Promise.all([
    listUsersPage(actor, { ...filters, page: sp.page, per: sp.per, sort: sp.sort, dir: sp.dir }),
    listRoles(),
    unitOptions(actor, 'user.manage'),
    getSetting('org.timezone'),
  ]);
  const canAll = !!scopeOf(actor, 'user.manage')?.all;
  const users = data.rows;
  const params = { tab: 'pengguna', ...filters, sort: sp.sort, dir: sp.dir, per: sp.per };
  const sortProps = { sort: data.sort, dir: data.dir, params };
  const filtered = Object.values(filters).some(Boolean);
  return (
    <>
      <div className="flex justify-end"><CreateUser canNoEmployee={canAll} /></div>
      <form method="get" className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.2fr_1fr_1fr_auto] lg:items-end" aria-label="Filter pengguna">
        <input type="hidden" name="tab" value="pengguna" />
        <KeepParams values={{ sort: sp.sort, dir: sp.dir, per: sp.per }} />
        <div className="grid gap-2"><Label htmlFor="q">Cari</Label><div className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input id="q" name="q" type="search" defaultValue={sp.q} placeholder="Username, email, atau nama" className="pl-9" /></div></div>
        <div className="grid gap-2"><Label htmlFor="role">Peran</Label><NativeSelect id="role" name="role" defaultValue={sp.role ?? ''}><NativeSelectOption value="">Semua peran</NativeSelectOption>{roles.map((r) => <NativeSelectOption key={r.id} value={r.code}>{r.name}</NativeSelectOption>)}</NativeSelect></div>
        <div className="grid gap-2"><Label htmlFor="status">Status</Label><NativeSelect id="status" name="status" defaultValue={sp.status ?? ''}><NativeSelectOption value="">Semua</NativeSelectOption><NativeSelectOption value="aktif">Aktif</NativeSelectOption><NativeSelectOption value="nonaktif">Nonaktif</NativeSelectOption><NativeSelectOption value="terkunci">Terkunci</NativeSelectOption></NativeSelect></div>
        <div className="grid gap-2"><Label htmlFor="mfa">MFA</Label><NativeSelect id="mfa" name="mfa" defaultValue={sp.mfa ?? ''}><NativeSelectOption value="">Semua</NativeSelectOption><NativeSelectOption value="ya">Aktif</NativeSelectOption><NativeSelectOption value="tidak">Tidak aktif</NativeSelectOption></NativeSelect></div>
        <div className="flex gap-2"><Button type="submit">Terapkan</Button>{filtered && <Button asChild variant="outline"><Link href="?tab=pengguna">Reset</Link></Button>}</div>
      </form>
      <BulkSelect pageIds={users.filter((u) => u.id !== actorId).map((u) => u.id)}>
      <div className="rounded-xl border bg-card">
        <TableToolbar {...sortProps} sorts={[{ value: 'username', label: 'Username' }, { value: 'nama', label: 'Nama pegawai' }, { value: 'login', label: 'Terakhir masuk' }]}>
          <span className="tabular-nums">{data.total.toLocaleString('id-ID')}</span> pengguna{filtered ? ' sesuai filter' : ''}
        </TableToolbar>
        <Table className="table-stack">
          <TableHeader><TableRow>
            <BulkHeadCell />
            <SortableHead label="Pengguna" value="username" {...sortProps} />
            <TableHead>Peran dan cakupan</TableHead><TableHead>MFA</TableHead>
            <SortableHead label="Terakhir masuk" value="login" {...sortProps} firstDir="desc" />
            <TableHead>Status</TableHead><TableHead className="pr-4 lg:pr-6"><span className="sr-only">Aksi</span></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {users.length === 0 && <TableRow><TableCell colSpan={7}><EmptyState title="Tidak ada pengguna yang cocok" description="Ubah kata kunci atau filter." actions={[{ href: qs({ tab: 'pengguna' }), label: 'Hapus filter' }]} /></TableCell></TableRow>}
            {users.map((u) => (
              <TableRow key={u.id} className="relative">
                {u.id === actorId ? <TableCell className="w-10 pl-4 max-md:hidden lg:pl-6" /> : <BulkRowCell id={u.id} name={u.username} />}
                <TableCell className="stack-head max-md:pr-8"><span className="font-medium">{u.username}</span><span className="block text-xs text-muted-foreground">{u.employee ? `${u.employee.fullName}${u.employee.unit ? `, ${u.employee.unit.name}` : ''}` : 'Bukan akun pegawai'}</span></TableCell>
                <TableCell data-label="Peran" className="whitespace-normal">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 && <span className="text-sm text-muted-foreground">Belum ada peran</span>}
                    {u.roles.map((r) => <RoleChip key={r.id} userId={u.id} urId={r.id} label={`${r.role.name}${r.unit ? `, ${r.unit.name}${r.includeSubunits ? '+' : ''}` : r.role.code === 'PEGAWAI' ? '' : ', semua unit'}`} />)}
                  </div>
                </TableCell>
                <TableCell data-label="MFA">{u.mfaEnabled ? 'Aktif' : <span className="text-muted-foreground">Tidak</span>}</TableCell>
                <TableCell data-label="Terakhir masuk" className="text-muted-foreground">{u.lastLoginAt ? fmtWaktu(u.lastLoginAt, tz) : '-'}</TableCell>
                <TableCell data-label="Status">
                  {u.lockedUntil && u.lockedUntil > new Date() ? <StatusBadge status="FAILED" label="Terkunci sementara" /> : <StatusBadge status={u.isActive ? 'ACTIVE' : 'CANCELLED'} label={u.isActive ? 'Aktif' : 'Nonaktif'} />}
                </TableCell>
                <TableCell className="pr-4 text-right lg:pr-6">
                  <UserActions id={u.id} username={u.username} isActive={u.isActive} mfaEnabled={u.mfaEnabled} roles={roles.map((r) => ({ id: r.id, name: r.name }))} units={units} canAllUnits={canAll} self={u.id === actorId} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pager total={data.total} page={data.page} pageSize={data.pageSize} params={params} />
        <BulkBar mode="user" noun="pengguna" roles={roles.map((r) => ({ id: r.id, name: r.name }))} units={units} canAllUnits={canAll} canAccounts />
      </div>
      </BulkSelect>
      <p className="text-sm text-muted-foreground">Tanda + setelah nama unit berarti cakupan termasuk sub-unit. Peran Pegawai hanya memberi akses ke data milik sendiri.</p>
    </>
  );
}

async function RolesTab({ locked }: { locked: boolean }) {
  const roles = await listRoles();
  const groups = new Map<string, { code: string; label: string }[]>();
  for (const [code, [group, label]] of Object.entries(PERMISSIONS)) groups.set(group, [...(groups.get(group) ?? []), { code, label }]);
  const g = [...groups].map(([group, items]) => ({ group, items }));
  return (
    <div className="grid gap-6">
      {locked && <p className="text-sm text-muted-foreground">Perubahan izin peran hanya untuk pengelola dengan cakupan seluruh unit.</p>}
      {roles.map((r) => (
        <RolePermissions key={r.id} groups={g} locked={locked || r.code === 'SUPER_ADMIN'}
          role={{ id: r.id, code: r.code, name: r.name, description: r.description, users: r._count.users, perms: r.permissions.map((p) => p.permission.code) }} />
      ))}
    </div>
  );
}
