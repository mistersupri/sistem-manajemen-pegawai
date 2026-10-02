'use client';

import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, useAction } from '@/components/app/api-client';
import { cn } from '@/lib/utils';

export function NotificationLink({ id, href, unread, children }: { id: string; href: string | null; unread: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const open = async () => {
    if (unread) await api('POST', '/api/v1/notifications/read', { ids: [id] }).catch(() => undefined);
    if (href) router.push(href);
    else router.refresh();
  };
  return (
    <button type="button" onClick={open} className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-accent/50 lg:px-6', unread && 'bg-accent/30')}>
      <span className={cn('mt-2 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-transparent')} aria-hidden />
      <span className="min-w-0 flex-1">{children}{unread && <span className="sr-only"> (belum dibaca)</span>}</span>
    </button>
  );
}

export function MarkAllRead() {
  const { pending, run } = useAction();
  return <Button variant="highlight" disabled={pending} onClick={() => run(() => api('POST', '/api/v1/notifications/read', { all: true }), { success: 'Semua ditandai dibaca.' })}><CheckCheck />Tandai semua dibaca</Button>;
}
