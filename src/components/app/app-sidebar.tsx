'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, Bell, Building2, CalendarDays, ChevronDown, ClipboardList, Clock, FilePen, Fingerprint, HardDrive, LayoutDashboard,
  List, Lock, Plane, RefreshCw, ScanFace, ScanLine, ScrollText, Settings, ShieldCheck, SlidersHorizontal, Table, Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ProfileCard, type MenuUser } from './user-menu';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard, users: Users, clock: Clock, 'scan-face': ScanFace, activity: Activity, table: Table,
  'file-pen': FilePen, fingerprint: Fingerprint, 'hard-drive': HardDrive, 'refresh-cw': RefreshCw, list: List,
  'calendar-days': CalendarDays, plane: Plane, bell: Bell, settings: Settings, 'building-2': Building2, 'shield-check': ShieldCheck,
  'sliders-horizontal': SlidersHorizontal, 'scan-line': ScanLine, lock: Lock, 'scroll-text': ScrollText, 'clipboard-list': ClipboardList,
};

export interface SidebarItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  children?: SidebarItem[];
}

const matches = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/');

/** Menu aktif: alamat terpanjang yang cocok, agar /absensi/saya tidak ikut aktif saat membuka /absensi/saya/absen. */
function activeHref(pathname: string, items: SidebarItem[]) {
  const all = items.flatMap((i) => [i, ...(i.children ?? [])]);
  return all.filter((i) => matches(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function AppSidebar({ items, orgName, logoUrl, user }: {
  items: SidebarItem[];
  orgName: string;
  logoUrl: string | null;
  user: MenuUser;
}) {
  const pathname = usePathname();
  const current = activeHref(pathname, items);

  const count = (n?: number) => (n ? <span className="ml-auto min-w-5 rounded-full bg-count px-1.5 text-center text-xs leading-5 font-semibold text-count-foreground tabular-nums">{n}</span> : null);
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-4 border-b border-sidebar-border px-4 pt-4 pb-4">
        <Link href="/dashboard" className="flex min-h-11 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {logoUrl && <img src={logoUrl} alt="" className="h-10 w-auto max-w-20 object-contain" />}
          <span className="min-w-0 leading-tight">
            <span className="block text-base font-bold text-foreground">SIMPEG</span>
            <span className="block truncate text-xs text-muted-foreground">{orgName}</span>
          </span>
        </Link>
        <ProfileCard user={user} />
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map((item) => {
                const Icon = ICONS[item.icon] ?? List;
                if (!item.children?.length) {
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={current === item.href} className="h-auto min-h-11 gap-3 rounded-lg px-3 py-2.5">
                        <Link href={item.href}><Icon />{item.label}</Link>
                      </SidebarMenuButton>
                      {item.badge ? <SidebarMenuBadge className="top-3 bg-count text-count-foreground">{item.badge}</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  );
                }
                const groupActive = item.children.some((c) => c.href === current);
                return (
                  <Collapsible key={item.href} defaultOpen={groupActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="h-auto min-h-11 gap-3 rounded-lg px-3 py-2.5">
                          <Icon />{item.label}
                          {count(item.badge)}
                          <ChevronDown className={cn(item.badge ? 'ml-1' : 'ml-auto', 'text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]/collapsible:rotate-180')} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="overflow-hidden duration-200 ease-out data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                        <SidebarMenuSub className="mx-0 ml-5 gap-0.5 border-l-0 px-0 py-1">
                          {item.children.map((c) => (
                            <SidebarMenuSubItem key={c.href}>
                              <SidebarMenuSubButton asChild isActive={c.href === current} className="h-auto min-h-10 rounded-lg px-4 py-2">
                                <Link href={c.href}>{c.label}{count(c.badge)}</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
