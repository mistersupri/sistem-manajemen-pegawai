// Arsitektur adapter perangkat. Setiap merek/protokol diimplementasikan sebagai adapter
// terpisah; layanan sinkronisasi hanya bergantung pada interface ini.
import type { ParsedScan, ParsedUser } from './parsers';

export interface DeviceConfig {
  id: string;
  name: string;
  host: string | null;
  port: number | null;
  secret: string | null; // sudah didekripsi; tidak pernah dikirim ke browser
  timeoutMs: number;
  serialNumber: string | null;
  // Konteks tambahan untuk adapter mock (PIN yang dikenal sistem).
  knownPins?: string[];
}

export interface FetchResult {
  scans: ParsedScan[];
  users: ParsedUser[];
  cursorAfter: string | null; // penanda posisi terakhir (mis. waktu scan terbaru)
  deviceClock?: string | null; // jam perangkat 'YYYY-MM-DD HH:MM:SS' bila tersedia
}

export interface DeviceAdapter {
  id: string;
  label: string;
  // SIAP = sudah diuji dengan perangkat fisik; BELUM_DIUJI = konektor ada tetapi belum diuji
  // dengan perangkat fisik di instansi; MOCK = simulasi untuk pengembangan dan demo.
  maturity: 'SIAP' | 'BELUM_DIUJI' | 'MOCK';
  connection: 'LAN' | 'USB' | 'API';
  pull: boolean; // bisa ditarik dari server; false = data masuk lewat impor berkas
  note: string;
  testConnection?(cfg: DeviceConfig): Promise<{ ok: boolean; message: string; deviceClock?: string | null }>;
  fetch?(cfg: DeviceConfig, cursor: string | null): Promise<FetchResult>;
}

export class DeviceError extends Error {
  constructor(message: string, public retryable = true) {
    super(message);
  }
}
