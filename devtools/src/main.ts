import { configure, type EwConfig } from '@ew/runtime/config'
import { createApp } from 'vue'
import '@src/tokens/tokens.css'
import App from './App.vue'
import './shell.css'

// 直连真后端，连哪个由本机说了算：地址写在 devtools/config.local.ts，那份文件不进 git，
// 首次 `pnpm dev` 生成（见 devtools/shared/local-config.ts）。组件走的是同一个 axios 实例
// ⇒ 这一层同时管住了列表与详情。
//
// 用 glob 而不是静态 import：那份文件可能还不存在，静态 import 会让 tsc 报「找不到模块」，
// 而 CI 上 typecheck 跑在任何一次 `pnpm dev` 之前。取不到就什么都不配，落回 `/` 与 15 秒。
const local = import.meta.glob<{ default: Partial<EwConfig> }>('../config.local.ts', { eager: true })
configure(local['../config.local.ts']?.default ?? {})

createApp(App).mount('#app')
