'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string>) {
    super(message);
  }
}

/** Panggil REST API aplikasi. Melempar ApiError dengan pesan dan error per field. */
export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.', 0);
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    // Sesi habis: muat ulang penuh ke halaman masuk agar state klien ikut dibersihkan.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (res.status === 401 && typeof window !== 'undefined' && !url.includes('/auth/')) window.location.href = '/login';
    throw new ApiError(data?.error?.message || `Permintaan gagal (${res.status}).`, res.status, data?.error?.fields);
  }
  return data as T;
}

/**
 * Status proses + error per field untuk form. run() menjalankan aksi, menampilkan toast,
 * lalu me-refresh data server bila berhasil.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>, opts: { success?: string | ((r: T) => string); refresh?: boolean; onDone?: (r: T) => void } = {}) {
    setPending(true);
    setFields({});
    setError(null);
    try {
      const r = await fn();
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      if (opts.refresh !== false) router.refresh();
      opts.onDone?.(r);
      return r;
    } catch (err) {
      const e = err as ApiError;
      setFields(e.fields || {});
      setError(e.message);
      // Rincian galat per isian tampil di samping isiannya; toast cukup memberi tahu bahwa ada yang perlu diperbaiki.
      toast.error(e.fields && Object.keys(e.fields).length ? 'Periksa isian yang ditandai.' : e.message);
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { pending, fields, error, run, setFields };
}

export const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
