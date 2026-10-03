import Link from 'next/link';
import { requirePage } from '@/lib/guard';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requirePage();
  return (
    <div className="min-h-dvh">
      <header className="flex h-16 items-center border-b bg-card px-4 lg:px-8">
        <Link href="/dashboard" className="font-bold text-foreground transition-colors duration-150 hover:text-primary">SIMPEG</Link>
      </header>
      <main id="konten">{children}</main>
    </div>
  );
}
