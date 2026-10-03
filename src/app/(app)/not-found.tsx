import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="px-4 py-16 lg:px-8">
      <div className="max-w-lg">
        <h1 className="text-2xl font-bold">Data atau halaman tidak ditemukan</h1>
        <p className="mt-2 text-muted-foreground">Alamatnya mungkin salah, datanya sudah dihapus, atau berada di luar unit kerja yang bisa Anda akses.</p>
        <Button asChild className="mt-6"><Link href="/dashboard">Ke dashboard</Link></Button>
      </div>
    </div>
  );
}
