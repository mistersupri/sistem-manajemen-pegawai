import type { Metadata, Viewport } from 'next';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmHost } from '@/components/app/confirm-dialog';

export const metadata: Metadata = {
  title: { default: 'SIMPEG', template: '%s | SIMPEG' },
  description: 'Sistem Informasi Manajemen Pegawai',
};

// Zoom tidak dikunci; inset area aman dipakai navigasi bawah. Warna bilah status mengikuti header navy.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#0c1a45',
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
