// Pembaca file Excel 97-2003 (.xls / BIFF8) minimal, cukup untuk membaca nilai sel
// dari laporan ekspor mesin absensi. Tanpa modul native.
const CFB = require('cfb');

function readUnicodeString(buf, pos, lenBytes, continues) {
  // Membaca XLUnicodeString yang bisa terpotong oleh record CONTINUE.
  // continues: daftar offset awal tiap record CONTINUE di dalam buf gabungan.
  let cch = lenBytes === 1 ? buf[pos] : buf.readUInt16LE(pos);
  pos += lenBytes;
  let flags = buf[pos++];
  let rt = 0;
  let sz = 0;
  if (flags & 0x08) { rt = buf.readUInt16LE(pos); pos += 2; }
  if (flags & 0x04) { sz = buf.readInt32LE(pos); pos += 4; }
  let out = '';
  while (cch > 0) {
    const nextBoundary = continues.find((b) => b > pos) ?? buf.length;
    const wide = flags & 0x01;
    const avail = Math.floor((nextBoundary - pos) / (wide ? 2 : 1));
    const take = Math.min(cch, avail);
    out += wide ? buf.toString('utf16le', pos, pos + take * 2) : buf.toString('latin1', pos, pos + take);
    pos += take * (wide ? 2 : 1);
    cch -= take;
    if (cch > 0) flags = buf[pos++]; // awal CONTINUE: byte flag baru
  }
  pos += rt * 4 + sz;
  return { str: out, pos };
}

function rkValue(rk) {
  let v;
  if (rk & 0x02) v = rk >> 2;
  else {
    const b = Buffer.alloc(8);
    b.writeInt32LE(rk & 0xfffffffc, 4);
    v = b.readDoubleLE(0);
  }
  return rk & 0x01 ? v / 100 : v;
}

/** Baca workbook .xls -> [{ name, rows: [[nilai,...], ...] }] */
function readXls(buffer) {
  const cfb = CFB.read(buffer, { type: 'buffer' });
  const entry = CFB.find(cfb, 'Workbook') || CFB.find(cfb, 'Book');
  if (!entry) throw new Error('File bukan Excel 97-2003 (.xls) yang valid.');
  const data = Buffer.from(entry.content);

  // Kumpulkan record
  const records = [];
  for (let p = 0; p + 4 <= data.length;) {
    const type = data.readUInt16LE(p);
    const len = data.readUInt16LE(p + 2);
    records.push({ type, pos: p, body: data.subarray(p + 4, p + 4 + len) });
    p += 4 + len;
  }

  const sheets = [];
  let sst = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.type === 0x0085) { // BOUNDSHEET
      const offset = r.body.readUInt32LE(0);
      const { str } = readUnicodeString(r.body, 6, 1, []);
      sheets.push({ name: str, offset, rows: [] });
    } else if (r.type === 0x00fc) { // SST + CONTINUE
      const parts = [r.body.subarray(8)];
      const bounds = [];
      let total = parts[0].length;
      while (records[i + 1] && records[i + 1].type === 0x003c) {
        i++;
        bounds.push(total);
        parts.push(records[i].body);
        total += records[i].body.length;
      }
      const buf = Buffer.concat(parts);
      const count = r.body.readUInt32LE(4);
      let pos = 0;
      for (let k = 0; k < count && pos < buf.length; k++) {
        const s = readUnicodeString(buf, pos, 2, bounds);
        sst.push(s.str);
        pos = s.pos;
      }
    }
  }

  const byOffset = new Map(sheets.map((s) => [s.offset, s]));
  let cur = null;
  let lastFormula = null;
  const set = (row, col, v) => {
    if (!cur) return;
    (cur.rows[row] = cur.rows[row] || [])[col] = v;
  };
  for (const r of records) {
    const b = r.body;
    switch (r.type) {
      case 0x0809: cur = byOffset.get(r.pos) || null; break; // BOF
      case 0x000a: cur = null; break; // EOF
      case 0x00fd: set(b.readUInt16LE(0), b.readUInt16LE(2), sst[b.readUInt32LE(6)] ?? ''); break; // LABELSST
      case 0x0204: set(b.readUInt16LE(0), b.readUInt16LE(2), readUnicodeString(b, 6, 2, []).str); break; // LABEL
      case 0x0203: set(b.readUInt16LE(0), b.readUInt16LE(2), b.readDoubleLE(6)); break; // NUMBER
      case 0x027e: set(b.readUInt16LE(0), b.readUInt16LE(2), rkValue(b.readInt32LE(6))); break; // RK
      case 0x00bd: { // MULRK
        const row = b.readUInt16LE(0);
        const first = b.readUInt16LE(2);
        const n = (b.length - 6) / 6;
        for (let k = 0; k < n; k++) set(row, first + k, rkValue(b.readInt32LE(4 + k * 6 + 2)));
        break;
      }
      case 0x0006: { // FORMULA
        const row = b.readUInt16LE(0);
        const col = b.readUInt16LE(2);
        if (b.readUInt16LE(12) === 0xffff) {
          if (b[6] === 0) lastFormula = { row, col }; // hasil string pada record STRING berikutnya
        } else set(row, col, b.readDoubleLE(6));
        break;
      }
      case 0x0207: // STRING
        if (lastFormula) { set(lastFormula.row, lastFormula.col, readUnicodeString(b, 0, 2, []).str); lastFormula = null; }
        break;
      default:
    }
  }
  return sheets.map((s) => ({
    name: s.name,
    rows: Array.from(s.rows, (row) => Array.from(row || [], (v) => (v === undefined ? '' : v))),
  }));
}

module.exports = { readXls };
