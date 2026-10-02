import Link from 'next/link';
import { Inbox, SearchX, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyState({ title, description, filtered, icon, actions }: {
  title: string;
  description?: React.ReactNode;
  filtered?: boolean;
  icon?: LucideIcon;
  actions?: { href: string; label: string; primary?: boolean }[];
}) {
  const Icon = icon ?? (filtered ? SearchX : Inbox);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="size-5" aria-hidden /></span>
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
