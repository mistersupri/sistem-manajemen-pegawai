import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  href?: string;
  label: string;
}

/** Judul halaman di atas area kerja: breadcrumb turunan, judul, keterangan, dan aksi. */
export function PageHeader({ title, description, crumbs, actions, children }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="px-4 pt-6 lg:px-8">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {crumbs.map((c, i) => (
              // Halaman sekarang sudah jadi judul H1; di ponsel cukup tautan induk agar nama panjang tidak tampil dua kali.
              <li key={i} className={cn('inline-flex min-w-0 items-center gap-1.5', !c.href && 'max-md:hidden')}>
                {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
                {c.href ? (
                  <Link className="inline-flex min-h-8 items-center text-primary underline-offset-4 transition-colors duration-150 hover:text-primary/80 hover:underline max-lg:min-h-11" href={c.href}>{c.label}</Link>
                ) : (
                  <span aria-current="page" className="max-w-[40ch] truncate font-medium text-foreground" title={c.label}>{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl leading-tight font-semibold text-balance md:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-prose text-sm text-pretty text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Area isi halaman di bawah judul. */
export function PageBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div data-slot="page-body" className={cn('min-w-0 px-4 pt-5 pb-8 lg:px-8', className)}>{children}</div>;
}
