'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="px-4 py-16 lg:px-8">
      <div className="max-w-lg">
        <h1 className="text-2xl font-bold">Halaman ini gagal dimuat</h1>
        <p className="mt-2 text-muted-foreground">Server tidak menyelesaikan permintaan. Muat ulang halaman; bila tetap gagal, catat waktu kejadian{error.digest ? ` dan kode ${error.digest}` : ''} lalu hubungi admin.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={reset}>Muat ulang</Button>
          <Button asChild variant="outline"><Link href="/dashboard">Ke dashboard</Link></Button>
        </div>
      </div>
    </div>
  );
}
