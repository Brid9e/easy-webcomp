import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'

export const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

export default defineConfig({
  title: 'CTC Web Components',
  description: '用 Vue 3 或 React 写业务组件，构建管线输出统一形态的 Web Component',
  srcExclude: ['superpowers/**'],
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
  },
  themeConfig: {
    nav: [],
  },
})
