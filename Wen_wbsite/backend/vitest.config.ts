import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    env: {
      DATABASE_URL: 'file:/tmp/wenxin-auth-test.db',
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-at-least-32-characters',
      JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-different-and-long',
      AUTH_COOKIE_SECURE: 'false',
      NODE_ENV: 'test',
    },
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
