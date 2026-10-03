'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { api } from './api-client';

export type EmployeeOption = { id: string; name: string; nip: string | null; unitId: string | null; unit: string | null };
export type OptionsFor = 'jadwal' | 'manual' | 'akun' | 'pin';

/** Ambil pilihan pegawai dari server. Dipanggil dari event handler atau saat komponen pertama tampil. */
export async function fetchEmployeeOptions(purpose: OptionsFor, opts: { q?: string; limit?: number } = {}) {
  const p = new URLSearchParams({ for: purpose, limit: String(opts.limit ?? 50), ...(opts.q ? { q: opts.q } : {}) });
  return api<{ total: number; rows: EmployeeOption[] }>('GET', `/api/v1/employees/options?${p}`);
}

const label = (e: EmployeeOption) => [e.name, e.nip, e.unit].filter(Boolean).join(' · ');

/**
 * Pilih satu pegawai dengan pencarian di server, untuk instansi dengan ribuan pegawai.
 * Nilai terpilih dikirim lewat <select name>. `lazy`: baru memuat saat kolom disentuh (dipakai di daftar panjang).
 */
export function EmployeePicker({ id, name, purpose, required, defaultQuery = '', lazy = false, invalid, describedBy, emptyLabel, onChange }: {
  id: string; name: string; purpose: OptionsFor; required?: boolean; defaultQuery?: string; lazy?: boolean; invalid?: boolean; describedBy?: string; emptyLabel?: string; onChange?: (id: string) => void;
}) {
  const [q, setQ] = useState(defaultQuery);
  const [rows, setRows] = useState<EmployeeOption[] | null>(null);
  const [total, setTotal] = useState(0);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(!lazy);
  const seq = useRef(0);

  useEffect(() => {
    if (!active) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetchEmployeeOptions(purpose, { q: q.trim() || undefined, limit: 50 });
        if (n !== seq.current) return;
        setRows(r.rows);
        setTotal(r.total);
        setError(null);
        // Satu hasil persis dari nama mesin: langsung pilih sebagai tebakan.
        if (r.rows.length === 1 && defaultQuery && q === defaultQuery) { setValue(r.rows[0].id); onChange?.(r.rows[0].id); }
      } catch (e) {
        if (n === seq.current) setError((e as Error).message);
      }
    }, q === defaultQuery ? 0 : 250);
    return () => clearTimeout(t);
  }, [q, active, purpose, defaultQuery, onChange]);

  return (
    <div className="grid gap-1.5" onFocusCapture={() => setActive(true)} onPointerEnter={() => setActive(true)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau NIP" className="pl-9" aria-label="Cari pegawai" aria-controls={id} />
      </div>
      <NativeSelect id={id} name={name} required={required} value={value} aria-invalid={invalid || undefined} aria-describedby={describedBy}
        onChange={(e) => { setValue(e.target.value); onChange?.(e.target.value); }}>
        <NativeSelectOption value="" disabled={required}>
          {emptyLabel ?? (!active ? 'Pilih pegawai' : rows === null ? 'Memuat...' : rows.length ? `Pilih pegawai (${total > rows.length ? `${rows.length} dari ${total}, persempit pencarian` : `${total} hasil`})` : 'Tidak ada pegawai yang cocok')}
        </NativeSelectOption>
        {rows?.map((e) => <NativeSelectOption key={e.id} value={e.id}>{label(e)}</NativeSelectOption>)}
      </NativeSelect>
      {error && <p className="text-sm font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}
