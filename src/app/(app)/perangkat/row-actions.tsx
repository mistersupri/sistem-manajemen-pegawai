'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, useAction } from '@/components/app/api-client';

export function DeviceRowActions({ id, pull, active, canSync }: { id: string; pull: boolean; active: boolean; canSync: boolean }) {
  const { pending, run } = useAction();
  if (!canSync || !pull || !active) return null;
  return (
    <div className="flex justify-end">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => api<{ inserted: number; duplicates: number }>('POST', `/api/v1/devices/${id}/sync`), { success: (r) => `Sinkron selesai: ${r.inserted} baru, ${r.duplicates} sudah ada.` })}>
        <RefreshCw className={pending ? 'animate-spin' : ''} />{pending ? 'Menarik...' : 'Tarik data'}
      </Button>
    </div>
  );
}
