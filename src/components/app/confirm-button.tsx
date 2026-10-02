'use client';

import { useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { api, useAction } from './api-client';

/** Tombol aksi dengan dialog konfirmasi (opsional alasan wajib). */
export function ConfirmButton({ label, title, description, confirmLabel, method = 'POST', url, body, reason, success, variant = 'outline-destructive', size = 'default', destructive = true, onDone }: {
  label: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  method?: string;
  url: string;
  body?: Record<string, unknown>;
  reason?: { label: string; key: string; min?: number };
  success?: string;
  variant?: 'outline-destructive' | 'outline' | 'default' | 'destructive' | 'highlight' | 'ghost';
  size?: 'default' | 'sm';
  destructive?: boolean;
  onDone?: (r: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const { pending, run } = useAction();
  const tooShort = reason && text.trim().length < (reason.min ?? 3);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild><Button variant={variant} size={size}>{label}</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {reason && (
          <div className="grid gap-2">
            <Label htmlFor="confirm-reason">{reason.label}</Label>
            <Textarea id="confirm-reason" value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
            disabled={pending || !!tooShort}
            onClick={async (e) => {
              e.preventDefault();
              const r = await run(() => api(method, url, { ...(body || {}), ...(reason ? { [reason.key]: text.trim() } : {}) }), { success });
              if (r !== undefined) { setOpen(false); setText(''); onDone?.(r); }
            }}
          >
            {pending ? 'Memproses...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
