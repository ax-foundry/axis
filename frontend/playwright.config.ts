import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.CI ? 'http://127.0.0.1:3500' : 'http://localhost:3500',
    trace: 'on-first-retry',
  },
  webServer: {
    command: process.env.CI ? 'HOSTNAME=127.0.0.1 PORT=3500 node .next/standalone/server.js 2>&1' : 'npm run dev',
    url: process.env.CI ? 'http://127.0.0.1:3500' : 'http://localhost:3500',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
