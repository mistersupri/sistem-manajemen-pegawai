import { Skeleton } from '@/components/ui/skeleton';

// Kerangka saat halaman dimuat: judul lalu isi, mengikuti tata letak halaman sebenarnya.
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat halaman...</span>
      <div className="px-4 pt-6 lg:px-8">
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="mt-2 h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 px-4 pt-5 pb-8 lg:px-8">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  );
}
