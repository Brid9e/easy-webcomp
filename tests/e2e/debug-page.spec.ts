import { expect, test } from '@playwright/test'

// 调试页 dev server 在 5274（见 playwright.config.ts），与全局 baseURL（4173 的静态服务器）
// 不同源，所以这里写绝对地址。
const DEBUG_URL = 'http://localhost:5274/'

test('调试页：元素渲染进 shadow root、预设改宽', async ({ page }) => {
  await page.goto(DEBUG_URL)

  await page.locator('nav.picker button', { hasText: 'hello-vue' }).click()

  // 元素已升级，且内容渲染进 shadow root
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector('.stage-body ew-hello-vue')?.shadowRoot?.textContent ?? '',
      ),
    )
    .toContain('Vue 组件：World')

  // 预设 375 后，容器实测宽度就是 375
  await page.getByRole('button', { name: '375', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.round(document.querySelector('.stage-body')!.getBoundingClientRect().width),
      ),
    )
    .toBe(375)
})
