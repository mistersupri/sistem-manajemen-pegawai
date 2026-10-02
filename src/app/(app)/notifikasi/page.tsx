import { PageBody, PageHeader } from '@/components/app/page-header';
import { Segmented } from '@/components/app/segmented';
import { EmptyState } from '@/components/app/empty-state';
import { Pager } from '@/components/app/pagination';
import { requirePage } from '@/lib/guard';
import { getSetting } from '@/lib/settings';
import { listNotifications } from '@/lib/services/notifications';
import { fmtWaktu } from '@/lib/time';
import { MarkAllRead, NotificationLink } from './items';

export const metadata = { title: 'Notifikasi' };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requirePage();
  const sp = await searchParams;
  const unreadOnly = sp.lihat === 'belum';
  const [data, tz] = await Promise.all([listNotifications(actor.userId, { unreadOnly, page: Number(sp.page) || 1, pageSize: [25, 50, 100].includes(Number(sp.per)) ? Number(sp.per) : 25 }), getSetting('org.timezone')]);
  return (
    <>
      <PageHeader title="Notifikasi" description="Pemberitahuan pengajuan, persetujuan, dan status perangkat." actions={data.unread > 0 ? <MarkAllRead /> : undefined} />
      <PageBody className="grid max-w-3xl gap-4">
        <Segmented label="Filter" current={unreadOnly ? 'belum' : 'semua'} className="w-fit" items={[{ key: 'semua', label: 'Semua', href: '?' }, { key: 'belum', label: `Belum dibaca (${data.unread})`, href: '?lihat=belum' }]} />
        <div className="rounded-xl border bg-card">
          {data.rows.length === 0 ? <EmptyState title={unreadOnly ? 'Semua notifikasi sudah dibaca' : 'Belum ada notifikasi'} /> : (
            <ul className="divide-y">
              {data.rows.map((n) => (
                <li key={n.id}>
                  <NotificationLink id={n.id} href={n.link} unread={!n.readAt}>
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className={n.readAt ? '' : 'font-semibold'}>{n.title}</span>
                      <span className="text-xs text-muted-foreground">{fmtWaktu(n.createdAt, tz)}</span>
                    </span>
                    {n.body && <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>}
                  </NotificationLink>
                </li>
              ))}
            </ul>
          )}
          <Pager total={data.total} page={data.page} pageSize={data.pageSize} params={{ lihat: unreadOnly ? 'belum' : undefined, per: sp.per }} />
        </div>
      </PageBody>
    </>
  );
}
