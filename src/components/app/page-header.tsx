import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  href?: string;
  label: string;
}

/** Pita judul halaman (navy): breadcrumb, judul, keterangan, dan aksi. */
export function PageHeader({ title, description, crumbs, actions, children }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-head px-4 pt-4 pb-6 lg:px-8">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            {crumbs.map((c, i) => (
              <li key={i} className="inline-flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
                {c.href ? (
                  <Link className="inline-flex min-h-8 items-center hover:text-foreground max-lg:min-h-11" href={c.href}>{c.label}</Link>
                ) : (
                  <span aria-current="page" className="font-medium text-foreground">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight text-balance">{title}</h1>
          {description && <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** Area isi halaman di bawah pita judul. */
export function PageBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-4 py-6 lg:px-8 ${className}`}>{children}</div>;
}
