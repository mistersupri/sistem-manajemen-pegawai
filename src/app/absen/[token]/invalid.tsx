import { LinkIcon } from 'lucide-react';

export function InvalidStation({ org }: { org: string }) {
  return (
    <main className="dark flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <div className="max-w-md rounded-xl border bg-card p-8 text-center">
        <LinkIcon className="mx-auto mb-3 size-10 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-bold">Tautan absen tidak berlaku</h1>
        <p className="mt-2 text-muted-foreground">Tautan ini sudah diganti, dinonaktifkan, atau salah ketik. Minta tautan baru ke admin {org}.</p>
      </div>
    </main>
  );
}
