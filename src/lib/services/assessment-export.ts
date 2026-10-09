import ExcelJS from 'exceljs';
import type { Actor } from '../auth/actor';
import { COMPETENCE, FOLLOW_UP } from '../assessment/indicators';
import { periodResults } from './assessment';
import { monthText } from './performance';

/** Rekap hasil penilaian kinerja satu periode untuk semua pegawai dalam cakupan. */
export async function periodResultsWorkbook(actor: Actor, periodId: string) {
  const { period, results } = await periodResults(actor, periodId);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Penilaian ${period.month}`);
  ws.addRow([`Hasil penilaian kinerja pegawai, ${monthText(period.month)}`]);
  ws.getRow(1).font = { bold: true, size: 13 };
  ws.addRow([]);
  ws.addRow(['Nama', 'NIP', 'Jabatan', 'Unit', 'Penilai selesai', 'Nilai atasan', 'Rata-rata rekan', 'Jumlah rekan', 'Nilai akhir', 'Predikat', 'Kompetensi', 'Tindak lanjut']);
  ws.getRow(3).font = { bold: true };
  for (const r of results) {
    ws.addRow([
      r.employee.fullName, r.employee.employeeNumber ?? '', r.employee.position ?? '', r.employee.unit?.name ?? '',
      `${r.submitted}/${r.assigned}`, r.bossAverage ?? '', r.peerAverage ?? '', r.peerCount, r.average ?? '', r.predicate ?? '',
      r.competence ? COMPETENCE[r.competence as keyof typeof COMPETENCE] ?? r.competence : '',
      r.followUp ? FOLLOW_UP[r.followUp as keyof typeof FOLLOW_UP] ?? r.followUp : '',
    ]);
  }
  ws.getColumn(2).numFmt = '@';
  [28, 22, 28, 30, 14, 12, 14, 12, 12, 10, 14, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: 'frozen', ySplit: 3 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
