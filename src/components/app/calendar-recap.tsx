import Link from 'next/link';
import { HARI_PENDEK } from '@/lib/time';
import type { CalendarCell } from '@/lib/services/reports';
import { cn } from '@/lib/utils';

type Column = { date: string; day: number; weekday: number; weekend: boolean; holiday: { name: string; kind: string } | null; isToday: boolean };
type Row = { employee: { id: string; fullName: string; employeeNumber: string | null; unit: { name: string } | null }; cells: CalendarCell[] };

const STATUS_TEXT: Record<string, string> = { H: 'Hadir', T: 'Terlambat', DL: 'Dinas luar', I: 'Izin', S: 'Sakit', C: 'Cuti', A: 'Alfa', AW: 'Alfa awal', AK: 'Alfa akhir', L: 'Libur', '-': 'Belum terlewati' };

/** Rekap satu bulan dalam bentuk kalender: nama pegawai di kolom pertama, tanggal sebagai kepala kolom. */
export function CalendarRecap({ columns, rows }: { columns: Column[]; rows: Row[] }) {
  return (
    <div className="cal-wrap rounded-t-xl" tabIndex={0} role="region" aria-label="Rekap kalender, gulir ke samping untuk tanggal berikutnya">
      <table className="cal-table">
        <thead>
          <tr>
            <th scope="col" className="name text-xs font-semibold text-muted-foreground">Pegawai</th>
            {columns.map((c) => (
              <th key={c.date} scope="col" className={cn(c.holiday ? 'holiday' : c.weekend && 'weekend', c.isToday && 'today')} title={c.holiday ? `${c.holiday.name}${c.holiday.kind === 'CUTI_BERSAMA' ? ' (cuti bersama)' : ''}` : undefined}>
                <span className="block text-[11px] font-medium opacity-80">{HARI_PENDEK[c.weekday]}</span>
                {String(c.day).padStart(2, '0')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employee.id}>
              <th scope="row" className="name">
                <span className="block truncate font-semibold">{r.employee.fullName}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">{r.employee.employeeNumber ? `NIP ${r.employee.employeeNumber}` : r.employee.unit?.name ?? ''}</span>
              </th>
              {r.cells.map((cell, i) => {
                const col = columns[i];
                const off = cell.code === 'L' || col.weekend || !!col.holiday;
                const label = `${r.employee.fullName}, ${cell.date}: ${cell.code ? STATUS_TEXT[cell.code] ?? cell.code : 'belum terjadi'}${cell.checkIn ? `, masuk ${cell.checkIn}` : ''}${cell.checkOut ? `, pulang ${cell.checkOut}` : ''}${cell.corrected ? ', sudah dikoreksi' : ''}${cell.note ? `, ${cell.note}` : ''}`;
                const body = cell.code ? (
                  <>
                    <span className={cn('cal-code', `c-${cell.code === '-' ? 'x' : cell.code}`)}>{cell.code}</span>
                    {/* Jam hanya untuk hari yang punya rekap; Alfa tanpa transaksi cukup kodenya. */}
                    {cell.code !== 'L' && cell.code !== '-' && (cell.checkIn || cell.checkOut || cell.status !== 'ALFA') && (
                      <>
                        <span className={cn('cal-time', cell.checkIn ? 'in' : cell.missingIn ? 'warn' : 'none')}>{cell.checkIn ?? '--:--'}</span>
                        <span className={cn('cal-time', cell.checkOut ? 'out' : cell.missingOut ? 'warn' : 'none')}>{cell.checkOut ?? '--:--'}</span>
                      </>
                    )}
                    {cell.corrected && <span className="cal-fix">✓ Dikoreksi</span>}
                  </>
                ) : null;
                return (
                  <td key={cell.date} className={cn('cell', off && 'off')}>
                    {cell.code ? <Link href={`/absensi/rekap/${r.employee.id}/${cell.date}`} title={label} aria-label={label}>{body}</Link> : <span aria-label={label} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
