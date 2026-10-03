import { redirect } from 'next/navigation';

// Dipindah ke halaman tersendiri tanpa menu aplikasi.
export default function OldFieldDutyPage() {
  redirect('/dinas-luar');
}
