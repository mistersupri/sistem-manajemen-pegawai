'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

/** `forced`: pengguna dialihkan ke sini karena wajib (password awal atau MFA); setelah selesai langsung masuk ke dashboard. */
function useFinishRedirect(forced: boolean) {
  const router = useRouter();
  return () => {
    if (!forced) return;
    // Layout aplikasi akan mengarahkan kembali ke sini bila masih ada langkah wajib lain (mis. MFA setelah password).
    router.replace('/dashboard');
    router.refresh();
  };
}

export function PasswordForm({ forced = false }: { forced?: boolean }) {
  const { pending, fields, run } = useAction();
  const finish = useFinishRedirect(forced);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ganti password</CardTitle>
        <CardDescription>Minimal 8 karakter, berisi huruf dan angka, dan tidak memuat username.</CardDescription>
      </CardHeader>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          const r = await run(() => api('POST', '/api/v1/me/password', Object.fromEntries(fd)), { success: 'Password berhasil diganti.' });
          if (r !== undefined) { form.reset(); finish(); }
        }}
      >
        <CardContent className="grid gap-4 sm:max-w-sm">
          <Field id="current" label="Password lama" error={fields.current}><Input {...fieldProps('current', fields.current)} type="password" autoComplete="current-password" required /></Field>
          <Field id="next" label="Password baru" error={fields.next}><Input {...fieldProps('next', fields.next)} type="password" autoComplete="new-password" required /></Field>
          <Field id="confirm" label="Ulangi password baru" error={fields.confirm}><Input {...fieldProps('confirm', fields.confirm)} type="password" autoComplete="new-password" required /></Field>
        </CardContent>
        <CardFooter className="mt-6 gap-2">
          <Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan password'}</Button>
          {!forced && <Button asChild variant="ghost"><Link href="/dashboard">Ke dashboard</Link></Button>}
        </CardFooter>
      </form>
    </Card>
  );
}

export function MfaPanel({ enabled, forced = false }: { enabled: boolean; forced?: boolean }) {
  const { pending, fields, run } = useAction();
  const finish = useFinishRedirect(forced);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Verifikasi dua langkah (MFA)</CardTitle>
        <CardDescription>
          {enabled ? 'Aktif. Setiap masuk, Anda diminta kode dari aplikasi autentikator.' : 'Lindungi akun dengan kode dari aplikasi autentikator (misalnya Google Authenticator, Microsoft Authenticator, atau Aegis).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!enabled && !setup && (
          <Button className="w-fit" disabled={pending} onClick={async () => { const r = await run(() => api<{ qr: string; secret: string }>('POST', '/api/v1/me/mfa', { step: 'begin' }), { refresh: false }); if (r) setSetup(r); }}>
            Aktifkan MFA
          </Button>
        )}
        {!enabled && setup && (
          <form className="grid gap-4 sm:max-w-sm" onSubmit={async (e) => { e.preventDefault(); const code = new FormData(e.currentTarget).get('code'); const r = await run(() => api('POST', '/api/v1/me/mfa', { step: 'confirm', code }), { success: 'MFA aktif.' }); if (r !== undefined) { setSetup(null); finish(); } }}>
            <ol className="grid list-decimal gap-1 pl-4 text-sm text-muted-foreground">
              <li>Pindai kode QR berikut dengan aplikasi autentikator.</li>
              <li>Masukkan 6 angka yang muncul di aplikasi.</li>
            </ol>
            <img src={setup.qr} alt="Kode QR untuk aplikasi autentikator" className="size-44 rounded-md border bg-white p-2" />
            <p className="text-sm">Tidak bisa memindai? Masukkan kode ini secara manual: <code className="break-all rounded bg-muted px-1">{setup.secret}</code></p>
            <Field id="code" label="Kode dari aplikasi" error={fields.code}><Input {...fieldProps('code', fields.code)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" required /></Field>
            <Button type="submit" className="w-fit" disabled={pending}>{pending ? 'Memeriksa...' : 'Konfirmasi'}</Button>
          </form>
        )}
        {enabled && (
          <form className="grid gap-4 sm:max-w-sm" onSubmit={async (e) => { e.preventDefault(); const password = new FormData(e.currentTarget).get('password'); await run(() => api('POST', '/api/v1/me/mfa', { step: 'disable', password }), { success: 'MFA dinonaktifkan.' }); }}>
            <Field id="password" label="Password untuk menonaktifkan MFA" error={fields.password}><Input {...fieldProps('password', fields.password)} type="password" autoComplete="current-password" required /></Field>
            <Button type="submit" variant="outline-destructive" className="w-fit" disabled={pending}>Nonaktifkan MFA</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
