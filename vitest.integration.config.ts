import { defineConfig } from 'vitest/config'

/**
 * 第二份配置，只跑**构建后**的集成测试。
 *
 * 主配置（vitest.config.ts）的 include 不覆盖这里，且 verify 里 test 排在 build 之前 ——
 * 这些用例 import 的是 dist/framework/*.js，构建没跑过它们必然失败。所以用独立配置 +
 * 独立的 npm script，把它钉在 build 之后。
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/integration/**/*.test.{ts,tsx}'],
    globals: false,
  },
})
