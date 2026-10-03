'use client';

import { useRouter } from 'next/navigation';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { qs, type SortDir } from '@/lib/list';

/** Pilihan urutan di ponsel, tempat judul kolom tabel tidak tampil. */
export function SortMenu({ options, sort, dir, params }: { options: { value: string; label: string }[]; sort: string; dir: SortDir; params: Record<string, string | undefined> }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 md:hidden">
      <span className="text-muted-foreground">Urutkan</span>
      <NativeSelect size="sm" value={`${sort}:${dir}`} className="min-w-44" onChange={(e) => {
        const [s, d] = e.target.value.split(':');
        router.push(qs({ ...params, sort: s, dir: d, page: undefined }));
      }}>
        {options.flatMap((o) => [
          <NativeSelectOption key={`${o.value}:asc`} value={`${o.value}:asc`}>{o.label} (naik)</NativeSelectOption>,
          <NativeSelectOption key={`${o.value}:desc`} value={`${o.value}:desc`}>{o.label} (turun)</NativeSelectOption>,
        ])}
      </NativeSelect>
    </label>
  );
}
