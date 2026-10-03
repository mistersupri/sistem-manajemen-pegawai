'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface CrumbItem { href: string; label: string; children?: CrumbItem[] }

/** Jejak menu di header, diturunkan dari menu sidebar sesuai alamat halaman. */
export function HeaderCrumbs({ items }: { items: CrumbItem[] }) {
  const pathname = usePathname();
  const hit = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const trail: CrumbItem[] = [];
  for (const i of items) {
    const child = i.children?.filter((c) => hit(c.href)).sort((a, b) => b.href.length - a.href.length)[0];
    if (child) { if (child.href !== i.href) trail.push({ href: i.href, label: i.label }); trail.push(child); break; }
    if (hit(i.href)) { trail.push(i); break; }
  }
  const home = { href: '/dashboard', label: 'Beranda' };
  const list = trail[0]?.href === home.href ? [home] : [home, ...trail];
  return (
    <nav aria-label="Lokasi halaman" className="min-w-0 max-md:hidden">
      <ol className="flex items-center gap-2 text-sm">
        {list.map((c, i) => {
          const last = i === list.length - 1;
          return (
            <li key={c.href + i} className="flex min-w-0 items-center gap-2">
              {i > 0 && <span className="text-muted-foreground" aria-hidden>/</span>}
              {last
                ? <span aria-current="page" className="truncate font-medium text-foreground">{c.label}</span>
                : <Link href={c.href} className="truncate text-primary transition-colors duration-150 hover:text-primary/80 hover:underline underline-offset-4">{c.label}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
