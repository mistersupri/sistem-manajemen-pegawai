'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';

interface Incoming { id: string; type: string; title: string; body: string | null; link: string | null }

/**
 * Lonceng notifikasi di header. Terhubung ke /api/v1/notifications/stream (SSE): notifikasi baru
 * muncul sebagai toast, lencana ikut berubah, dan halaman terkait dimuat ulang tanpa menunggu.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [count, setCount] = useState(initialUnread);
  const routerRef = useRef(router);

  useEffect(() => { routerRef.current = router; }, [router]);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/v1/notifications/stream');
    es.addEventListener('unread', (e) => setCount((JSON.parse((e as MessageEvent).data) as { count: number }).count));
    es.addEventListener('notification', (e) => {
      const n = JSON.parse((e as MessageEvent).data) as Incoming;
      toast(n.title, {
        description: n.body ?? undefined,
        duration: 8000,
        action: n.link ? { label: 'Buka', onClick: () => routerRef.current.push(n.link!) } : undefined,
      });
      // Pengguna yang sedang di tab lain tetap diberi tahu lewat notifikasi sistem bila sudah mengizinkan.
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification(n.title, { body: n.body ?? undefined, tag: n.id }); } catch { /* beberapa ponsel hanya mengizinkan lewat service worker */ }
      }
      // Halaman yang menampilkan data terkait (rekap, koreksi, laporan) ikut segar.
      routerRef.current.refresh();
    });
    return () => es.close();
  }, []);

  return (
    <Link href="/notifikasi" className="relative inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground md:size-9" aria-label={count ? `Notifikasi, ${count} belum dibaca` : 'Notifikasi'}>
      <Bell className="size-5" />
      {count ? <span className="absolute top-1 right-1 min-w-4 rounded-full bg-count px-1 text-center text-[0.65rem] leading-4 font-semibold text-count-foreground">{count > 99 ? '99+' : count}</span> : null}
    </Link>
  );
}
