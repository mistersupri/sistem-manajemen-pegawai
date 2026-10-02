'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, FilePen, House, Plane, ScanFace, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = { home: House, absen: ScanFace, jadwal: CalendarDays, koreksi: FilePen, cuti: Plane };

/** Navigasi bawah di ponsel untuk pegawai: aksi absen selalu satu ketukan. */
export function TabBar({ items }: { items: { href: string; label: string; icon: string; badge?: number }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigasi utama" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((i) => {
          const Icon = ICONS[i.icon] ?? House;
          const active = i.href === '/dashboard' ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + '/');
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? 'page' : undefined} className={cn('relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium active:bg-accent', active ? 'text-primary' : 'text-muted-foreground')}>
                {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" aria-hidden />}
                <Icon className="size-5" aria-hidden />
                {i.label}
                {i.badge ? <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-highlight px-1 text-center text-[10px] font-bold text-highlight-foreground">{i.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
