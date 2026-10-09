import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requirePage } from '@/lib/guard';
import { getSettings } from '@/lib/settings';
import { resultSheet } from '@/lib/services/assessment';
import { monthText } from '@/lib/services/performance';
import { COMPETENCE, FOLLOW_UP, INDICATOR_GROUPS, PASS_SCORE } from '@/lib/assessment/indicators';
import { fmtTanggal, todayIn } from '@/lib/time';
import { PrintButton } from './print-button';

export const metadata = { title: 'Lembar Penilaian Kinerja' };

const Choice = ({ options, chosen }: { options: Record<string, string>; chosen: string | null }) => (
  <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
    {Object.entries(options).map(([k, v]) => (
      <span key={k} className={k === chosen ? 'rounded border-2 border-black px-1.5 font-bold' : 'text-neutral-500 line-through decoration-neutral-400'}>{v}</span>
    ))}
  </span>
);

export default async function SheetPage({ params }: { params: Promise<{ periodId: string; employeeId: string }> }) {
  const actor = await requirePage();
  const { periodId, employeeId } = await params;
  const [r, s] = await Promise.all([resultSheet(actor, periodId, employeeId), getSettings()]);
  const e = r.employee;
  const sup = e.supervisor;
  const printed = fmtTanggal(todayIn(s['org.timezone']));
  // Nomor urut indikator berlanjut antar kelompok.
  const offsets = INDICATOR_GROUPS.map((_, i) => INDICATOR_GROUPS.slice(0, i).reduce((n, g) => n + g.items.length, 0));
  return (
    <div className="mx-auto max-w-[210mm] px-4 py-6 print:max-w-none print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/kinerja/penilaian" className="inline-flex min-h-9 items-center gap-1.5 text-sm text-primary hover:underline"><ArrowLeft className="size-4" />Kembali</Link>
        <PrintButton />
      </div>
      <article className="rounded-xl border bg-white p-6 text-[13px] leading-snug text-black shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="mb-4 text-center">
          <h1 className="text-base font-bold uppercase">Rincian Penilaian Prestasi Kinerja Pegawai</h1>
          <p className="font-bold uppercase">{s['org.name']}</p>
          <p className="font-bold uppercase">Bulan {monthText(r.period.month).replace(' ', ' Tahun ')}</p>
        </header>

        <table className="mb-4 w-full border-collapse border border-black">
          <thead><tr><th className="w-1/2 border border-black bg-neutral-100 p-1.5 text-left">Pegawai</th><th className="w-1/2 border border-black bg-neutral-100 p-1.5 text-left">Atasan langsung</th></tr></thead>
          <tbody>
            <tr><td className="border border-black p-1.5 align-top"><b>Nama</b><br />{e.fullName}</td><td className="border border-black p-1.5 align-top"><b>Nama</b><br />{sup?.fullName ?? '-'}</td></tr>
            <tr><td className="border border-black p-1.5 align-top"><b>NIP</b><br />{e.employeeNumber ?? '-'}</td><td className="border border-black p-1.5 align-top"><b>NIP</b><br />{sup?.employeeNumber ?? '-'}</td></tr>
            <tr><td className="border border-black p-1.5 align-top"><b>Jabatan</b><br />{e.position ?? '-'}</td><td className="border border-black p-1.5 align-top"><b>Jabatan</b><br />{sup?.position ?? '-'}</td></tr>
            <tr><td className="border border-black p-1.5 align-top"><b>Unit kerja</b><br />{e.unit?.name ?? '-'}</td><td className="border border-black p-1.5 align-top"><b>Unit kerja</b><br />{sup?.unit?.name ?? '-'}</td></tr>
          </tbody>
        </table>

        <div className="mb-3 border border-black p-2 text-xs">
          <p className="font-bold">*Petunjuk pengisian</p>
          <ol className="list-decimal pl-5">
            <li>Isi kotak nilai dengan angka 1 sampai 100.</li>
            <li>Predikat: kurang dari {PASS_SCORE} = Buruk; {PASS_SCORE} sampai 100 = Baik.</li>
          </ol>
        </div>

        <table className="mb-3 w-full border-collapse border border-black">
          <thead><tr><th className="w-10 border border-black bg-neutral-100 p-1.5">No</th><th className="border border-black bg-neutral-100 p-1.5 text-left">Indikator penilaian pegawai</th><th className="w-20 border border-black bg-neutral-100 p-1.5">Nilai</th></tr></thead>
          <tbody>
            {INDICATOR_GROUPS.map((g, gi) => (
              <FragmentRows key={g.key} title={g.title}>
                {g.items.map((it, ii) => (
                  <tr key={it.key}><td className="border border-black p-1.5 text-center">{offsets[gi] + ii + 1}</td><td className="border border-black p-1.5">{it.text}</td><td className="border border-black p-1.5 text-center font-semibold tabular-nums">{r.final[it.key] ?? ''}</td></tr>
                ))}
              </FragmentRows>
            ))}
            <tr><td colSpan={2} className="border border-black p-1.5 text-right font-bold">Jumlah</td><td className="border border-black p-1.5 text-center font-semibold tabular-nums">{r.average != null ? Object.values(r.final).reduce((a, b) => a + b, 0).toFixed(2).replace(/\.00$/, '') : ''}</td></tr>
            <tr><td colSpan={2} className="border border-black p-1.5 text-right font-bold">Nilai rata-rata indikator penilaian pegawai</td><td className="border border-black p-1.5 text-center font-bold tabular-nums">{r.average ?? ''}</td></tr>
            <tr><td colSpan={2} className="border border-black p-1.5 text-right font-bold">Predikat</td><td className="border border-black p-1.5 text-center font-bold">{r.predicate ?? ''}</td></tr>
          </tbody>
        </table>
        <p className="mb-3 text-xs">*Nilai rata-rata didapat dari jumlah nilai seluruh indikator dibagi {Object.keys(r.final).length || 'jumlah'} indikator. Nilai tiap indikator adalah rata-rata nilai atasan langsung dan rata-rata nilai rekan penilai{r.peerCount ? ` (${r.peerCount} rekan)` : ''}.</p>

        <div className="mb-4 border border-black p-2">
          <p className="mb-1 font-bold">Kesimpulan dari laporan hasil kinerja</p>
          <p className="mb-1">Pekerjaan sesuai kompetensi: <Choice options={COMPETENCE} chosen={r.competence} /></p>
          <p>Tindak lanjut yang disarankan: <Choice options={FOLLOW_UP} chosen={r.followUp} /></p>
          {r.notes.length > 0 && <p className="mt-1 text-xs"><b>Catatan atasan:</b> {r.notes[0]}</p>}
        </div>

        <div className="grid grid-cols-2 gap-6 text-center">
          <div><p>Tanggal: {printed}</p><p className="font-bold">Tanda tangan atasan langsung</p><div className="h-20" /><p className="font-bold underline">{sup?.fullName ?? '................................'}</p><p>NIP {sup?.employeeNumber ?? '..............................'}</p></div>
          <div><p>Tanggal: {printed}</p><p className="font-bold">Tanda tangan pejabat penilai</p><div className="h-20" /><p className="font-bold">................................</p><p>NIP ..............................</p></div>
        </div>
      </article>
    </div>
  );
}

function FragmentRows({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <tr><td colSpan={3} className="border border-black bg-neutral-50 p-1.5 font-bold">{title}</td></tr>
      {children}
    </>
  );
}
