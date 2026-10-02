'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, fieldProps } from '@/components/app/field';
import { api, useAction } from '@/components/app/api-client';

export interface EmployeeFormValues {
  id?: string;
  employeeNumber?: string | null;
  nik?: string | null;
  fullName?: string;
  frontTitle?: string | null;
  backTitle?: string | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  employmentStatus?: string | null;
  position?: string | null;
  rank?: string | null;
  unitId?: string | null;
  supervisorId?: string | null;
  startDate?: string | null;
  machinePin?: string | null;
}

export function EmployeeForm({ initial, units, supervisors, statuses, canSeeNik, hasNik }: {
  initial: EmployeeFormValues;
  units: { id: string; name: string }[];
  supervisors: { id: string; fullName: string; position: string | null }[];
  statuses: string[];
  canSeeNik: boolean;
  hasNik: boolean;
}) {
  const router = useRouter();
  const editing = !!initial.id;
  const { pending, fields, run } = useAction();
  const [account, setAccount] = useState<{ username: string; password: string } | null>(null);
  const v = (k: keyof EmployeeFormValues) => (initial[k] as string | null | undefined) ?? '';
  const f = (id: string, label: string, opts: { type?: string; required?: boolean; hint?: string; className?: string; inputMode?: 'numeric' | 'tel' | 'email'; list?: string; max?: number } = {}) => (
    <Field id={id} label={label} error={fields[id]} hint={opts.hint} required={opts.required} className={opts.className}>
      <Input {...fieldProps(id, fields[id], !!opts.hint)} type={opts.type ?? 'text'} defaultValue={v(id as keyof EmployeeFormValues)} required={opts.required} inputMode={opts.inputMode} list={opts.list} maxLength={opts.max} />
    </Field>
  );

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, unknown> = {};
    for (const [k, val] of fd.entries()) data[k] = typeof val === 'string' ? val.trim() || null : val;
    data.createAccount = fd.get('createAccount') === 'on';
    const r = await run(
      () => editing ? api<{ id: string }>('PATCH', `/api/v1/employees/${initial.id}`, data) : api<{ id: string; account: { username: string; password: string } | null }>('POST', '/api/v1/employees', data),
      { success: editing ? 'Data pegawai disimpan.' : 'Pegawai ditambahkan.', refresh: false },
    );
    if (!r) return;
    const acc = (r as { account?: { username: string; password: string } | null }).account;
    if (acc) { setAccount(acc); return; }
    router.push(`/pegawai/${r.id}`);
    router.refresh();
  }

  if (account) {
    return (
      <Alert variant="success">
        <AlertTitle>Pegawai dan akun login dibuat</AlertTitle>
        <AlertDescription>
          <p>Username <b>{account.username}</b>, password awal sama dengan NIP. Pegawai wajib mengganti password saat masuk pertama.</p>
          <Button asChild size="sm" className="mt-2"><Link href="/pegawai">Kembali ke daftar pegawai</Link></Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      {Object.keys(fields).length > 0 && <Alert variant="destructive"><AlertDescription>Periksa isian yang ditandai merah.</AlertDescription></Alert>}
      <Card>
        <CardHeader><CardTitle>Identitas</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-6">
          {f('frontTitle', 'Gelar depan', { className: 'md:col-span-1', max: 30 })}
          {f('fullName', 'Nama lengkap', { required: true, className: 'md:col-span-3', max: 150 })}
          {f('backTitle', 'Gelar belakang', { className: 'md:col-span-2', max: 50 })}
          {f('employeeNumber', 'NIP / nomor pegawai', { className: 'md:col-span-3', inputMode: 'numeric', hint: 'Opsional, harus unik. Dipakai sebagai username akun.', max: 30 })}
          {canSeeNik ? (
            <Field id="nik" label="NIK" error={fields.nik} hint={editing && hasNik ? 'Sudah tersimpan terenkripsi. Kosongkan bila tidak diubah.' : 'Data sensitif, disimpan terenkripsi.'} className="md:col-span-3">
              <Input {...fieldProps('nik', fields.nik, true)} inputMode="numeric" maxLength={16} defaultValue="" autoComplete="off" />
            </Field>
          ) : <p className="self-end text-sm text-muted-foreground md:col-span-3">NIK hanya bisa dilihat dan diisi petugas dengan izin data sensitif.</p>}
          {f('birthPlace', 'Tempat lahir', { className: 'md:col-span-2', max: 80 })}
          {f('birthDate', 'Tanggal lahir', { type: 'date', className: 'md:col-span-2' })}
          <Field id="gender" label="Jenis kelamin" error={fields.gender} className="md:col-span-2">
            <NativeSelect {...fieldProps('gender', fields.gender)} defaultValue={v('gender')}><NativeSelectOption value="">Tidak diisi</NativeSelectOption><NativeSelectOption value="L">Laki-laki</NativeSelectOption><NativeSelectOption value="P">Perempuan</NativeSelectOption></NativeSelect>
          </Field>
          <Field id="address" label="Alamat" error={fields.address} className="md:col-span-6"><Textarea {...fieldProps('address', fields.address)} defaultValue={v('address')} rows={2} maxLength={300} /></Field>
          {f('phone', 'Telepon', { type: 'tel', inputMode: 'tel', className: 'md:col-span-3', max: 20 })}
          {f('email', 'Email', { type: 'email', inputMode: 'email', className: 'md:col-span-3', max: 150 })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Penempatan dan jabatan</CardTitle>
          <CardDescription>Perubahan jabatan, pangkat, status, atau unit disimpan sebagai riwayat dengan tanggal efektif. Riwayat lama tidak dihapus.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-6">
          <Field id="unitId" label="Unit kerja" error={fields.unitId} className="md:col-span-3">
            <NativeSelect {...fieldProps('unitId', fields.unitId)} defaultValue={v('unitId')}><NativeSelectOption value="">Pilih unit</NativeSelectOption>{units.map((u) => <NativeSelectOption key={u.id} value={u.id}>{u.name}</NativeSelectOption>)}</NativeSelect>
          </Field>
          <Field id="supervisorId" label="Atasan langsung" error={fields.supervisorId} hint="Menerima pengajuan cuti/izin tingkat pertama." className="md:col-span-3">
            <NativeSelect {...fieldProps('supervisorId', fields.supervisorId, true)} defaultValue={v('supervisorId')}><NativeSelectOption value="">Tidak ada</NativeSelectOption>{supervisors.filter((s) => s.id !== initial.id).map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.fullName}{s.position ? ` (${s.position})` : ''}</NativeSelectOption>)}</NativeSelect>
          </Field>
          {f('position', 'Jabatan', { className: 'md:col-span-3', max: 150 })}
          {f('rank', 'Pangkat/golongan', { className: 'md:col-span-1', max: 50 })}
          {f('employmentStatus', 'Status kepegawaian', { className: 'md:col-span-2', list: 'status-list', hint: 'Mis. PNS, PPPK, Honorer (sesuai instansi).', max: 50 })}
          <datalist id="status-list">{statuses.map((s) => <option key={s} value={s} />)}</datalist>
          {f('startDate', 'Tanggal mulai bekerja', { type: 'date', className: 'md:col-span-2' })}
          {f('machinePin', 'ID mesin absensi', { className: 'md:col-span-2', hint: 'ID pengguna di mesin fingerprint/face terminal.', max: 30 })}
          {editing && (
            <>
              {f('effectiveDate', 'Tanggal efektif perubahan', { type: 'date', className: 'md:col-span-2', hint: 'Kosong = hari ini. Dipakai bila jabatan atau unit berubah.' })}
              <Field id="changeNote" label="Keterangan perubahan" error={fields.changeNote} className="md:col-span-6"><Input {...fieldProps('changeNote', fields.changeNote)} placeholder="Mis. SK mutasi nomor ..." maxLength={300} /></Field>
            </>
          )}
          {!editing && (
            <div className="flex items-start gap-3 md:col-span-6">
              <Checkbox id="createAccount" name="createAccount" defaultChecked />
              <Label htmlFor="createAccount" className="leading-snug font-normal">Buat akun login (username = NIP, password awal = NIP, wajib diganti saat masuk pertama)</Label>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? 'Menyimpan...' : editing ? 'Simpan perubahan' : 'Tambah pegawai'}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Batal</Button>
      </div>
    </form>
  );
}
