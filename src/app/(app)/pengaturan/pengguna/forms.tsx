'use client';

import { useState } from 'react';
import { MoreHorizontal, Plus, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

type Opt = { id: string; name: string };

export function CreateUser({ employees, canNoEmployee }: { employees: Opt[]; canNoEmployee: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, fields, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus />Tambah pengguna</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => api('POST', '/api/v1/users', Object.fromEntries(new FormData(e.currentTarget))), { success: 'Pengguna dibuat. Berikan peran agar bisa memakai sistem.' });
          if (r !== undefined) setOpen(false);
        }}>
          <DialogHeader><DialogTitle>Tambah pengguna</DialogTitle><DialogDescription>Pengguna wajib mengganti password saat pertama masuk. Akun pegawai biasa juga bisa dibuat dari halaman data pegawai.</DialogDescription></DialogHeader>
          <Field id="username" label="Username" error={fields.username} required><Input {...fieldProps('username', fields.username)} required autoComplete="off" /></Field>
          <Field id="email" label="Email" error={fields.email}><Input {...fieldProps('email', fields.email)} type="email" /></Field>
          <Field id="employeeId" label="Terhubung ke pegawai" error={fields.employeeId} hint={canNoEmployee ? 'Kosongkan untuk akun non-pegawai (mis. admin IT).' : undefined}>
            <NativeSelect {...fieldProps('employeeId', fields.employeeId, canNoEmployee)} defaultValue="" required={!canNoEmployee}>
              <NativeSelectOption value="" disabled={!canNoEmployee}>{canNoEmployee ? 'Tidak terhubung' : 'Pilih pegawai'}</NativeSelectOption>
              {employees.map((e) => <NativeSelectOption key={e.id} value={e.id}>{e.name}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <Field id="password" label="Password sementara" error={fields.password} hint="Minimal 8 karakter, berisi huruf dan angka." required><Input {...fieldProps('password', fields.password, true)} type="password" required autoComplete="new-password" /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RoleChip({ userId, urId, label }: { userId: string; urId: string; label: string }) {
  const { pending, run } = useAction();
  return (
    <Badge variant="netral" className="h-auto max-w-full gap-1 py-0.5 pr-0.5 text-left whitespace-normal">
      {label}
      <button type="button" disabled={pending} className="inline-flex size-6 items-center justify-center rounded-full hover:bg-black/10" aria-label={`Cabut peran ${label}`}
        onClick={() => { if (confirm(`Cabut peran ${label}?`)) run(() => api('DELETE', `/api/v1/users/${userId}/roles/${urId}`), { success: 'Peran dicabut.' }); }}>
        <X className="size-3.5" />
      </button>
    </Badge>
  );
}

export function UserActions({ id, username, isActive, mfaEnabled, roles, units, canAllUnits, self }: {
  id: string; username: string; isActive: boolean; mfaEnabled: boolean; roles: Opt[]; units: Opt[]; canAllUnits: boolean; self: boolean;
}) {
  const [mode, setMode] = useState<null | 'role' | 'cred'>(null);
  const [cred, setCred] = useState<{ username: string; password: string } | null>(null);
  const [sub, setSub] = useState(true);
  const { pending, fields, error, run } = useAction();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Aksi untuk ${username}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMode('role')}>Berikan peran</DropdownMenuItem>
          <DropdownMenuItem onSelect={async () => { const r = await run(() => api<{ username: string; password: string }>('POST', `/api/v1/users/${id}/reset-password`), { success: 'Password direset.' }); if (r) { setCred(r); setMode('cred'); } }}>Reset password</DropdownMenuItem>
          {mfaEnabled && <DropdownMenuItem onSelect={() => { if (confirm(`Reset MFA ${username}? Pengguna harus memasang ulang aplikasi autentikator.`)) run(() => api('POST', `/api/v1/users/${id}/reset-mfa`), { success: 'MFA direset.' }); }}>Reset MFA</DropdownMenuItem>}
          {!self && <><DropdownMenuSeparator /><DropdownMenuItem variant={isActive ? 'destructive' : 'default'} onSelect={() => { if (confirm(isActive ? `Nonaktifkan ${username}? Sesi aktifnya diakhiri.` : `Aktifkan ${username}?`)) run(() => api('POST', `/api/v1/users/${id}/status`, { active: !isActive }), { success: 'Status pengguna diperbarui.' }); }}>{isActive ? 'Nonaktifkan' : 'Aktifkan'}</DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={mode === 'role'} onOpenChange={(o) => setMode(o ? 'role' : null)}>
        <DialogContent className="sm:max-w-md">
          <form className="grid gap-4" onSubmit={async (e) => {
            e.preventDefault();
            const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
            const r = await run(() => api('POST', `/api/v1/users/${id}/roles`, { roleId: d.roleId, unitId: d.unitId || null, includeSubunits: sub }), { success: 'Peran diberikan.' });
            if (r !== undefined) setMode(null);
          }}>
            <DialogHeader><DialogTitle>Berikan peran ke {username}</DialogTitle><DialogDescription>Anda hanya bisa memberikan izin dan cakupan unit yang Anda miliki sendiri.</DialogDescription></DialogHeader>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Field id="roleId" label="Peran" error={fields.roleId} required>
              <NativeSelect {...fieldProps('roleId', fields.roleId)} required defaultValue=""><NativeSelectOption value="" disabled>Pilih peran</NativeSelectOption>{roles.map((r) => <NativeSelectOption key={r.id} value={r.id}>{r.name}</NativeSelectOption>)}</NativeSelect>
            </Field>
            <Field id="unitId" label="Cakupan unit" error={fields.unitId}>
              <NativeSelect {...fieldProps('unitId', fields.unitId)} defaultValue={canAllUnits ? '' : units[0]?.id}>
                {canAllUnits && <NativeSelectOption value="">Seluruh unit</NativeSelectOption>}
                {units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <div className="flex items-start gap-3"><Checkbox id="sub" checked={sub} onCheckedChange={(v) => setSub(!!v)} className="mt-0.5" /><Label htmlFor="sub" className="font-normal">Termasuk sub-unit</Label></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setMode(null)}>Batal</Button><Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : 'Berikan'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={mode === 'cred'} onOpenChange={(o) => { if (!o) { setMode(null); setCred(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Password sementara</DialogTitle><DialogDescription>Hanya ditampilkan sekali. Sampaikan langsung ke pengguna; ia wajib menggantinya saat masuk.</DialogDescription></DialogHeader>
          {cred && <Alert variant="success"><AlertTitle>{cred.username}</AlertTitle><AlertDescription><code className="text-base font-semibold select-all">{cred.password}</code></AlertDescription></Alert>}
          <DialogFooter><Button onClick={() => { setMode(null); setCred(null); }}>Selesai</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RolePermissions({ role, groups, locked }: { role: { id: string; name: string; description: string | null; code: string; users: number; perms: string[] }; groups: { group: string; items: { code: string; label: string }[] }[]; locked: boolean }) {
  const [sel, setSel] = useState<string[]>(role.perms);
  const { pending, run } = useAction();
  const dirty = JSON.stringify([...sel].sort()) !== JSON.stringify([...role.perms].sort());
  return (
    <Card>
      <CardHeader>
        <CardTitle>{role.name} <span className="text-sm font-normal text-muted-foreground">· {role.users} penugasan</span></CardTitle>
        <CardDescription>{role.description}{locked ? ' Izin peran ini tidak bisa diubah.' : ''}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <fieldset key={g.group} className="grid content-start gap-1.5">
              <legend className="mb-1 text-sm font-semibold">{g.group}</legend>
              {g.items.map((p) => (
                <label key={p.code} className="flex min-h-8 items-start gap-2 text-sm">
                  <Checkbox className="mt-0.5" disabled={locked} checked={sel.includes(p.code)} onCheckedChange={(v) => setSel((s) => (v ? [...s, p.code] : s.filter((x) => x !== p.code)))} />
                  <span>{p.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        {!locked && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={!dirty || pending} onClick={() => run(() => api('PUT', `/api/v1/roles/${role.id}/permissions`, { permissions: sel }), { success: `Izin ${role.name} disimpan. Berlaku saat pengguna memuat halaman berikutnya.` })}>{pending ? 'Menyimpan...' : 'Simpan izin'}</Button>
            {dirty && <Button variant="outline" onClick={() => setSel(role.perms)}>Batalkan perubahan</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
