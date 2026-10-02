import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Pagination berbasis URL (tetap berfungsi tanpa JavaScript). */
export function Pager({ total, page, pageSize, params }: { total: number; page: number; pageSize: number; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => `?${new URLSearchParams(Object.fromEntries(Object.entries({ ...params, page: String(p) }).filter(([, v]) => v != null && v !== '')) as Record<string, string>)}`;
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground lg:px-6">
      <span>{total ? `${from} sampai ${to} dari ${total}` : 'Tidak ada data'}</span>
      {pages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Halaman">
          <Button asChild variant="outline" size="sm" aria-disabled={page <= 1} className={page <= 1 ? 'pointer-events-none opacity-50' : ''}>
            <Link href={href(page - 1)} aria-label="Halaman sebelumnya"><ChevronLeft />Sebelumnya</Link>
          </Button>
          <span className="px-2 tabular">{page} / {pages}</span>
          <Button asChild variant="outline" size="sm" aria-disabled={page >= pages} className={page >= pages ? 'pointer-events-none opacity-50' : ''}>
            <Link href={href(page + 1)} aria-label="Halaman berikutnya">Berikutnya<ChevronRight /></Link>
          </Button>
        </nav>
      )}
    </div>
  );
}

/** Tautan judul kolom yang bisa diurutkan. */
export function SortLink({ label, value, current, params }: { label: string; value: string; current: string; params: Record<string, string | undefined> }) {
  const q = new URLSearchParams(Object.fromEntries(Object.entries({ ...params, sort: value, page: '1' }).filter(([, v]) => v)) as Record<string, string>);
  return (
    <Link href={`?${q}`} className="inline-flex items-center gap-1 hover:underline" aria-sort={current === value ? 'ascending' : undefined}>
      {label}{current === value && <span aria-hidden>↓</span>}
    </Link>
  );
}
