'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { CATEGORY_COLOR } from './attendance-colors';

const config = {
  hadir: { label: 'Hadir dan dinas luar', color: CATEGORY_COLOR.HADIR },
  terlambat: { label: 'Terlambat', color: CATEGORY_COLOR.TERLAMBAT },
  izin: { label: 'Izin, sakit, cuti', color: CATEGORY_COLOR.IZIN_CUTI },
  tanpaTransaksi: { label: 'Belum ada transaksi', color: CATEGORY_COLOR.BELUM_ABSEN },
} satisfies ChartConfig;

export function TrendChart({ data }: { data: { date: string; hadir: number; terlambat: number; izin: number; tanpaTransaksi: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: `${Number(d.date.slice(8))}/${Number(d.date.slice(5, 7))}` }));
  // Lebar sumbu Y mengikuti digit total terbesar agar angka ribuan tidak terpotong.
  const top = Math.max(0, ...data.map((d) => d.hadir + d.terlambat + d.izin + d.tanpaTransaksi));
  const yWidth = Math.max(40, String(top).length * 8 + 24);
  return (
    <ChartContainer config={config} className="aspect-auto h-60 w-full">
      <BarChart data={rows} margin={{ left: -16, right: 8, top: 8 }} barCategoryGap={3}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={yWidth} />
        <ChartTooltip content={<ChartTooltipContent />} cursor={{ fillOpacity: 0.08 }} />
        <ChartLegend content={<ChartLegendContent />} />
        {(['hadir', 'terlambat', 'izin', 'tanpaTransaksi'] as const).map((k, i, all) => (
          <Bar key={k} dataKey={k} stackId="a" fill={`var(--color-${k})`} stroke="var(--card)" strokeWidth={1} isAnimationActive={false} radius={i === all.length - 1 ? [3, 3, 0, 0] : undefined} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
