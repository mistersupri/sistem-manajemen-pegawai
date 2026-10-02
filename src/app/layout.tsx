import type { Metadata } from 'next';
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
