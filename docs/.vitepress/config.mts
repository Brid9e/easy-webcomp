import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { defineConfig } from 'vitepress'
// 相对路径，不能用 @devtools 别名：VitePress 把本文件单独打成 esbuild 临时模块，
// 裸说明符一律 external 交给 Node 从 node_modules 解析 —— 既不认 tsconfig paths 也不认
// vite.resolve.alias（别名只作用于配置加载之后的内容构建），会 ERR_MODULE_NOT_FOUND。
// 下一行的 ./workspaces 同理。别名本身仍然要有，它服务内容构建期的 glob 与 @devtools/*。
import { wcModePlugin } from '../../devtools/shared/wc-mode'
import { listWorkspaces, readWorkspaceMeta } from './workspaces'

export const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

// 空间名取清单里的 title，读不到就回落目录名
//
// 每个空间带上 link 指向自己的 grid 页 —— 侧边栏因此是三层：总览 / 空间 / 组件，
// 三层都点得动。空间页是 index 路由（产物 workspaces/<id>/index.html），**结尾的斜杠不能省**：
// normalizeLink 只对以 `/` 结尾的链接不加 .html，少了它会拼成 workspaces/<id>.html，静态托管上 404。
async function buildWorkspaceSidebar() {
  return Promise.all(
    listWorkspaces().map(async (ws) => ({
      text: (await readWorkspaceMeta(ws.id)).title ?? ws.id,
      link: `/workspaces/${ws.id}/`,
      collapsed: false,
      items: ws.components.map((c) => ({
        text: c.name,
        link: `/workspaces/${ws.id}/${c.name}`,
      })),
    })),
  )
}

export default defineConfig(async () => ({
  title: 'easy-webcomp',
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
        isCustomElement: (tag: string) => tag.startsWith('ew-'),
      },
    },
  },
  vite: {
    // 5173 被占时 vitepress dev 会静默顺延到 5174/5175，探默认端口就打到别人的旧服务上 ——
    // 已经因此把「配置改了没生效」误判过一次。strictPort 把它变成启动即报错。
    server: { port: 5173, strictPort: true },
    resolve: {
      alias: {
        '@src': resolve(rootDir, 'src'),
        '@packages': resolve(rootDir, 'packages'),
        '@devtools': resolve(rootDir, 'devtools/shared'),
      },
    },
    // 组件样式里的 `@use '<空间>/styles'` 靠它解析，与 scripts/build.ts 的 cssConfig 是同一份约定。
    // 这里必须写 includePaths：VitePress 1.6 内嵌 Vite 5，走的是只认这个名字的旧 Sass API。
    // 同时也留着 loadPaths，好在将来 VitePress 升到 Vite 6+ 时不必回头找这行。
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: [resolve(rootDir, 'packages/workspaces')],
          includePaths: [resolve(rootDir, 'packages/workspaces')],
        },
      },
    },
    plugins: [wcModePlugin(resolve(rootDir, 'packages/workspaces')), react(), tailwind()],
  },
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/' },
      { text: '组件', link: '/workspaces/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速开始', link: '/guide/' },
            { text: '新增一个组件', link: '/guide/authoring' },
            { text: '主题与 token', link: '/guide/theming' },
            { text: '生命周期与状态保持', link: '/guide/lifecycle' },
            { text: '构建与产物', link: '/guide/build' },
            { text: '在 Vue / React 项目里使用', link: '/guide/framework-usage' },
          ],
        },
      ],
      // 顶层「组件」也带 link，指向空间总览页 /workspaces/（同一层级的指南侧边栏即此写法）
      '/workspaces/': [
        { text: '组件', link: '/workspaces/', items: await buildWorkspaceSidebar() },
      ],
    },
  },
}))
