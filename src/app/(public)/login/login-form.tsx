'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, fieldProps } from '@/components/app/field';
import { api, ApiError } from '@/components/app/api-client';

export function LoginForm({ initialError, initialStep, next = '/dashboard' }: { initialError: string | null; initialStep: 'password' | 'mfa'; next?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'password' | 'mfa'>(initialStep);
  const [error, setError] = useState<string | null>(initialError);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    setFields({});
    try {
      if (step === 'password') {
        const r = await api<{ mfaRequired: boolean }>('POST', '/api/v1/auth/login', { username: fd.get('username'), password: fd.get('password') });
        if (r.mfaRequired) { setStep('mfa'); return; }
      } else {
        await api('POST', '/api/v1/auth/mfa', { code: fd.get('code') });
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      const x = err as ApiError;
      setError(x.message);
      setFields(x.fields || {});
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{step === 'password' ? 'Masuk' : 'Verifikasi dua langkah'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === 'password' ? 'Pegawai masuk dengan NIP. Password awal sama dengan NIP dan wajib diganti saat masuk pertama.' : 'Masukkan 6 angka dari aplikasi autentikator di ponsel Anda.'}
        </p>
      </div>
      <div>
        {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
        <form onSubmit={submit} method="post" action={step === 'password' ? '/api/v1/auth/login' : '/api/v1/auth/mfa'} className="grid gap-5" noValidate>
          {step === 'password' ? (
            <>
              <Field id="username" label="Username atau NIP" error={fields.username}>
                <Input {...fieldProps('username', fields.username)} autoComplete="username" required autoFocus className="h-10" />
              </Field>
              <Field id="password" label="Password" error={fields.password}>
                <Input {...fieldProps('password', fields.password)} type="password" autoComplete="current-password" required className="h-10" />
              </Field>
            </>
          ) : (
            <Field id="code" label="Kode verifikasi" error={fields.code}>
              <Input {...fieldProps('code', fields.code)} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className="h-10 tabular tracking-widest" />
            </Field>
          )}
          <Button type="submit" size="lg" disabled={pending}>{pending ? 'Memeriksa...' : step === 'password' ? 'Masuk' : 'Verifikasi'}</Button>
          {step === 'mfa' && <Button type="button" variant="ghost" onClick={() => { setStep('password'); setError(null); }}>Kembali</Button>}
        </form>
      </div>
    </div>
  );
}
