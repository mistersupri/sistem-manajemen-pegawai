'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

// Slot kategori 1-4 dari palet referensi dataviz (tervalidasi untuk pasangan bersebelahan).
const config = {
  hadir: { label: 'Hadir', color: '#2a78d6' },
  terlambat: { label: 'Terlambat', color: '#eb6834' },
  izin: { label: 'Izin, sakit, cuti', color: '#1baf7a' },
  tanpaTransaksi: { label: 'Belum ada transaksi', color: '#eda100' },
} satisfies ChartConfig;

export function TrendChart({ data }: { data: { date: string; hadir: number; terlambat: number; izin: number; tanpaTransaksi: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: `${Number(d.date.slice(8))}/${Number(d.date.slice(5, 7))}` }));
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={rows} margin={{ left: -16, right: 8, top: 8 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent />} cursor={{ fillOpacity: 0.08 }} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="hadir" stackId="a" fill="var(--color-hadir)" stroke="var(--card)" strokeWidth={1} />
        <Bar dataKey="terlambat" stackId="a" fill="var(--color-terlambat)" stroke="var(--card)" strokeWidth={1} />
        <Bar dataKey="izin" stackId="a" fill="var(--color-izin)" stroke="var(--card)" strokeWidth={1} />
        <Bar dataKey="tanpaTransaksi" stackId="a" fill="var(--color-tanpaTransaksi)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
