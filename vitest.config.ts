import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      vue: 'vue/dist/vue.runtime.esm-bundler.js',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    // tests/integration 只用 vitest.integration.config.ts 跑：它 import 的是构建产物，
    // 排在 build 之前必然失败。
    exclude: ['**/node_modules/**', 'tests/integration/**'],
    globals: false,
  },
})
