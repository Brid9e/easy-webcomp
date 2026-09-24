import { configure } from '@ew/runtime/config'
import { createApp } from 'vue'
import '@src/tokens/tokens.css'
import App from './App.vue'
import './shell.css'

// 调试页直连真后端。devtools 只是开发用的壳，不进产物，所以地址写死在这儿没关系 ——
// 组件里的兜底 `/api` 是给宿主用的，调试页不满足那个前提。
// 组件走的是同一个 axios 实例 ⇒ 这一行同时管住了列表与详情。
//
// secret 不给：走 DEFAULT_SECRET。它得与宿主那份 VITE_APP_STORE_SECURE_KEY 一致才能解开，
// 而调试页读的是自己的 localStorage（localhost:5273 这个 origin），
// 所以还得把真系统里那条 `*-core-access` 的值手工 setItem 过来，解析才命中得了。
configure({
  baseURL: 'https://jkzx.envsc.cn/zxjcjg-api/admin-api',
  auth: { method: 'SELF_MONITOR_TOKEN' },
})

createApp(App).mount('#app')
