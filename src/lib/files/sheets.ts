import ExcelJS from 'exceljs';
import { parseCsv } from './csv';
import { readXls, type Sheet } from './xls';

export type { Sheet };

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((x) => x.text).join('');
    return o.text ?? o.result ?? '';
  }
  return v;
}

/** Baca .xlsx, .xls, atau .csv menjadi daftar sheet berisi baris nilai. */
export async function readSheets(buffer: Buffer, filename: string): Promise<Sheet[]> {
  const name = filename.toLowerCase();
  if (name.endsWith('.xls') || (buffer[0] === 0xd0 && buffer[1] === 0xcf)) return readXls(buffer);
  if (name.endsWith('.xlsx') || (buffer[0] === 0x50 && buffer[1] === 0x4b)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb.worksheets.map((ws) => {
      const rows: unknown[][] = [];
      ws.eachRow({ includeEmpty: true }, (r, n) => {
        const vals: unknown[] = [];
        for (let c = 1; c <= ws.columnCount; c++) vals.push(cellValue(r.getCell(c).value));
        rows[n - 1] = vals;
      });
      return { name: ws.name, rows: Array.from(rows, (r) => r || []) };
    });
  }
  return [{ name: 'CSV', rows: parseCsv(buffer.toString('utf8')) }];
}
