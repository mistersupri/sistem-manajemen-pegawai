'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, fieldProps } from '@/components/app/field';
import { api, ApiError } from '@/components/app/api-client';

export function LoginForm({ initialError, initialStep, next = '/dashboard', initialCaptcha }: { initialError: string | null; initialStep: 'password' | 'mfa'; next?: string; initialCaptcha: { token: string; image: string } | null }) {
  const router = useRouter();
  const [step, setStep] = useState<'password' | 'mfa'>(initialStep);
  const [error, setError] = useState<string | null>(initialError);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [captcha, setCaptcha] = useState(initialCaptcha);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshCaptcha() {
    setRefreshing(true);
    try {
      const r = await api<{ enabled: boolean; token?: string; image?: string }>('GET', '/api/v1/auth/captcha');
      setCaptcha(r.enabled ? { token: r.token!, image: r.image! } : null);
    } catch { /* gambar lama dibiarkan; pengguna bisa coba lagi */ } finally { setRefreshing(false); }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    setFields({});
    try {
      if (step === 'password') {
        const r = await api<{ mfaRequired: boolean }>('POST', '/api/v1/auth/login', { username: fd.get('username'), password: fd.get('password'), captchaToken: captcha?.token, captchaAnswer: fd.get('captchaAnswer') });
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
      // Tiap tantangan hanya berlaku sekali, jadi gagal apa pun perlu gambar baru.
      if (step === 'password' && captcha) void refreshCaptcha();
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{step === 'password' ? 'Masuk' : 'Verifikasi dua langkah'}</h1>
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
              {captcha && (
                <Field id="captchaAnswer" label="Kode keamanan" error={fields.captcha} hint="Ketik 5 huruf atau angka pada gambar.">
                  <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                    <div className="flex items-center gap-1">
                      <img src={captcha.image} alt="Gambar kode keamanan" width={168} height={56} className="h-14 w-42 rounded-lg border" />
                      <Button type="button" variant="ghost" size="icon" onClick={refreshCaptcha} disabled={refreshing} aria-label="Ganti gambar kode"><RefreshCw className={refreshing ? 'animate-spin' : undefined} /></Button>
                    </div>
                    <Input {...fieldProps('captchaAnswer', fields.captcha)} name="captchaAnswer" autoComplete="off" autoCapitalize="characters" maxLength={8} required spellCheck={false} className="h-10 tracking-widest uppercase" />
                  </div>
                  <input type="hidden" name="captchaToken" value={captcha.token} />
                </Field>
              )}
            </>
          ) : (
            <Field id="code" label="Kode verifikasi" error={fields.code}>
              <Input {...fieldProps('code', fields.code)} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus className="h-10 tabular" />
            </Field>
          )}
          <Button type="submit" size="lg" disabled={pending}>{pending ? 'Memeriksa...' : step === 'password' ? 'Masuk' : 'Verifikasi'}</Button>
          {step === 'mfa' && <Button type="button" variant="ghost" onClick={() => { setStep('password'); setError(null); }}>Kembali</Button>}
        </form>
      </div>
    </div>
  );
}
