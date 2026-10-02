import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/session';
import { can } from '@/lib/auth/actor';
import { getSettings } from '@/lib/settings';
import { prisma } from '@/lib/db';
import { Kiosk } from '@/components/app/kiosk';

export const metadata = { title: 'Kiosk absensi' };

export default async function KioskPage() {
  const actor = await getActor();
  if (!actor) redirect('/login');
  if (!can(actor, 'kiosk.operate')) redirect('/dashboard');
  const s = await getSettings();
  const enrolled = await prisma.employeeBiometric.count({ where: { status: 'ACTIVE', employee: { isActive: true, deletedAt: null } } });
  return (
    <div className="dark min-h-dvh bg-background text-foreground">
      <Kiosk org={s['org.name']} logo={s['org.logo'] ? `/api/v1/logo?v=${encodeURIComponent(s['org.logo'])}` : null} enabled={!!s['methods.faceKiosk']} requireLiveness={!!s['face.requireLiveness']} enrolled={enrolled} />
    </div>
  );
}
