import Link from 'next/link';
import { requirePage } from '@/lib/guard';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requirePage();
  return (
    <div className="min-h-dvh">
      <header className="flex h-14 items-center border-b border-white/10 bg-navy px-4 text-white lg:px-8">
        <Link href="/dashboard" className="font-bold">SIMPEG</Link>
      </header>
      <main id="konten">{children}</main>
    </div>
  );
}
