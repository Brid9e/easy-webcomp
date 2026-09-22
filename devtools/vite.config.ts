import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { wcModePlugin } from './shared/wc-mode'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const workspacesDir = resolve(root, 'src/workspaces')

export default defineConfig({
  resolve: {
    alias: {
      '@src': resolve(root, 'src'),
      '@devtools': resolve(root, 'devtools/shared'),
    },
  },
  // 与 docs/.vitepress/config.mts、scripts/build.ts 是同一份约定：组件里的 `@use '<空间>/styles'` 靠它解析。
  // 两个键都写 —— 根构建跑 Vite 7（现代 Sass API 认 loadPaths），VitePress 内嵌 Vite 5（旧 API 只认
  // includePaths），旧 API 收到 loadPaths 会当没看见。少写一条，那类管线的 .scss 就构建失败。
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: [workspacesDir],
        includePaths: [workspacesDir],
      },
    },
  },
  plugins: [
    // 少了它，Vue 会把 <ew-*> 当未知组件报警告，devtools 面板里的组件反而渲染不出来
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag: string) => tag.startsWith('ew-'),
        },
      },
    }),
    react(),
    tailwind(),
    wcModePlugin(workspacesDir),
  ],
  // strictPort：5173 被占时 `vitepress dev` 会静默顺延到 5174/5175，探默认端口就打到别人的旧服务上。
  // 调试页要的是「启动即报错」，不是「悄悄换个端口」。
  server: { port: 5273, strictPort: true },
})
