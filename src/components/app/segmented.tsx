import Link from 'next/link';
import { cn } from '@/lib/utils';

export type SegmentedItem = { key: string; label: string; href: string; count?: number };

/** Navigasi tampilan berbasis URL. Tetap berfungsi tanpa JavaScript; di ponsel bisa digeser bila tidak muat. */
export function Segmented({ items, current, label, className }: { items: SegmentedItem[]; current: string; label: string; className?: string }) {
  return (
    <nav className={cn('flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-card p-1 [scrollbar-width:none]', className)} aria-label={label}>
      {items.map((i) => {
        const active = current === i.key;
        return (
          <Link
            key={i.key}
            href={i.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap max-md:min-h-11',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {i.label}
            {i.count !== undefined && <span className={cn('rounded-sm px-1.5 text-xs tabular-nums', active ? 'bg-white/20' : 'bg-muted')}>{i.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
