import { redirect } from 'next/navigation';
import { getActor } from '@/lib/auth/session';
import { getSettings } from '@/lib/settings';
import { LoginForm } from './login-form';

export const metadata = { title: 'Masuk' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ galat?: string; mfa?: string }> }) {
  const sp = await searchParams;
  if (await getActor()) redirect('/dashboard');
  const s = await getSettings();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[5fr_7fr]">
      <aside className="hidden flex-col justify-between bg-[linear-gradient(165deg,#0c1a45_0%,#12276b_60%,#1a3590_100%)] p-10 text-white lg:flex">
        <div>
          {s['org.logo'] && <img className="mb-6 max-h-18 max-w-56 rounded-lg bg-white object-contain p-1.5" src={`/api/v1/logo?v=${encodeURIComponent(s['org.logo'])}`} alt={`Logo ${s['org.name']}`} />}
          <p className="text-sm font-semibold tracking-wide text-highlight">SIMPEG</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{s['org.name']}</h1>
          <p className="mt-3 max-w-md text-[#d6e2f2]">Sistem informasi manajemen pegawai: data pegawai, absensi wajah dan mesin, jadwal kerja, cuti, dan rekap kehadiran.</p>
        </div>
        <p className="text-sm text-[#d6e2f2]">Masalah akun? Hubungi admin kepegawaian di unit Anda.</p>
      </aside>
      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <p className="text-sm font-semibold text-primary">SIMPEG</p>
            <p className="font-bold">{s['org.name']}</p>
          </div>
          <LoginForm initialError={sp.galat ? sp.galat.slice(0, 200) : null} initialStep={sp.mfa ? 'mfa' : 'password'} />
        </div>
      </main>
    </div>
  );
}
