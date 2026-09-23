import { expect, test } from '@playwright/test'

// 框架产物的 fixture 要一台能解析裸说明符的服务器（见 fixture 里的注释），所以走 5275 那台
// root 指向仓库根的 Vite，而不是全局 baseURL（4173 的静态服务器）。与 5274 一样是异源，写绝对地址。
const FRAMEWORK_URL = 'http://localhost:5275/tests/e2e/fixture/framework.html'

test.beforeEach(async ({ page }) => {
  await page.goto(FRAMEWORK_URL)
})

test('框架产物在真实浏览器里挂载出宿主 div 与组件内容', async ({ page }) => {
  await expect(page.locator('#root .ew-hello-vue-host')).toHaveCount(1)
  await expect(page.locator('#root button')).toHaveText('Vue 组件：浏览器 × 2')
})

test('@select 走原生 v-on，onSelect 收到 detail', async ({ page }) => {
  await page.locator('#root button').click()
  await expect(page.locator('#log')).toHaveText('{"source":"hello-vue","name":"浏览器"}')
})

test('样式注入到 head，且没有留下 :host', async ({ page }) => {
  const style = await page.evaluate(() => {
    const el = document.querySelector('style[data-ew-style]')
    return el === null ? null : (el.textContent ?? '')
  })
  expect(style).not.toBeNull()
  expect(style).toContain('.ew-hello-vue-host')
  expect(style).not.toContain(':host')
})
