import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  workers: 1,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'node --env-file=../backend/.env.test ../backend/src/server.js',
      url: 'http://127.0.0.1:5001/api/health',
      reuseExistingServer: false,
      timeout: 15000,
    },
    {
      command: 'npx vite preview --port 4173 --host 127.0.0.1',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 15000,
      env: {
        NODE_ENV: 'test',
        BACKEND_PORT: '5001',
      },
    },
  ],
});
