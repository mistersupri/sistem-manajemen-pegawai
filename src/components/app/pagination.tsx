import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableHead } from '@/components/ui/table';
import { DEFAULT_PER, PAGE_SIZES, qs, type SortDir } from '@/lib/list';
import { PageSizeSelect } from './page-size';
import { cn } from '@/lib/utils';
import { SortMenu } from './sort-menu';

type Params = Record<string, string | undefined>;

/** Nomor halaman yang ditampilkan: pertama, terakhir, dan dua di sekitar halaman aktif. */
function pageList(page: number, pages: number): (number | '…')[] {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of [...set].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}

/** Pagination berbasis URL (tetap berfungsi tanpa JavaScript), dengan pilihan jumlah baris. */
export function Pager({ total, page, pageSize, params, sizes = true }: { total: number; page: number; pageSize: number; params: Params; sizes?: boolean }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number, per = pageSize) => qs({ ...params, page: p > 1 ? p : undefined, per: per !== DEFAULT_PER ? per : undefined });
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-3 text-sm text-muted-foreground lg:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="tabular-nums">{total ? `${from.toLocaleString('id-ID')}–${to.toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')}` : 'Tidak ada data'}</span>
        {sizes && total > PAGE_SIZES[0] && <PageSizeSelect value={pageSize} options={PAGE_SIZES.map((n) => ({ size: n, href: href(1, n) }))} />}
      </div>
      {pages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Halaman">
          <Button asChild variant="outline" size="sm" aria-disabled={page <= 1} className={cn('max-md:size-10 max-md:px-0', page <= 1 && 'pointer-events-none opacity-50')}>
            <Link href={href(page - 1)} aria-label="Halaman sebelumnya" tabIndex={page <= 1 ? -1 : undefined}><ChevronLeft /><span className="max-md:hidden">Sebelumnya</span></Link>
          </Button>
          <span className="px-2 tabular-nums md:hidden">{page} / {pages}</span>
          {pageList(page, pages).map((p, i) => p === '…'
            ? <span key={`e${i}`} className="px-1 max-md:hidden" aria-hidden>…</span>
            : <Link key={p} href={href(p)} aria-current={p === page ? 'page' : undefined} aria-label={`Halaman ${p}`}
                className={cn('inline-flex min-h-8 min-w-8 items-center justify-center rounded-md px-2 tabular-nums hover:bg-accent hover:text-foreground max-md:hidden', p === page && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground')}>{p}</Link>)}
          <Button asChild variant="outline" size="sm" aria-disabled={page >= pages} className={cn('max-md:size-10 max-md:px-0', page >= pages && 'pointer-events-none opacity-50')}>
            <Link href={href(page + 1)} aria-label="Halaman berikutnya" tabIndex={page >= pages ? -1 : undefined}><span className="max-md:hidden">Berikutnya</span><ChevronRight /></Link>
          </Button>
        </nav>
      )}
    </div>
  );
}

/** Judul kolom yang bisa diurutkan: klik sekali urut naik, klik lagi urut turun. */
export function SortableHead({ label, value, sort, dir, params, className, align = 'left', firstDir = 'asc' }: {
  label: string; value: string; sort: string; dir: SortDir; params: Params; className?: string; align?: 'left' | 'right'; firstDir?: SortDir;
}) {
  const active = sort === value;
  const next: SortDir = active ? (dir === 'asc' ? 'desc' : 'asc') : firstDir;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={cn(align === 'right' && 'text-right', className)} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link href={qs({ ...params, sort: value, dir: next, page: undefined })} className={cn('group inline-flex min-h-8 items-center gap-1 rounded-sm hover:text-foreground', align === 'right' && 'flex-row-reverse', active && 'text-foreground')}
        aria-label={`Urutkan menurut ${label.toLowerCase()}, ${next === 'asc' ? 'naik' : 'turun'}`}>
        {label}<Icon className={cn('size-3.5 shrink-0', !active && 'opacity-40 group-hover:opacity-100')} aria-hidden />
      </Link>
    </TableHead>
  );
}

/** Baris atas tabel: judul jumlah data + pilihan urutan untuk ponsel (judul kolom tersembunyi di tampilan kartu). */
export function TableToolbar({ children, sorts, sort, dir, params }: { children?: React.ReactNode; sorts?: { value: string; label: string }[]; sort?: string; dir?: SortDir; params?: Params }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-sm lg:px-6">
      <div className="min-w-0 text-muted-foreground">{children}</div>
      {sorts && sort && dir && params && <SortMenu options={sorts} sort={sort} dir={dir} params={params} />}
    </div>
  );
}

/** Simpan urutan dan jumlah baris saat form filter dikirim (filter baru selalu kembali ke halaman 1). */
export function KeepParams({ values }: { values: Record<string, string | undefined> }) {
  return <>{Object.entries(values).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>;
}
