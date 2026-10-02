'use client';

import { useEffect, useState } from 'react';

/**
 * Jam berjalan dengan waktu server (bukan jam perangkat), dalam zona waktu instansi.
 * Selisih jam perangkat dihitung sekali dari waktu server saat halaman dimuat.
 */
export function LiveClock({ serverNow, tz, label, className }: { serverNow: string; tz: string; label: string; className?: string }) {
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    const off = new Date(serverNow).getTime() - Date.now();
    const t = setInterval(() => setNow(new Date(Date.now() + off)), 1000);
    return () => clearInterval(t);
  }, [serverNow]);
  const time = new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).replace('.', ':');
  const date = new Intl.DateTimeFormat('id-ID', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  return (
    <div className={className}>
      <p className="text-lg text-white/80">{date}</p>
      <p className="clock mt-2 text-[clamp(4rem,9vw,7.5rem)] text-white" aria-live="off">
        <time dateTime={now.toISOString()} suppressHydrationWarning>{time}</time>
        <span className="ml-3 align-top text-2xl font-semibold text-highlight">{label}</span>
      </p>
      <p className="mt-3 text-sm text-white/70">Waktu server, dipakai untuk semua absensi.</p>
    </div>
  );
}
