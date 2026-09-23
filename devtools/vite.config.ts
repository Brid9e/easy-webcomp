import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { wcModePlugin } from './shared/wc-mode'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const workspacesDir = resolve(root, 'packages/workspaces')

export default defineConfig({
  // devtools/ 里没有 package.json，Vite 会一路往上找缓存目录，最后落在**仓库根**的
  // node_modules/.vite —— 而那正是 e2e 里 5275 那台 `vite .`（root 是仓库根、配置完全不同）
  // 用的同一个目录。两台并行启动的 dev server 共用一个依赖预构建缓存，谁的 hash 被对方
  // 覆盖了，谁手里那批 `?v=<旧 hash>` 的模块 URL 就当场 504，页面白屏（Outdated Optimize Dep）。
  // 各用各的缓存目录，撞车就没有了。
  cacheDir: resolve(root, 'node_modules/.vite-devtools'),
  resolve: {
    alias: {
      '@src': resolve(root, 'src'),
      '@packages': resolve(root, 'packages'),
      '@devtools': resolve(root, 'devtools/shared'),
    },
  },
  // 让组件里的 `@use '<空间>/styles'`（而不是相对路径）能解析。
  // 只写 loadPaths：这里跑的是 Vite 7，现代 Sass API 只认这一个键。
  // docs/.vitepress/config.mts 另写 includePaths —— VitePress 内嵌 Vite 5，走的是旧 API，也只认那个。
  css: {
    preprocessorOptions: {
      scss: { loadPaths: [workspacesDir] },
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
