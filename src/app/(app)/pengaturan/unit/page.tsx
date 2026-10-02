import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { EmptyState } from '@/components/app/empty-state';
import { ConfirmButton } from '@/components/app/confirm-button';
import { requirePage } from '@/lib/guard';
import { can, scopeOf } from '@/lib/auth/actor';
import { listUnits } from '@/lib/services/units';
import { UnitForm } from './unit-form';

export const metadata = { title: 'Unit Kerja' };

export default async function UnitsPage() {
  const actor = await requirePage(['unit.read', 'unit.manage']);
  const units = await listUnits(actor);
  const manage = can(actor, 'unit.manage');
  const canRoot = !!scopeOf(actor, 'unit.manage')?.all;
  const ids = new Set(units.map((u) => u.id));
  // Susun pohon; unit yang induknya di luar cakupan ditampilkan sebagai akar.
  const children = new Map<string | null, typeof units>();
  for (const u of units) {
    const p = u.parentId && ids.has(u.parentId) ? u.parentId : null;
    children.set(p, [...(children.get(p) ?? []), u]);
  }
  const flat: { u: (typeof units)[number]; depth: number }[] = [];
  const walk = (p: string | null, depth: number) => { for (const u of children.get(p) ?? []) { flat.push({ u, depth }); walk(u.id, depth + 1); } };
  walk(null, 0);
  const parents = flat.map(({ u, depth }) => ({ id: u.id, name: u.name, depth }));
  return (
    <>
      <PageHeader title="Unit Kerja" description="Struktur organisasi. Hak akses operator dan pimpinan unit mencakup unit beserta sub-unitnya." crumbs={[{ label: 'Pengaturan' }, { label: 'Unit Kerja' }]} actions={manage ? <UnitForm parents={parents} canRoot={canRoot} /> : undefined} />
      <PageBody className="max-w-4xl">
        <Card className="py-0">
          {flat.length === 0 ? <EmptyState title="Belum ada unit kerja" /> : (
            <ul className="divide-y" aria-label="Struktur unit kerja">
              {flat.map(({ u, depth }) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 pr-4" style={{ paddingLeft: `${1 + depth * 1.5}rem` }}>
                  <div className="min-w-0">
                    <span className="font-medium">{depth > 0 && <span className="mr-1.5 text-muted-foreground" aria-hidden>└</span>}{u.name}</span>
                    <span className="block text-xs text-muted-foreground" style={{ paddingLeft: depth > 0 ? '1.1rem' : 0 }}>
                      {u.code}, <Link className="hover:underline" href={`/pegawai?unitId=${u.id}`}>{u._count.employees} pegawai aktif</Link>{u.timezone ? `, ${u.timezone}` : ''}
                    </span>
                  </div>
                  {manage && (
                    <div className="flex flex-wrap gap-1">
                      <UnitForm parents={parents} defaultParent={u.id} canRoot={canRoot} />
                      <UnitForm initial={u} parents={parents} canRoot={canRoot} />
                      <ConfirmButton size="sm" variant="ghost" label="Nonaktifkan" title={`Nonaktifkan ${u.name}?`} description="Hanya bisa bila unit tidak punya pegawai aktif dan sub-unit. Riwayat pegawai di unit ini tetap tersimpan." confirmLabel="Nonaktifkan" method="DELETE" url={`/api/v1/units/${u.id}`} success="Unit dinonaktifkan." />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
