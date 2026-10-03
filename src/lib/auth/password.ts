import bcrypt from 'bcryptjs';

const ROUNDS = 12;
export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function passwordProblem(plain: string, username?: string): string | null {
  if (plain.length < 8) return 'Password minimal 8 karakter.';
  if (!/[A-Za-z]/.test(plain) || !/\d/.test(plain)) return 'Password harus berisi huruf dan angka.';
  if (username && plain.toLowerCase().includes(username.toLowerCase())) return 'Password tidak boleh memuat username.';
  return null;
}
