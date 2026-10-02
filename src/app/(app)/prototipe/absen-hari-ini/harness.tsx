'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BigClock, OneAction, Timeline } from './variants';

const VARIANTS = [
  { name: 'Jam besar', render: BigClock },
  { name: 'Linimasa', render: Timeline },
  { name: 'Satu aksi', render: OneAction },
];


/** Harness prototipe: satu varian tampil penuh, picker sesuai spesifikasi skill prototype. Ganti varian instan. */
export function Harness({ initial }: { initial: number }) {
  const [current, setCurrent] = useState(initial >= 0 && initial < VARIANTS.length ? initial : 0);
  const [ready, setReady] = useState(false);
  const pickerRef = useRef<HTMLElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const setActive = useCallback((i: number) => {
    if (i < 0 || i >= VARIANTS.length) return;
    setCurrent(i);
    const url = new URL(window.location.href);
    url.searchParams.set('v', String(i + 1));
    window.history.replaceState(null, '', url);
  }, []);

  useLayoutEffect(() => {
    const move = () => {
      const el = itemRefs.current[current];
      const hl = highlightRef.current;
      if (!el || !hl) return;
      hl.style.width = `${el.offsetWidth}px`;
      hl.style.transform = `translateX(${el.offsetLeft}px)`;
    };
    move();
    window.addEventListener('resize', move);
    return () => window.removeEventListener('resize', move);
  }, [current]);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= VARIANTS.length) setActive(num - 1);
      else if (e.key === 'ArrowRight') setActive((current + 1) % VARIANTS.length);
      else if (e.key === 'ArrowLeft') setActive((current - 1 + VARIANTS.length) % VARIANTS.length);
    };
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(id); document.removeEventListener('keydown', onKey); };
  }, [current, setActive]);

  const Variant = VARIANTS[current].render;
  return (
    <>
      <Variant key={current} />
      {/* Di posisi atas agar tidak menutupi navigasi bawah aplikasi di ponsel. */}
      <nav ref={pickerRef} className="proto-picker" data-position="top" data-ready={ready ? '' : undefined} aria-label="Prototype variants">
        <span ref={highlightRef} className="proto-picker-highlight" aria-hidden="true" />
        {VARIANTS.map((v, i) => (
          <button key={v.name} ref={(el) => { itemRefs.current[i] = el; }} type="button" className="proto-picker-item"
            data-active={i === current ? '' : undefined} aria-current={i === current ? 'true' : undefined} onClick={() => setActive(i)}>
            {v.name}
          </button>
        ))}
      </nav>
    </>
  );
}
