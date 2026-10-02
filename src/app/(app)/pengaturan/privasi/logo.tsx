'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/app/field';
import { ConfirmButton } from '@/components/app/confirm-button';
import { api, useAction } from '@/components/app/api-client';

export function LogoCard({ hasLogo }: { hasLogo: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(0);
  const { pending, fields, run } = useAction();
  return (
    <Card>
      <CardHeader><CardTitle>Logo instansi</CardTitle><CardDescription>Tampil di halaman masuk, sidebar, dan laporan PDF. PNG, JPG, atau WebP, maksimal 1 MB.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap items-end gap-6">
        <div className="flex size-24 items-center justify-center rounded-lg border bg-muted">
          {hasLogo ? <img src={`/api/v1/logo?v=${v}`} alt="Logo instansi saat ini" className="max-h-20 max-w-20 object-contain" /> : <span className="text-xs text-muted-foreground">Belum ada</span>}
        </div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => api('POST', '/api/v1/logo', new FormData(e.currentTarget)), { success: 'Logo diperbarui.' });
          if (r !== undefined) { setV((x) => x + 1); if (input.current) input.current.value = ''; }
        }}>
          <Field id="logo" label="Berkas logo" error={fields.logo}><Input ref={input} id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="max-w-72" /></Field>
          <Button type="submit" disabled={pending}>{pending ? 'Mengunggah...' : 'Unggah'}</Button>
          {hasLogo && <ConfirmButton label="Hapus logo" title="Hapus logo instansi?" description="Halaman masuk dan laporan akan tampil tanpa logo." confirmLabel="Hapus" method="DELETE" url="/api/v1/logo" success="Logo dihapus." />}
        </form>
      </CardContent>
    </Card>
  );
}
