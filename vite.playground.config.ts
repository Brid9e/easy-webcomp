import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { wcModePlugin } from './docs/.vitepress/plugins/wc-mode'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: resolve(rootDir, 'playground'),
  resolve: {
    alias: {
      vue: 'vue/dist/vue.runtime.esm-bundler.js',
    },
  },
  plugins: [
    wcModePlugin(resolve(rootDir, 'src/components')),
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('ctc-'),
        },
      },
    }),
    react(),
  ],
  server: {
    port: 5273,
    open: false,
  },
})
