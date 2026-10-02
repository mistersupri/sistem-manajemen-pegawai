'use client';

import { useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Di ponsel form filter dilipat di balik satu tombol agar data langsung terlihat;
 * di layar lebar form selalu tampil.
 */
export function CollapsibleFilters({ active, children }: { active: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-2">
      <Button type="button" variant="outline" className="justify-between md:hidden" aria-expanded={open} aria-controls="filter-panel" onClick={() => setOpen((v) => !v)}>
        <span className="inline-flex items-center gap-2"><SlidersHorizontal />Filter{active ? ` (${active} aktif)` : ''}</span>
        <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
      </Button>
      <div id="filter-panel" className={cn(open ? 'block' : 'hidden', 'md:block')}>{children}</div>
    </div>
  );
}
