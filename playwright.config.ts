import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  // 用系统 Chrome。本机 Playwright 自带 chromium 的下载源极慢（~2.5 MB/min / 182 MB），
  // 装不上。若要改用自带 chromium，先 `pnpm exec playwright install chromium`，再删掉 channel。
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: 'http://localhost:4173/tests/e2e/fixture/index.html',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
})
