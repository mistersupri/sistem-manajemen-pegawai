export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) => new AppError(400, 'BAD_REQUEST', message, fields);
export const unauthorized = (message = 'Silakan masuk terlebih dahulu.') => new AppError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'Anda tidak memiliki izin untuk tindakan ini.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Data tidak ditemukan.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string, fields?: Record<string, string>) => new AppError(409, 'CONFLICT', message, fields);
export const unprocessable = (message: string, fields?: Record<string, string>) => new AppError(422, 'VALIDATION_ERROR', message, fields);
export const tooMany = (message = 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.') => new AppError(429, 'RATE_LIMITED', message);
