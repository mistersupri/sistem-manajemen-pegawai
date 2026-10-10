// Indikator penilaian kinerja pegawai, mengikuti "Rincian Penilaian Prestasi Kinerja" Suku Dinas Pendidikan
// dengan sebutan PJLP diganti Pegawai. Nilai 1 sampai 100; di bawah 75 Buruk, 75 ke atas Baik.
export interface IndicatorGroup {
  key: string;
  title: string;
  items: { key: string; text: string }[];
}

export const INDICATOR_GROUPS: IndicatorGroup[] = [
  {
    key: 'disiplin', title: 'Disiplin kehadiran',
    items: [
      { key: 'd1', text: 'Hadir tepat waktu' },
      { key: 'd2', text: 'Menggunakan jam kerja secara efektif dalam pelaksanaan tugas' },
      { key: 'd3', text: 'Menggunakan jam istirahat siang dengan efektif dan kembali ke kantor tepat waktu' },
    ],
  },
  {
    key: 'tanggung-jawab', title: 'Tanggung jawab penyelesaian pekerjaan',
    items: [
      { key: 't1', text: 'Tidak mengulur-ulur waktu dalam memberikan pelayanan' },
      { key: 't2', text: 'Bersikap tenang saat menghadapi komplain dari orang yang dilayani' },
      { key: 't3', text: 'Mengingatkan rekan kerja yang melakukan kesalahan' },
      { key: 't4', text: 'Berani menerima konsekuensi atas kesalahan yang dilakukan' },
      { key: 't5', text: 'Berani menegakkan aturan meski dalam situasi sulit' },
      { key: 't6', text: 'Dapat menerima saran dan masukan dari orang lain' },
      { key: 't7', text: 'Menuntaskan pekerjaan yang menjadi tanggung jawabnya' },
      { key: 't8', text: 'Memiliki kreativitas dalam mencari informasi untuk kelancaran penyelesaian tugas' },
      { key: 't9', text: 'Bekerja sesuai dengan prosedur dan aturan yang berlaku' },
      { key: 't10', text: 'Memelihara sarana dan prasarana kerja yang dimiliki oleh Pemprov. DKI Jakarta' },
      { key: 't11', text: 'Memberikan pelayanan dengan kriteria 5 S (Senyum, Sapa, Salam, Sopan, Santun)' },
      { key: 't12', text: 'Mampu memberikan informasi dengan baik apabila ada pertanyaan baik yang bersifat kegiatan maupun ruangan' },
      { key: 't13', text: 'Melaksanakan tugas dari atasan langsung baik lisan dan tulisan' },
      { key: 't14', text: 'Melaporkan hasil pekerjaan kepada atasan baik lisan dan tulisan' },
    ],
  },
  {
    key: 'kepatuhan', title: 'Kepatuhan terhadap kewajiban dan larangan',
    items: [
      { key: 'k1', text: 'Melaksanakan kewajiban sebagai Pegawai sesuai ketentuan yang berlaku' },
      { key: 'k2', text: 'Tidak melanggar larangan sebagai Pegawai sesuai ketentuan yang berlaku' },
    ],
  },
];

export const INDICATORS = INDICATOR_GROUPS.flatMap((g) => g.items);
export const INDICATOR_KEYS = INDICATORS.map((i) => i.key);

export const PASS_SCORE = 75;
export const predicateOf = (average: number) => (average >= PASS_SCORE ? 'Baik' : 'Buruk');

export const COMPETENCE = { SESUAI: 'Sesuai', TIDAK_SESUAI: 'Tidak sesuai' } as const;
export const FOLLOW_UP = { DIREKOMENDASIKAN: 'Direkomendasikan', PEMBIMBINGAN: 'Pembimbingan', MUTASI: 'Mutasi', DIBERHENTIKAN: 'Diberhentikan' } as const;

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const averageOf = (scores: Record<string, number>) => {
  const v = INDICATOR_KEYS.map((k) => scores[k]).filter((x) => typeof x === 'number');
  return v.length ? round2(v.reduce((a, b) => a + b, 0) / v.length) : 0;
};
