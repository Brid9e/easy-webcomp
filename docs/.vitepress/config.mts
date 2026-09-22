import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitepress'
import { wcModePlugin } from './plugins/wc-mode'

export const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

export default defineConfig({
  title: 'CTC Web Components',
  description: '用 Vue 3 或 React 写业务组件，构建管线输出统一形态的 Web Component',
  srcExclude: ['superpowers/**'],
  head: [
    [
      'link',
      {
        rel: 'icon',
        href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%231677ff'/%3E%3C/svg%3E",
      },
    ],
  ],
  vue: {
    template: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('ctc-'),
      },
    },
  },
  vite: {
    resolve: {
      alias: { '@src': resolve(rootDir, 'src') },
    },
    plugins: [wcModePlugin(resolve(rootDir, 'src/components')), react()],
  },
  themeConfig: {
    nav: [],
  },
})
