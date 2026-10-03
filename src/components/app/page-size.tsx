'use client';

import { useRouter } from 'next/navigation';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/** Pilihan baris per halaman; berpindah langsung saat diganti. */
export function PageSizeSelect({ value, options }: { value: number; options: { size: number; href: string }[] }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span>Tampilkan</span>
      <span className="w-20">
        <NativeSelect size="sm" value={value} aria-label="Baris per halaman" onChange={(e) => router.push(options.find((o) => o.size === Number(e.target.value))!.href, { scroll: false })}>
          {options.map((o) => <NativeSelectOption key={o.size} value={o.size}>{o.size}</NativeSelectOption>)}
        </NativeSelect>
      </span>
      <span className="max-sm:hidden">per halaman</span>
    </label>
  );
}
