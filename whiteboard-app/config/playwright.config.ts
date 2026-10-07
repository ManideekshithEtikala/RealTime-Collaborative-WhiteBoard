import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3500';
export default defineConfig({
  testDir: '../tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'node ../backend/server.js',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { NODE_ENV: 'production', PORT: '3500', DATA_DIR: '../backend/data/e2e' },
  },
});
