import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      vue: 'vue/dist/vue.runtime.esm-bundler.js',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/runtime/**/*.test.{ts,tsx}'],
    globals: false,
  },
})
