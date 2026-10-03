import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Keadaan kosong: judul menyebut keadaannya, keterangan menyebut sebab, lalu satu aksi yang mengisinya.
 * Ikon hanya bila relevan dengan isinya (mis. wajah untuk absen wajah), bukan hiasan bawaan.
 */
export function EmptyState({ title, description, icon: Icon, actions }: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: { href: string; label: string; primary?: boolean }[];
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-10 text-center">
      {Icon && <Icon className="mb-3 size-8 text-primary" aria-hidden />}
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {actions && actions.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {actions.map((a) => <Button key={a.href} asChild size="sm" variant={a.primary ? 'default' : 'outline'}><Link href={a.href}>{a.label}</Link></Button>)}
        </div>
      )}
    </div>
  );
}
