'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, KeyRound, LogOut } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface MenuUser { name: string; username: string; roles: string }

/** Inisial dua huruf dari nama, tanpa gelar di depan. */
export function initials(name: string) {
  const words = name.replace(/\(.*?\)/g, '').split(/\s+/).filter((w) => w && !/\.$/.test(w));
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || name.slice(0, 1).toUpperCase();
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return <span aria-hidden className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground', className)}>{initials(name)}</span>;
}

function Items({ user }: { user: MenuUser }) {
  const router = useRouter();
  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }
  return (
    <>
      <DropdownMenuLabel className="font-normal">
        <span className="block truncate font-medium">{user.name}</span>
        <span className="block text-xs text-muted-foreground">Masuk sebagai {user.username}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild><Link href="/akun/keamanan"><KeyRound />Password dan MFA</Link></DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={logout}><LogOut />Keluar</DropdownMenuItem>
    </>
  );
}

/** Kartu profil di sidebar: avatar, nama, peran. Membuka menu akun. */
export function ProfileCard({ user }: { user: MenuUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors duration-150 outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-secondary">
        <Avatar name={user.name} />
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-semibold text-foreground uppercase">{user.name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{user.roles}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56"><Items user={user} /></DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Avatar di header kanan atas. */
export function HeaderAvatar({ user }: { user: MenuUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label={`Menu akun ${user.name}`}>
        <Avatar name={user.name} className="transition-[filter] duration-150 hover:brightness-110" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60"><Items user={user} /></DropdownMenuContent>
    </DropdownMenu>
  );
}
