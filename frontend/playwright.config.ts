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
    baseURL: 'http://localhost:3500',
    trace: 'on-first-retry',
  },
  webServer: {
    command: process.env.CI ? 'PORT=3500 node .next/standalone/server.js' : 'npm run dev',
    url: 'http://localhost:3500',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
