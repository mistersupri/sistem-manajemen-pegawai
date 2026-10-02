import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar, type SidebarItem } from '@/components/app/app-sidebar';
import { NAV, type NavItem } from '@/lib/nav';
import { canAny, type Actor } from '@/lib/auth/actor';
import { pendingAccountStep, requirePage } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { ROLES } from '@/lib/auth/catalog';
import { navBadges } from '@/lib/services/badges';

function visible(items: NavItem[], actor: Actor, badges: Record<string, number>): SidebarItem[] {
  return items
    .filter((i) => i.perms.length === 0 || canAny(actor, i.perms))
    .map((i) => {
      const children = i.children ? visible(i.children, actor, badges) : undefined;
      const own = badges[i.href] || 0;
      const sum = own + (children || []).reduce((n, c) => n + (c.badge || 0), 0);
      return { href: i.href, label: i.label, icon: i.icon, badge: sum || undefined, children };
    })
    .filter((i) => !i.children || i.children.length > 0);
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePage();
  const step = await pendingAccountStep(actor);
  if (step) redirect(`/akun/keamanan?wajib=${step}`);
  const [settings, badges] = await Promise.all([getSettings(), navBadges(actor)]);
  const items = visible(NAV, actor, badges);
  const roles = actor.roleCodes.map((c) => ROLES[c]?.name ?? c).join(', ');
  return (
    <SidebarProvider>
      <AppSidebar
        items={items}
        orgName={settings['org.name']}
        logoUrl={settings['org.logo'] ? `/api/v1/logo?v=${encodeURIComponent(settings['org.logo'])}` : null}
        user={{ name: actor.displayName, username: actor.username, roles }}
      />
      <SidebarInset className="min-w-0">
        <header className="flex h-14 items-center gap-2 border-b border-white/10 bg-navy px-3 text-white lg:px-6">
          <SidebarTrigger className="size-11 text-white hover:bg-white/10 hover:text-white md:size-9" aria-label="Buka atau tutup menu" />
          <span className="truncate text-sm font-medium text-white/80">{settings['org.name']}</span>
          <Link href="/notifikasi" className="relative ml-auto inline-flex size-11 items-center justify-center rounded-md hover:bg-white/10 md:size-9" aria-label={badges['/notifikasi'] ? `Notifikasi, ${badges['/notifikasi']} belum dibaca` : 'Notifikasi'}>
            <Bell className="size-5" />
            {badges['/notifikasi'] ? <span className="absolute top-1 right-1 min-w-4 rounded-full bg-highlight px-1 text-center text-[0.65rem] font-bold text-highlight-foreground">{badges['/notifikasi']}</span> : null}
          </Link>
        </header>
        <main id="konten" className="flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
