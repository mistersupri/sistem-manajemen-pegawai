/** Batang horizontal berlabel (satu seri), dengan nilai ditulis sebagai teks. */
export function BarList({ items, total }: { items: { name: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="grid gap-2.5">
      {items.map((i) => (
        <li key={i.name} className="grid gap-1">
          <div className="flex justify-between gap-3 text-sm"><span className="truncate">{i.name}</span><span className="tabular text-muted-foreground">{i.count}{total ? ` · ${Math.round((i.count / total) * 100)}%` : ''}</span></div>
          <div className="h-2 rounded-full bg-muted" aria-hidden><div className="h-2 rounded-full bg-[#2a78d6]" style={{ width: `${(i.count / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
