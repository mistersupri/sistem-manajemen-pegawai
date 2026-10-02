import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Navigasi tampilan berbasis URL (pil). Tetap berfungsi tanpa JavaScript. */
export function Segmented({ items, current, label, className }: { items: { key: string; label: string; href: string }[]; current: string; label: string; className?: string }) {
  return (
    <nav className={cn('flex max-w-full gap-1 overflow-x-auto rounded-full border bg-card p-1 [scrollbar-width:none]', className)} aria-label={label}>
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={current === i.key ? 'page' : undefined}
          className={cn('inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap', current === i.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
