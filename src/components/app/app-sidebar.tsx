'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, Bell, Building2, CalendarDays, ChevronDown, Clock, FilePen, Fingerprint, HardDrive, KeyRound, LayoutDashboard,
  List, Lock, LogOut, Plane, RefreshCw, ScanFace, ScanLine, ScrollText, Settings, ShieldCheck, SlidersHorizontal, Table, Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ICONS: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard, users: Users, clock: Clock, 'scan-face': ScanFace, activity: Activity, table: Table,
  'file-pen': FilePen, fingerprint: Fingerprint, 'hard-drive': HardDrive, 'refresh-cw': RefreshCw, list: List,
  'calendar-days': CalendarDays, plane: Plane, bell: Bell, settings: Settings, 'building-2': Building2, 'shield-check': ShieldCheck,
  'sliders-horizontal': SlidersHorizontal, 'scan-line': ScanLine, lock: Lock, 'scroll-text': ScrollText,
};

export interface SidebarItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  children?: SidebarItem[];
}

function isActive(pathname: string, href: string, exact = false) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
}

export function AppSidebar({ items, orgName, logoUrl, user }: {
  items: SidebarItem[];
  orgName: string;
  logoUrl: string | null;
  user: { name: string; username: string; roles: string };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link href="/dashboard" className="flex min-h-12 items-center gap-2.5 px-2 font-bold text-white">
          {logoUrl && <img src={logoUrl} alt="" className="h-9 w-auto max-w-24 rounded-md bg-white object-contain p-1" />}
          <span className="leading-tight">
            <span className="block text-base">SIMPEG</span>
            <span className="block truncate text-xs font-medium text-sidebar-foreground">{orgName}</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = ICONS[item.icon] ?? List;
                if (!item.children?.length) {
                  const active = isActive(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={active} className="min-h-10 data-[active=true]:text-sidebar-primary">
                        <Link href={item.href}><Icon />{item.label}</Link>
                      </SidebarMenuButton>
                      {item.badge ? <SidebarMenuBadge className="bg-highlight text-highlight-foreground">{item.badge}</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  );
                }
                const groupActive = item.children.some((c) => isActive(pathname, c.href, c.href === item.href));
                return (
                  <Collapsible key={item.href} defaultOpen={groupActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="min-h-10">
                          <Icon />{item.label}
                          {item.badge ? <span className="ml-auto rounded-full bg-highlight px-1.5 text-xs font-semibold text-highlight-foreground">{item.badge}</span> : null}
                          <ChevronDown className={`${item.badge ? 'ml-1' : 'ml-auto'} transition-transform group-data-[state=open]/collapsible:rotate-180`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.children.map((c) => (
                            <SidebarMenuSubItem key={c.href}>
                              <SidebarMenuSubButton asChild isActive={isActive(pathname, c.href, c.href === item.href)} className="min-h-9 data-[active=true]:text-sidebar-primary">
                                <Link href={c.href}>
                                  {c.label}
                                  {c.badge ? <span className="ml-auto rounded-full bg-highlight px-1.5 text-xs font-semibold text-highlight-foreground">{c.badge}</span> : null}
                                </Link>
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
      <SidebarFooter className="border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="min-h-12">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold text-white">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 text-left leading-tight">
                <span className="block truncate font-medium text-white">{user.name}</span>
                <span className="block truncate text-xs">{user.roles}</span>
              </span>
              <ChevronDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-xs text-muted-foreground">Masuk sebagai {user.username}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/akun/keamanan"><KeyRound />Password dan MFA</Link></DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={logout}><LogOut />Keluar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
