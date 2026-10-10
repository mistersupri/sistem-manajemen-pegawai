import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetCaptchaForTest, issueCaptcha, newCaptcha, verifyCaptcha } from '@/lib/captcha';

beforeEach(() => _resetCaptchaForTest());

describe('captcha masuk', () => {
  it('jawaban benar diterima, huruf kecil dan spasi diabaikan', () => {
    const c = issueCaptcha('AB7KQ');
    expect(() => verifyCaptcha(c.token, ' ab7kq ')).not.toThrow();
  });
  it('jawaban salah ditolak dan token tidak bisa dicoba lagi', () => {
    const c = issueCaptcha('AB7KQ');
    expect(() => verifyCaptcha(c.token, 'XXXXX')).toThrow(/salah/);
    expect(() => verifyCaptcha(c.token, 'AB7KQ')).toThrow(/sudah dipakai/);
  });
  it('token sekali pakai walau jawabannya benar', () => {
    const c = issueCaptcha('ZZ22Z');
    verifyCaptcha(c.token, 'ZZ22Z');
    expect(() => verifyCaptcha(c.token, 'ZZ22Z')).toThrow(/sudah dipakai/);
  });
  it('token yang diubah atau kosong ditolak', () => {
    const c = issueCaptcha('AB7KQ');
    expect(() => verifyCaptcha(c.token.replace(/.$/, 'x'), 'AB7KQ')).toThrow(/tidak valid/);
    expect(() => verifyCaptcha('', 'AB7KQ')).toThrow();
    expect(() => verifyCaptcha(c.token, '')).toThrow(/Isi kode/);
  });
  it('kedaluwarsa setelah 3 menit', () => {
    vi.useFakeTimers();
    const c = issueCaptcha('AB7KQ');
    vi.advanceTimersByTime(3 * 60_000 + 1);
    expect(() => verifyCaptcha(c.token, 'AB7KQ')).toThrow(/kedaluwarsa/);
    vi.useRealTimers();
  });
  it('gambar berupa SVG dan tidak memuat kodenya sebagai teks token', () => {
    const c = newCaptcha();
    expect(c.image.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(c.token.split('.')).toHaveLength(4);
  });
});
