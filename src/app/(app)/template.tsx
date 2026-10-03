// Dipasang ulang setiap pindah halaman (bukan saat parameter URL berubah), sehingga isi halaman baru masuk dengan pudar singkat.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
