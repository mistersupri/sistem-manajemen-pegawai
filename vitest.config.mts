import { defineConfig } from 'vitest/config';
import path from 'node:path';

const alias = { '@': path.resolve(import.meta.dirname, 'src') };

// Unit test tidak butuh database; integration test memakai database uji terpisah (TEST_DATABASE_URL).
export default defineConfig({
  resolve: { alias },
  test: {
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    projects: [
      { resolve: { alias }, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], setupFiles: ['tests/setup-env.ts'] } },
      {
        resolve: { alias },
        test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], setupFiles: ['tests/setup-env.ts'], globalSetup: ['tests/global-setup.ts'], fileParallelism: false, testTimeout: 30000, hookTimeout: 60000 },
      },
    ],
  },
});
