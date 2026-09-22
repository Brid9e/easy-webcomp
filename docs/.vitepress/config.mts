import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitepress'
import { wcModePlugin } from './plugins/wc-mode'
import { listWorkspaces, readWorkspaceMeta } from './workspaces'

export const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

// 空间名取清单里的 title，读不到就回落目录名
async function buildWorkspaceSidebar() {
  return Promise.all(
    listWorkspaces().map(async (ws) => ({
      text: (await readWorkspaceMeta(ws.id)).title ?? ws.id,
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
    resolve: {
      alias: { '@src': resolve(rootDir, 'src') },
    },
    plugins: [wcModePlugin(resolve(rootDir, 'src/workspaces')), react()],
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
            { text: '构建与产物', link: '/guide/build' },
          ],
        },
      ],
      '/workspaces/': [{ text: '组件', items: await buildWorkspaceSidebar() }],
    },
  },
}))
