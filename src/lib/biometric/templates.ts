import { prisma } from '../db';
import { decrypt, encrypt } from '../crypto';

// Template disimpan terenkripsi: { model, descriptors: number[][] }.
export function sealTemplate(model: string, descriptors: number[][]) {
  return encrypt(JSON.stringify({ model, descriptors }));
}

export function openTemplate(enc: string): { model: string; descriptors: number[][] } {
  return JSON.parse(decrypt(enc));
}

// Cache template aktif yang sudah didekripsi (di memori proses), divalidasi dengan updatedAt.
const cache = new Map<string, { updatedAt: number; employeeId: string; model: string; descriptors: number[][] }>();

export async function activeTemplates(employeeIds?: string[]) {
  const rows = await prisma.employeeBiometric.findMany({
    where: { status: 'ACTIVE', modality: 'FACE', ...(employeeIds ? { employeeId: { in: employeeIds } } : {}), employee: { isActive: true, deletedAt: null } },
    select: { id: true, employeeId: true, updatedAt: true, templateEnc: true, model: true },
  });
  const out = [];
  for (const r of rows) {
    let c = cache.get(r.id);
    if (!c || c.updatedAt !== r.updatedAt.getTime()) {
      const t = openTemplate(r.templateEnc);
      c = { updatedAt: r.updatedAt.getTime(), employeeId: r.employeeId, model: t.model, descriptors: t.descriptors };
      cache.set(r.id, c);
    }
    out.push(c);
  }
  return out;
}

export function forgetTemplate(id: string) {
  cache.delete(id);
}
