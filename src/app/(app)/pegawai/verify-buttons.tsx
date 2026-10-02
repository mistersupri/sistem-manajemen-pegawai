'use client';

import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/app/confirm-button';
import { api, useAction } from '@/components/app/api-client';

export function VerifyButtons({ id, name }: { id: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => api('POST', `/api/v1/biometrics/${id}/verify`, { approve: true }), { success: `Wajah ${name} diaktifkan.` })}>Setujui</Button>
      <ConfirmButton size="sm" label="Tolak" title={`Tolak pendaftaran wajah ${name}?`} description="Template dihapus dan pegawai perlu mendaftar ulang." confirmLabel="Tolak" url={`/api/v1/biometrics/${id}/verify`} body={{ approve: false }} reason={{ label: 'Alasan penolakan', key: 'note' }} success="Pendaftaran ditolak." />
    </div>
  );
}
