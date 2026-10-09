import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/session';
import { getSettings } from '@/lib/settings';
import { LoginForm } from './login-form';
import { captchaEnabled, newCaptcha } from '@/lib/captcha';
import { LiveClock } from '@/components/app/live-clock';

export const metadata = { title: 'Masuk' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ galat?: string; mfa?: string; next?: string }> }) {
  const sp = await searchParams;
  // Hanya jalur internal, mis. /dinas-luar; bukan //domain-lain atau URL lengkap.
  const next = sp.next && /^\/(?![/\\])[\w\-/?=&.%]*$/.test(sp.next) ? sp.next : '/dashboard';
  if (await getActor()) redirect(next);
  const s = await getSettings();
  const captcha = captchaEnabled() ? newCaptcha() : null;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[6fr_5fr]">
      <aside className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex xl:p-14">
        <div className="flex items-center gap-4">
          {s['org.logo'] && <img className="max-h-14 max-w-40 rounded-lg bg-white object-contain p-1.5" src={`/api/v1/logo?v=${encodeURIComponent(s['org.logo'])}`} alt={`Logo ${s['org.name']}`} />}
          <div>
            <p className="text-xl font-bold">{s['org.name']}</p>
            <p className="text-sm text-white/85">Sistem informasi manajemen pegawai</p>
          </div>
        </div>
        <LiveClock serverNow={new Date().toISOString()} tz={s['org.timezone']} label={s['org.timezoneLabel']} />
        <p className="text-sm text-white/85">Masalah akun? Hubungi admin kepegawaian di unit Anda.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            {s['org.logo'] && <img className="max-h-12 max-w-28 object-contain" src={`/api/v1/logo?v=${encodeURIComponent(s['org.logo'])}`} alt={`Logo ${s['org.name']}`} />}
            <div><p className="font-bold">{s['org.name']}</p><p className="text-sm text-muted-foreground">Sistem informasi manajemen pegawai</p></div>
          </div>
          <LoginForm initialError={sp.galat ? sp.galat.slice(0, 200) : null} initialStep={sp.mfa ? 'mfa' : 'password'} next={next} initialCaptcha={captcha} />
        </div>
      </main>
    </div>
  );
}
