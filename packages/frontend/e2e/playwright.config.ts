import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './flows',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  webServer: [
    {
      command: 'pnpm --filter @aww/backend dev',
      url: 'http://localhost:3000/health',
      reuseExistingServer: true,
      timeout: 30_000,
      env: {
        NODE_ENV: 'test',
        PORT: '3000',
      },
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
