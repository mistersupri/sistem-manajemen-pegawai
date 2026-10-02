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
import { listRoles, listUsers } from '@/lib/services/users';
import { unitOptions } from '@/lib/services/units';
import { fmtWaktu } from '@/lib/time';
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
        {tab === 'pengguna' ? <UsersTab q={sp.q} actorId={actor.userId} actor={actor} /> : <RolesTab locked={!scopeOf(actor, 'role.manage')?.all} />}
      </PageBody>
    </>
  );
}

async function UsersTab({ q, actorId, actor }: { q?: string; actorId: string; actor: Awaited<ReturnType<typeof requirePage>> }) {
  const [users, roles, units, tz, freeEmployees] = await Promise.all([
    listUsers(actor, q?.trim() || undefined),
    listRoles(),
    unitOptions(actor, 'user.manage'),
    getSetting('org.timezone'),
    prisma.employee.findMany({ where: { AND: [{ deletedAt: null, isActive: true, user: null }, employeeScopeWhere(actor, 'user.manage')] }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' }, take: 1000 }),
  ]);
  const canAll = !!scopeOf(actor, 'user.manage')?.all;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form className="flex items-end gap-2">
          <input type="hidden" name="tab" value="pengguna" />
          <label className="grid gap-1 text-sm font-medium" htmlFor="q">Cari<Input id="q" name="q" defaultValue={q ?? ''} placeholder="Username atau nama" className="w-64" /></label>
          <Button type="submit" variant="outline">Cari</Button>
        </form>
        <CreateUser employees={freeEmployees.map((e) => ({ id: e.id, name: e.fullName }))} canNoEmployee={canAll} />
      </div>
      <div className="rounded-xl border bg-card">
        <Table className="table-stack">
          <TableHeader><TableRow><TableHead className="pl-4 lg:pl-6">Pengguna</TableHead><TableHead>Peran dan cakupan</TableHead><TableHead>MFA</TableHead><TableHead>Terakhir masuk</TableHead><TableHead>Status</TableHead><TableHead className="pr-4 lg:pr-6"><span className="sr-only">Aksi</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {users.length === 0 && <TableRow><TableCell colSpan={6}><EmptyState title="Tidak ada pengguna" filtered={!!q} /></TableCell></TableRow>}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="stack-head pl-4 lg:pl-6"><span className="font-medium">{u.username}</span><span className="block text-xs text-muted-foreground">{u.employee ? `${u.employee.fullName}${u.employee.unit ? ` · ${u.employee.unit.name}` : ''}` : 'Bukan akun pegawai'}</span></TableCell>
                <TableCell data-label="Peran" className="whitespace-normal">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 && <span className="text-sm text-muted-foreground">Belum ada peran</span>}
                    {u.roles.map((r) => <RoleChip key={r.id} userId={u.id} urId={r.id} label={`${r.role.name}${r.unit ? ` · ${r.unit.name}${r.includeSubunits ? '+' : ''}` : r.role.code === 'PEGAWAI' ? '' : ' · semua unit'}`} />)}
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
      </div>
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
