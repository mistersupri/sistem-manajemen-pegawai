import Link from 'next/link';
import { StatusBadge } from './status-badge';
import { cn } from '@/lib/utils';

// Sumbu papan: 05.00 sampai 24.00, cukup untuk shift pagi sampai awal shift malam.
const START = 5 * 60;
const SPAN = 19 * 60;
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const pos = (hhmm: string | null | undefined) => (hhmm ? Math.min(100, Math.max(0, ((toMin(hhmm) - START) / SPAN) * 100)) : null);
const HOURS = [6, 9, 12, 15, 18, 21];

export interface BoardRow {
  id: string;
  name: string;
  unit: string | null;
  href: string;
  category: string;
  status: string;
  scheduleIn: string | null;
  scheduleOut: string | null;
  checkIn: string | null;
  checkOut: string | null;
  late: boolean;
}

/** Papan hari ini: satu baris per pegawai, pita jadwal, tanda masuk/pulang, dan garis waktu sekarang. */
export function TodayBoard({ rows, now }: { rows: BoardRow[]; now: string | null }) {
  const n = pos(now);
  const key = (cls: string, text: string) => <li className="inline-flex items-center gap-1.5"><span className={cls} aria-hidden />{text}</li>;
  return (
    <div className="grid gap-1">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Keterangan papan">
        {key('h-2 w-5 rounded-sm bg-[#d5def0]', 'Jadwal')}
        {key('h-3.5 w-1 rounded-sm bg-[#2a78d6]', 'Masuk')}
        {key('h-3.5 w-1 rounded-sm bg-[#eb6834]', 'Masuk terlambat')}
        {key('h-3.5 w-1 rounded-sm bg-navy', 'Pulang')}
        {n != null && key('h-3.5 w-0.5 bg-highlight', 'Sekarang')}
      </ul>
      <div className="grid grid-cols-1 items-end gap-x-4 md:grid-cols-[13rem_1fr]" aria-hidden>
        <span className="hidden md:block" />
        <div className="board-axis h-5 text-xs text-muted-foreground">
          {/* Label jam yang terlalu dekat dengan penanda sekarang disembunyikan agar tidak bertumpuk. */}
          {HOURS.map((h) => {
            const x = pos(`${String(h).padStart(2, '0')}:00`)!;
            const gap = n == null ? 100 : Math.abs(x - n);
            if (gap < 10) return null;
            // Sumbu sempit (tablet, kolom kedua) butuh jarak lebih lebar.
            return <span key={h} className={cn('absolute -translate-x-1/2 tabular', gap < 25 && 'md:max-lg:hidden')} style={{ left: `${x}%` }}>{String(h).padStart(2, '0')}.00</span>;
          })}
          {n != null && <span className={cn('absolute rounded bg-highlight px-1 font-semibold text-highlight-foreground tabular', n < 4 ? 'translate-x-0' : n > 96 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: `${n}%` }}>{now!.replace(':', '.')}</span>}
        </div>
      </div>
      <ul className="divide-y">
        {rows.map((r) => {
          const a = pos(r.scheduleIn);
          const overnight = !!(r.scheduleIn && r.scheduleOut && r.scheduleOut <= r.scheduleIn);
          const b = overnight ? 100 : pos(r.scheduleOut);
          const i = pos(r.checkIn);
          // Pulang shift malam jatuh esok hari: tampilkan di ujung kanan sumbu.
          const o = r.checkOut ? (overnight && r.checkIn && r.checkOut < r.checkIn ? 100 : pos(r.checkOut)) : null;
          const label = `${r.name}: jadwal ${r.scheduleIn ?? 'tidak ada'}${r.scheduleOut ? ` sampai ${r.scheduleOut}` : ''}, masuk ${r.checkIn ?? 'belum'}, pulang ${r.checkOut ?? 'belum'}`;
          return (
            <li key={r.id}>
              <Link href={r.href} className="grid grid-cols-1 items-center gap-x-4 gap-y-1 py-2 hover:bg-accent/40 md:grid-cols-[13rem_1fr] md:py-1.5" aria-label={label}>
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.name}</span>
                    {r.unit && <span className="block truncate text-xs text-muted-foreground">{r.unit}</span>}
                  </span>
                  <StatusBadge status={r.status} className="shrink-0 md:hidden" />
                </span>
                <span className="board-track" aria-hidden>
                  {HOURS.map((h) => <span key={h} className="board-grid" style={{ left: `${pos(`${String(h).padStart(2, '0')}:00`)}%` }} />)}
                  {a != null && b != null && <span className="shift" style={{ left: `${a}%`, width: `${Math.max(0.8, b - a)}%` }} />}
                  {i != null && <span className={cn('tick', r.late && 'late')} style={{ left: `${i}%` }} />}
                  {o != null && <span className="tick out" style={{ left: `${o}%` }} />}
                  {n != null && <span className="board-now" style={{ left: `${n}%` }} />}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
