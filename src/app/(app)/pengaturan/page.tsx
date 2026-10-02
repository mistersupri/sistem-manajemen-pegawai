import { notFound, redirect } from 'next/navigation';
import { requirePage } from '@/lib/guard';
import { canAny } from '@/lib/auth/actor';
import { NAV } from '@/lib/nav';

export default async function SettingsIndex() {
  const actor = await requirePage();
  const first = NAV.find((n) => n.href === '/pengaturan')!.children!.find((c) => canAny(actor, c.perms));
  if (!first) notFound();
  redirect(first.href);
}
