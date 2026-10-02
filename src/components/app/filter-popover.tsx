'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Tombol filter yang membuka panel berisi form GET; ringkasan filter aktif tampil di tombol. */
export function FilterPopover({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="max-w-full"><SlidersHorizontal /><span className="truncate">{summary}</span></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,26rem)]">{children}</PopoverContent>
    </Popover>
  );
}
