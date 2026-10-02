// Garis hari kerja 05.00-22.00: pita jadwal, titik masuk dan pulang.
const START = 5 * 60;
const SPAN = 17 * 60;
const pos = (hhmm: string | null | undefined) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return Math.min(100, Math.max(0, ((h * 60 + m - START) / SPAN) * 100));
};

export function Dayline({ scheduleIn, scheduleOut, checkIn, checkOut, late, label }: { scheduleIn?: string | null; scheduleOut?: string | null; checkIn?: string | null; checkOut?: string | null; late?: boolean; label?: string }) {
  const a = pos(scheduleIn);
  const b = scheduleOut && scheduleIn && scheduleOut <= scheduleIn ? 100 : pos(scheduleOut);
  const i = pos(checkIn);
  const o = pos(checkOut);
  return (
    <div className="dayline" role="img" aria-label={label ?? `Jadwal ${scheduleIn ?? '-'} sampai ${scheduleOut ?? '-'}, masuk ${checkIn ?? 'belum'}, pulang ${checkOut ?? 'belum'}`}>
      <span className="track" />
      {a != null && b != null && <span className="shift" style={{ left: `${a}%`, width: `${Math.max(1, b - a)}%` }} />}
      {i != null && <span className={`dot in ${late ? 'late' : ''}`} style={{ left: `${i}%` }} />}
      {o != null && <span className="dot out" style={{ left: `${o}%` }} />}
    </div>
  );
}
