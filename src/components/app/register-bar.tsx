import Link from 'next/link';
import { CATEGORY_COLOR } from './attendance-colors';

/**
 * Kehadiran satu hari sebagai satu batang proporsional, dengan jumlah ditulis sebagai teks.
 * Setiap kategori menaut ke Monitoring yang sudah tersaring.
 */
export function RegisterBar({ items, total, hrefFor }: { items: { key: string; label: string; count: number }[]; total: number; hrefFor: (key: string) => string }) {
  const shown = items.filter((i) => i.count > 0);
  return (
    <div className="grid gap-4">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={items.map((i) => `${i.label} ${i.count}`).join(', ')}>
        {shown.map((i) => (
          <span key={i.key} style={{ width: `${(i.count / Math.max(1, total)) * 100}%`, background: CATEGORY_COLOR[i.key] }} className="h-full border-r-2 border-card last:border-r-0" />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        {items.map((i) => (
          <li key={i.key}>
            <Link href={hrefFor(i.key)} className="-mx-2 flex min-h-11 items-center gap-2.5 rounded-md px-2 hover:bg-accent/60">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[i.key] }} aria-hidden />
              <span className="min-w-0 flex-1 text-sm leading-tight text-muted-foreground">{i.label}</span>
              <span className="text-lg font-bold tabular">{i.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
