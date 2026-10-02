import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PageBody, PageHeader } from '@/components/app/page-header';
import { requirePage, pendingAccountStep } from '@/lib/guard';
import { PasswordForm, MfaPanel } from './forms';

export const metadata = { title: 'Password dan MFA' };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ wajib?: string }> }) {
  const actor = await requirePage();
  const step = await pendingAccountStep(actor);
  const { wajib } = await searchParams;
  return (
    <>
      <PageHeader title="Password dan verifikasi dua langkah" description={`Akun ${actor.username}`} crumbs={step ? undefined : [{ href: '/dashboard', label: 'Dashboard' }, { label: 'Keamanan akun' }]} />
      <PageBody className="grid max-w-3xl gap-6">
        {step === 'password' && (
          <Alert variant="warning"><AlertTitle>Ganti password terlebih dahulu</AlertTitle><AlertDescription>Password Anda masih password awal. Ganti sekarang untuk melanjutkan.</AlertDescription></Alert>
        )}
        {step === 'mfa' && (
          <Alert variant="warning"><AlertTitle>Aktifkan verifikasi dua langkah</AlertTitle><AlertDescription>Kebijakan instansi mewajibkan MFA untuk akun administrator.</AlertDescription></Alert>
        )}
        {!step && wajib && <Alert variant="success"><AlertDescription>Akun sudah memenuhi syarat. Anda bisa kembali ke dashboard.</AlertDescription></Alert>}
        <PasswordForm />
        <MfaPanel enabled={actor.mfaEnabled} />
      </PageBody>
    </>
  );
}
