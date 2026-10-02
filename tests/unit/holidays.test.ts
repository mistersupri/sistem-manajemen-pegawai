import { describe, expect, it } from 'vitest';
import { fetchNationalHolidays, normalizeDate, parseHolidayCsv, parseHolidayJson, parseIcs } from '@/lib/services/holidays';

// Potongan respons dengan bentuk sama seperti sumber aslinya (isi dipersingkat).
const DAYOFF = [
  { tanggal: '2026-1-1', keterangan: 'Tahun Baru 2026 Masehi', is_cuti: false },
  { tanggal: '2026-03-20', keterangan: 'Cuti Bersama Idul Fitri', is_cuti: true },
  { tanggal: '2026-08-17', keterangan: 'Hari Kemerdekaan RI', is_cuti: false },
];
const NAGER = [
  { date: '2026-01-01', localName: 'Tahun Baru Masehi', name: "New Year's Day", countryCode: 'ID', types: ['Public'] },
  { date: '2026-08-17', localName: 'Hari Ulang Tahun Kemerdekaan Republik Indonesia', name: 'Independence Day', countryCode: 'ID', types: ['Public'] },
];

describe('hari libur nasional', () => {
  it('menormalkan tanggal tanpa nol di depan dan menolak tanggal mustahil', () => {
    expect(normalizeDate('2026-1-5')).toBe('2026-01-05');
    expect(normalizeDate('20261225')).toBe('2026-12-25');
    expect(normalizeDate('2026-02-30')).toBeNull();
    expect(normalizeDate('kemarin')).toBeNull();
  });

  it('membaca format dayoffapi termasuk tanda cuti bersama', () => {
    const r = parseHolidayJson(DAYOFF);
    expect(r).toEqual([
      { date: '2026-01-01', name: 'Tahun Baru 2026 Masehi', kind: 'NASIONAL' },
      { date: '2026-03-20', name: 'Cuti Bersama Idul Fitri', kind: 'CUTI_BERSAMA' },
      { date: '2026-08-17', name: 'Hari Kemerdekaan RI', kind: 'NASIONAL' },
    ]);
  });

  it('membaca format Nager.Date memakai nama bahasa Indonesia', () => {
    expect(parseHolidayJson(NAGER)[1]).toEqual({ date: '2026-08-17', name: 'Hari Ulang Tahun Kemerdekaan Republik Indonesia', kind: 'NASIONAL' });
  });

  it('dua libur di tanggal yang sama digabung, libur nasional menang atas cuti bersama', () => {
    const r = parseHolidayJson([{ date: '2026-05-14', name: 'Cuti Bersama Kenaikan' }, { date: '2026-05-14', name: 'Kenaikan Isa Almasih' }]);
    expect(r).toEqual([{ date: '2026-05-14', name: 'Cuti Bersama Kenaikan; Kenaikan Isa Almasih', kind: 'NASIONAL' }]);
  });

  it('membaca .ics dan memecah acara beberapa hari (DTEND eksklusif)', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20260320', 'DTEND;VALUE=DATE:20260322', 'SUMMARY:Idul Fitri', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261224', 'SUMMARY:Cuti Bersama Natal', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    expect(parseIcs(ics)).toEqual([
      { date: '2026-03-20', name: 'Idul Fitri', kind: 'NASIONAL' },
      { date: '2026-03-21', name: 'Idul Fitri', kind: 'NASIONAL' },
      { date: '2026-12-24', name: 'Cuti Bersama Natal', kind: 'CUTI_BERSAMA' },
    ]);
  });

  it('membaca CSV dengan baris judul dan kolom jenis', () => {
    expect(parseHolidayCsv('tanggal,keterangan,jenis\n2026-12-25,Natal,\n2026-12-24,Natal,cuti bersama\n')).toEqual([
      { date: '2026-12-24', name: 'Natal', kind: 'CUTI_BERSAMA' },
      { date: '2026-12-25', name: 'Natal', kind: 'NASIONAL' },
    ]);
  });

  it('pindah ke sumber berikutnya bila sumber pertama gagal atau datanya terlalu sedikit', async () => {
    const full = Array.from({ length: 12 }, (_, i) => ({ date: `2026-${String(i + 1).padStart(2, '0')}-10`, localName: `Libur ${i + 1}` }));
    const calls: string[] = [];
    const fake = (async (url: string) => {
      calls.push(url);
      if (url.includes('dayoffapi')) return new Response('down', { status: 503 });
      if (url.includes('deno')) return Response.json(DAYOFF);
      return Response.json(full);
    }) as typeof fetch;
    const r = await fetchNationalHolidays(2026, fake);
    expect(r.source).toBe('NAGER');
    expect(r.items).toHaveLength(12);
    expect(calls).toHaveLength(3);
  });

  it('semua sumber gagal menghasilkan galat yang menyebut tiap sumber', async () => {
    const fake = (async () => { throw new Error('ENOTFOUND'); }) as typeof fetch;
    await expect(fetchNationalHolidays(2026, fake)).rejects.toThrow(/DAYOFFAPI: ENOTFOUND.*NAGER: ENOTFOUND/);
  });
});
