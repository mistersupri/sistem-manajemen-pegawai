import type { Metadata, Viewport } from 'next';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmHost } from '@/components/app/confirm-dialog';

export const metadata: Metadata = {
  title: { default: 'SIMPEG', template: '%s | SIMPEG' },
  description: 'Sistem Informasi Manajemen Pegawai',
};

// Zoom tidak dikunci; inset area aman dipakai navigasi bawah. Warna bilah status mengikuti header putih.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-dvh">
        {children}
        <Toaster position="top-right" richColors closeButton />
        <ConfirmHost />
      </body>
    </html>
  );
}
