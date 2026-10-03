import type { DeviceAdapter } from './adapter';
import { mockAdapter } from './mock';
import { fileImportAdapter, solutionSoapAdapter } from './solution-soap';

// Daftar adapter yang tersedia. Konektor vendor baru ditambahkan di sini setelah spesifikasi
// (merek, model, protokol, contoh data) diterima dan diuji dengan perangkat fisik.
export const ADAPTERS: Record<string, DeviceAdapter> = {
  [mockAdapter.id]: mockAdapter,
  [solutionSoapAdapter.id]: solutionSoapAdapter,
  [fileImportAdapter.id]: fileImportAdapter,
};

export const adapterFor = (id: string) => ADAPTERS[id] ?? null;

/** Info adapter yang aman dikirim ke browser. */
export const adapterList = () => Object.values(ADAPTERS).map((a) => ({ id: a.id, label: a.label, maturity: a.maturity, connection: a.connection, pull: a.pull, note: a.note }));
