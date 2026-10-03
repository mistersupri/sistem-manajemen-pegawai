'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type SegmentedItem = { key: string; label: string; href: string; count?: number };

/**
 * Navigasi tampilan berbasis URL dengan indikator yang bergeser ke tab terpilih.
 * Indikator pindah saat diklik, sebelum halaman baru selesai dimuat; tanpa JavaScript tetap berupa tautan biasa.
 */
export function Segmented({ items, current, label, className }: { items: SegmentedItem[]; current: string; label: string; className?: string }) {
  const [selected, setSelected] = useState(current);
  const [shown, setShown] = useState(current);
  // Halaman baru (atau tombol Kembali) menetapkan tab yang benar.
  if (shown !== current) { setShown(current); setSelected(current); }
  const refs = useRef(new Map<string, HTMLAnchorElement>());
  const nav = useRef<HTMLElement>(null);
  const bar = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const move = () => {
      const el = refs.current.get(selected);
      const b = bar.current;
      if (!b) return;
      if (!el) { b.style.opacity = '0'; return; }
      b.style.opacity = '1';
      b.style.width = `${el.offsetWidth}px`;
      b.style.transform = `translateX(${el.offsetLeft}px)`;
    };
    move();
    nav.current?.setAttribute('data-ready', '');
    window.addEventListener('resize', move);
    return () => window.removeEventListener('resize', move);
  }, [selected, items]);

  // Posisi awal tanpa animasi; geser hanya setelah tampilan pertama.
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => nav.current?.setAttribute('data-animate', '')));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <nav ref={nav} className={cn('group/seg relative flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-card p-1 [scrollbar-width:none]', className)} aria-label={label}>
      <span ref={bar} aria-hidden
        className="pointer-events-none absolute top-1 bottom-1 left-0 hidden rounded-md bg-primary group-data-[animate]/seg:transition-[transform,width] group-data-[animate]/seg:duration-250 group-data-[animate]/seg:ease-out group-data-[ready]/seg:block motion-reduce:transition-none!" />
      {items.map((i) => {
        const active = selected === i.key;
        return (
          <Link
            key={i.key}
            ref={(el) => { if (el) refs.current.set(i.key, el); else refs.current.delete(i.key); }}
            href={i.href}
            scroll={false}
            onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) setSelected(i.key); }}
            aria-current={current === i.key ? 'page' : undefined}
            className={cn(
              'relative inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150 max-md:min-h-11',
              active ? 'text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              active && 'bg-primary group-data-[ready]/seg:bg-transparent',
            )}
          >
            {i.label}
            {i.count !== undefined && <span className={cn('rounded-sm px-1.5 text-xs tabular-nums transition-colors duration-150', active ? 'bg-white/20' : 'bg-muted')}>{i.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
