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
  webServer: [
    {
      command: 'node tests/e2e/server.mjs',
      url: 'http://localhost:4173/tests/e2e/fixture/index.html',
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
    },
    {
      // 调试页单独占 5274：不与开发者开着的 pnpm dev（5273）打架，verify 因此不必先关 dev。
      // reuseExistingServer 必须为 false —— 复用任何残留进程都会把「假红」重新引进来，
      // 而 strictPort 会把「端口被占」变成起服务时的硬报错，不会退化成静默换端口。
      command: 'pnpm exec vite devtools --port 5274 --strictPort',
      url: 'http://localhost:5274/',
      reuseExistingServer: false,
      stdout: 'ignore',
    },
  ],
})
