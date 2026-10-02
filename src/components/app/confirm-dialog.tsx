'use client';

import { useSyncExternalStore } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Request = { title: string; description?: string; confirmLabel?: string; destructive?: boolean; resolve: (ok: boolean) => void };

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Pengganti window.confirm berbasis AlertDialog. Pakai dari event handler:
 * `if (!(await confirmDialog({ title: 'Hapus X?', destructive: true }))) return;`
 * Butuh <ConfirmHost /> terpasang sekali di layout.
 */
export function confirmDialog(opts: Omit<Request, 'resolve'>): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...opts, resolve };
    emit();
  });
}

function close(ok: boolean) {
  const r = current;
  current = null;
  emit();
  r?.resolve(ok);
}

export function ConfirmHost() {
  const req = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current, () => null);
  return (
    <AlertDialog open={!!req} onOpenChange={(o) => { if (!o) close(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title}</AlertDialogTitle>
          {req?.description && <AlertDialogDescription>{req.description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction className={req?.destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined} onClick={() => close(true)}>
            {req?.confirmLabel ?? 'Lanjutkan'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
