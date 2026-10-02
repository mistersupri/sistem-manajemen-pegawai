import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Navigasi tampilan berbasis URL (pil). Tetap berfungsi tanpa JavaScript. */
export function Segmented({ items, current, label, className }: { items: { key: string; label: string; href: string }[]; current: string; label: string; className?: string }) {
  return (
    <nav className={cn('flex flex-wrap gap-1 rounded-full border bg-card p-1', className)} aria-label={label}>
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={current === i.key ? 'page' : undefined}
          className={cn('inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium', current === i.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
