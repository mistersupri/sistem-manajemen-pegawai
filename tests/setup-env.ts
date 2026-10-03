// Nilai environment untuk pengujian. Integration test memakai database terpisah (TEST_DATABASE_URL).
process.env.APP_SECRET ||= 'test-secret-0123456789abcdef0123456789';
process.env.BIOMETRIC_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:5433/simpeg_test';
process.env.STORAGE_DIR ||= './.test-storage';
process.env.DISABLE_SCHEDULER = '1';
