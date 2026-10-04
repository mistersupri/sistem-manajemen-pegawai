import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { readSheets } from '@/lib/files/sheets';

// Nilai sel yang dibungkus Excel (hyperlink email otomatis, rich text, rumus) harus terbaca sebagai teks polos.
describe('baca sheet', () => {
  it('membuka bungkus hyperlink, rich text, dan rumus', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Pegawai');
    ws.addRow(['Nama', 'Email', 'Rumus', 'Galat']);
    ws.addRow([
      { richText: [{ text: 'Budi ' }, { font: { bold: true }, text: 'Santoso' }] },
      { text: { richText: [{ text: 'budi@contoh.go.id' }] }, hyperlink: 'mailto:budi@contoh.go.id' },
      { formula: 'CONCAT("a","b")', result: 'ab' },
      { formula: 'VLOOKUP(1,A1:A2,2,0)', result: { error: '#N/A' } },
    ]);
    const [sheet] = await readSheets(Buffer.from(await wb.xlsx.writeBuffer()), 'uji.xlsx');
    expect(sheet.rows[1]).toEqual(['Budi Santoso', 'budi@contoh.go.id', 'ab', '']);
  });
});
