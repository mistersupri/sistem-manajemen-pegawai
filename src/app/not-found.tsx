import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md">
        <p className="clock text-6xl text-muted-foreground/40">404</p>
        <h1 className="mt-4 text-2xl font-bold">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-muted-foreground">Alamat ini tidak ada di SIMPEG. Periksa kembali tautannya, atau mulai dari dashboard.</p>
        <Button asChild className="mt-6"><Link href="/dashboard">Ke dashboard</Link></Button>
      </div>
    </main>
  );
}
