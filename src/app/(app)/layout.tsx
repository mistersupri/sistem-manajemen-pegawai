import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar, type SidebarItem } from '@/components/app/app-sidebar';
import { ADMIN_ROLE_CODES, NAV, type NavItem } from '@/lib/nav';
import { canAny, type Actor } from '@/lib/auth/actor';
import { pendingAccountStep, requirePage } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { ROLES } from '@/lib/auth/catalog';
import { navBadges } from '@/lib/services/badges';
import { TabBar } from '@/components/app/tab-bar';
import { can } from '@/lib/auth/actor';
import { HeaderCrumbs } from '@/components/app/header-crumbs';
import { HeaderAvatar } from '@/components/app/user-menu';
import { NotificationBell } from '@/components/app/notification-bell';
import { fmtTanggal, todayIn } from '@/lib/time';

function visible(items: NavItem[], actor: Actor, badges: Record<string, number>): SidebarItem[] {
  const isAdmin = actor.roleCodes.some((c) => ADMIN_ROLE_CODES.includes(c));
  return items
    .filter((i) => !(i.hideForAdmin && isAdmin))
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
  const user = { name: actor.displayName, username: actor.username, roles };
  // Pegawai tanpa peran pengelola memakai navigasi bawah di ponsel.
  const selfService = !can(actor, 'dashboard.view') && can(actor, 'attendance.self');
  const tabs = selfService ? [
    { href: '/dashboard', label: 'Beranda', icon: 'home', show: true },
    { href: '/absensi/saya/absen', label: 'Absen', icon: 'absen', show: true },
    { href: '/absensi/saya', label: 'Rekap', icon: 'rekap', show: true },
    { href: '/absensi/koreksi', label: 'Koreksi', icon: 'koreksi', show: can(actor, 'correction.request') },
    { href: '/cuti', label: 'Cuti', icon: 'cuti', show: can(actor, 'leave.request') && !!settings['modules.leave'] },
  ].filter((t) => t.show) : null;
  return (
    <SidebarProvider>
      <AppSidebar
        items={items}
        orgName={settings['org.name']}
        logoUrl={settings['org.logo'] ? `/api/v1/logo?v=${encodeURIComponent(settings['org.logo'])}` : null}
        user={user}
      />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/85 lg:px-6">
          <SidebarTrigger variant="outline" className="size-11 rounded-lg md:size-9" aria-label="Buka atau tutup menu" />
          <HeaderCrumbs items={items} />
          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <span className="rounded-lg border px-3 py-1.5 text-sm text-muted-foreground max-md:hidden">{fmtTanggal(todayIn(settings['org.timezone']))}</span>
            <NotificationBell initialUnread={badges['/notifikasi'] || 0} />
            <HeaderAvatar user={user} />
          </div>
        </header>
        <main id="konten" className={tabs ? 'flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0' : 'flex-1'}>{children}</main>
        {tabs && <TabBar items={tabs} />}
      </SidebarInset>
    </SidebarProvider>
  );
}
