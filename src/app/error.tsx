'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

// Galat di halaman tanpa menu aplikasi (masuk, titik absen, kiosk, dinas luar).
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md">
        <h1 className="text-2xl font-bold">Halaman ini gagal dimuat</h1>
        <p className="mt-2 text-muted-foreground">Periksa koneksi lalu muat ulang. Bila tetap gagal, catat waktu kejadian{error.digest ? ` dan kode ${error.digest}` : ''} dan sampaikan ke admin.</p>
        <Button className="mt-6" onClick={reset}>Muat ulang</Button>
      </div>
    </main>
  );
}
