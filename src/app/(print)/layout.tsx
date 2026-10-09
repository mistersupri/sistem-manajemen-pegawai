// Halaman cetak: tanpa sidebar dan header aplikasi.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-muted/40 print:bg-white">{children}</div>;
}
