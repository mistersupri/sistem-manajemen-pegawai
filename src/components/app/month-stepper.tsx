'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BULAN, BULAN_PENDEK } from '@/lib/time';
import { cn } from '@/lib/utils';

const shift = (ym: string, n: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const label = (ym: string) => `${BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/**
 * Pindah bulan: panah sebelum/sesudah dan label bulan yang membuka pilihan 12 bulan.
 * `href` berisi penanda `__bulan__` yang diganti YYYY-MM; `max` membatasi bulan ke depan (mis. bulan berjalan).
 */
export function MonthStepper({ value, href, max, className }: { value: string; href: string; max?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const to = (ym: string) => href.replace('__bulan__', ym);
  const prev = shift(value, -1);
  const next = shift(value, 1);
  const nextDisabled = !!max && next > max;
  return (
    <div className={cn('flex items-center gap-1 rounded-lg border bg-card p-1', className)}>
      <Button asChild variant="ghost" size="icon" className="size-9 max-md:size-11" aria-label={`Bulan sebelumnya, ${label(prev)}`}>
        <Link href={to(prev)} scroll={false}><ChevronLeft /></Link>
      </Button>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setYear(Number(value.slice(0, 4))); }}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-9 min-w-40 gap-2 px-3 font-semibold max-md:h-11" aria-label={`Pilih bulan, sekarang ${label(value)}`}>
            <CalendarDays className="text-primary" />{label(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-72 p-3">
          <div className="mb-2 flex items-center justify-between">
            <Button variant="ghost" size="icon" className="size-8" aria-label={`Tahun ${year - 1}`} onClick={() => setYear((y) => y - 1)}><ChevronLeft /></Button>
            <span className="font-semibold tabular-nums">{year}</span>
            <Button variant="ghost" size="icon" className="size-8" aria-label={`Tahun ${year + 1}`} disabled={!!max && `${year + 1}-01` > max} onClick={() => setYear((y) => y + 1)}><ChevronRight /></Button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {BULAN_PENDEK.map((b, i) => {
              const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
              const disabled = !!max && ym > max;
              const active = ym === value;
              return disabled
                ? <span key={ym} aria-disabled="true" className="inline-flex h-9 items-center justify-center rounded-md text-sm text-muted-foreground/60">{b}</span>
                : <Link key={ym} href={to(ym)} scroll={false} onClick={() => setOpen(false)} aria-current={active ? 'true' : undefined} aria-label={label(ym)}
                    className={cn('inline-flex h-9 items-center justify-center rounded-md text-sm transition-colors duration-150', active ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-secondary')}>{b}</Link>;
            })}
          </div>
        </PopoverContent>
      </Popover>
      {nextDisabled
        ? <Button variant="ghost" size="icon" className="size-9 max-md:size-11" disabled aria-label="Bulan berikutnya belum tersedia"><ChevronRight /></Button>
        : <Button asChild variant="ghost" size="icon" className="size-9 max-md:size-11" aria-label={`Bulan berikutnya, ${label(next)}`}><Link href={to(next)} scroll={false}><ChevronRight /></Link></Button>}
    </div>
  );
}
