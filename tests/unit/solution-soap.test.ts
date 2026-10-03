// Adapter Solution X302 (Web Service iWsService) diuji terhadap server palsu yang meniru respons mesin.
// Data di sini fiktif.
import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { solutionSoapAdapter } from '@/lib/devices/solution-soap';
import type { DeviceConfig } from '@/lib/devices/adapter';

const LOGS = [
  ['101', '2026-09-28 07:21:05'], ['101', '2026-09-28 16:02:44'],
  ['102', '2026-09-29 07:40:00'], ['9', '2026-09-30 06:59:59'],
];
const USERS = [['101', 'Pegawai Uji Satu', ''], ['102', 'Pegawai Uji &amp; Dua', ''], ['3', 'Pakai PIN2', '9']];

function reply(body: string, method: string, key: string) {
  if (key !== '1234') return '<Response>Invalid ComKey</Response>';
  if (method === 'GetAttLog') return `<GetAttLogResponse>\r\n${LOGS.map(([p, t]) => `<Row><PIN>${p}</PIN><DateTime>${t}</DateTime><Verified>1</Verified><Status>0</Status><WorkCode>0</WorkCode></Row>`).join('\r\n')}\r\n</GetAttLogResponse>`;
  if (method === 'GetUserInfo') return `<GetUserInfoResponse>${USERS.map(([p, n, p2]) => `<Row><PIN>${p}</PIN><Name>${n}</Name><Password></Password><Group>1</Group><Privilege>0</Privilege><Card>0</Card><PIN2>${p2}</PIN2></Row>`).join('')}</GetUserInfoResponse>`;
  return body;
}

let server: net.Server;
let port = 0;
const requests: string[] = [];
beforeAll(async () => {
  server = net.createServer((sock) => {
    let data = '';
    sock.on('data', (d) => {
      data += d.toString();
      const end = data.indexOf('\r\n\r\n');
      if (end < 0) return;
      const len = Number(/Content-Length: (\d+)/i.exec(data)?.[1] ?? 0);
      if (data.length < end + 4 + len) return;
      requests.push(data);
      const method = /<(\w+)><ArgComKey/.exec(data)?.[1] ?? '';
      const key = /<ArgComKey[^>]*>([^<]*)</.exec(data)?.[1] ?? '';
      const out = reply('', method, key);
      // Firmware mesin sering mengirim header tidak standar dan memecah respons menjadi beberapa paket.
      sock.write('HTTP/1.0 200 OK\r\nServer: ZK Web Server\r\nContent-Type: text/xml\r\n\r\n');
      const half = Math.floor(out.length / 2);
      sock.write(out.slice(0, half));
      setTimeout(() => sock.end(out.slice(half)), 20);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as net.AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const cfg = (over: Partial<DeviceConfig> = {}): DeviceConfig => ({ id: 'x', name: 'X302 uji', host: '127.0.0.1', port, secret: '1234', timeoutMs: 2000, serialNumber: null, ...over });

describe('adapter Solution X302 (SOAP)', () => {
  it('uji koneksi membaca jumlah pengguna dan mengirim Comm Key', async () => {
    const r = await solutionSoapAdapter.testConnection!(cfg());
    expect(r).toMatchObject({ ok: true });
    expect(r.message).toContain('3 pengguna');
    expect(requests.at(-1)).toContain('POST /iWsService HTTP/1.0');
    expect(requests.at(-1)).toContain('<ArgComKey xsi:type="xsd:integer">1234</ArgComKey>');
  });

  it('menarik seluruh log beserta nama pengguna; PIN2 dipakai bila log memakai PIN2', async () => {
    const r = await solutionSoapAdapter.fetch!(cfg(), null);
    expect(r.scans).toHaveLength(4);
    expect(r.scans[0]).toMatchObject({ pin: '101', local: '2026-09-28 07:21:05', verifyMode: '1', statusCode: '0' });
    expect(r.cursorAfter).toBe('2026-09-30 06:59:59');
    expect(r.users.find((u) => u.pin === '102')?.name).toBe('Pegawai Uji & Dua');
    expect(r.users.find((u) => u.name === 'Pakai PIN2')?.pin).toBe('9');
  });

  it('dengan kursor, hanya log sejak tanggal kursor yang diambil (tumpang tindih aman karena dedup)', async () => {
    const r = await solutionSoapAdapter.fetch!(cfg(), '2026-09-29 07:40:00');
    expect(r.scans.map((s) => s.local)).toEqual(['2026-09-29 07:40:00', '2026-09-30 06:59:59']);
  });

  it('Comm Key salah: pesan jelas dan tidak dicoba ulang', async () => {
    const r = await solutionSoapAdapter.testConnection!(cfg({ secret: '0' }));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Comm Key');
    await expect(solutionSoapAdapter.fetch!(cfg({ secret: '0' }), null)).rejects.toMatchObject({ retryable: false });
  });

  it('mesin tidak bisa dihubungi: pesan menyebut alamat', async () => {
    const r = await solutionSoapAdapter.testConnection!(cfg({ port: 1 }));
    expect(r.ok).toBe(false);
    expect(r.message).toContain('127.0.0.1');
  });
});
