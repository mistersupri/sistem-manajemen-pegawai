// Provider pencocokan wajah. Implementasi bawaan memakai descriptor 128 dimensi dari
// face-api.js (dihitung di browser dengan model yang disajikan server sendiri) dan jarak
// Euclidean di server. Provider lain (mis. ONNX Runtime di server) cukup memenuhi interface ini.

export interface FaceMatcher {
  readonly model: string; // dicatat di template agar template beda model tidak dicampur
  readonly dimensions: number;
  distance(a: number[], b: number[]): number;
}

export const faceApiEuclidean: FaceMatcher = {
  model: 'face-api.js/faceRecognitionNet-128',
  dimensions: 128,
  distance(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
    return Math.sqrt(s);
  },
};

export const activeMatcher = (): FaceMatcher => faceApiEuclidean;

export function parseDescriptor(input: unknown, m: FaceMatcher = activeMatcher()): number[] | null {
  if (!Array.isArray(input) || input.length !== m.dimensions) return null;
  const arr = input.map(Number);
  return arr.every((x) => Number.isFinite(x) && Math.abs(x) < 10) ? arr : null;
}

export function bestDistance(templates: number[][], probe: number[], m: FaceMatcher = activeMatcher()) {
  let best = Infinity;
  for (const t of templates) best = Math.min(best, m.distance(t, probe));
  return best;
}

/** Skor kemiripan 0-100 hanya untuk tampilan; keputusan memakai jarak dan ambang. */
export const similarity = (distance: number | null) => (distance == null || !Number.isFinite(distance) ? null : Math.max(0, Math.round((1 - distance) * 100)));

// Pemeriksaan kualitas yang dilaporkan klien (skor deteksi, ukuran wajah, kecerahan).
export interface QualityReport {
  score: number;
  faceWidthPx: number;
  brightness?: number;
}

export function qualityProblem(q: QualityReport | undefined, minScore: number, minSize: number): string | null {
  if (!q || !Number.isFinite(q.score) || !Number.isFinite(q.faceWidthPx)) return 'Data kualitas gambar tidak lengkap.';
  if (q.score < minScore) return 'Wajah kurang jelas. Hadapkan wajah lurus ke kamera.';
  if (q.faceWidthPx < minSize) return 'Wajah terlalu jauh dari kamera. Dekatkan wajah.';
  if (q.brightness != null && q.brightness < 40) return 'Pencahayaan terlalu gelap.';
  if (q.brightness != null && q.brightness > 225) return 'Pencahayaan terlalu terang atau silau.';
  return null;
}
