import { expect, test } from '@playwright/test'

const FIXTURE = '/tests/e2e/fixture/config.html'

/**
 * 一次页面里两份互不相识的运行时副本：CDN 那份（<script> 挂的 window.ewConfig）
 * 与 ESM 那份（动态 import 的 dist/demo/esm/config.js）。@ew/runtime 被内联进每一份产物，
 * 模块级变量在副本之间不通 —— 配置的状态必须落在 globalThis 的同一个槽上，这条就是证据。
 */
test('全局配置：CDN 那份写、ESM 那份读，读到同一个值', async ({ page }) => {
  await page.goto(FIXTURE)

  const wrote = await page.evaluate(() => {
    const ewConfig = (window as unknown as { ewConfig?: unknown }).ewConfig
    if (typeof ewConfig !== 'function') return false
    ;(ewConfig as (patch: unknown) => unknown)({
      baseURL: 'https://api.example.com',
      timeout: 3_000,
    })
    return true
  })
  expect(wrote).toBe(true)

  const read = await page.evaluate(async () => {
    // 说明符写成变量：字符串字面量的动态 import 会被 tsc 当成本地路径去解析，这里要的是
    // 浏览器按 URL 去取 —— 那条路正是消费方的真实处境。
    const url = '/dist/demo/esm/config.js'
    const mod = (await import(url)) as { getConfig: () => unknown }
    return mod.getConfig()
  })

  expect(read).toEqual({ baseURL: 'https://api.example.com', timeout: 3_000 })
})
