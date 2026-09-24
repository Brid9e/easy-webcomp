import { existsSync, writeFileSync } from 'node:fs'

/** 相对仓库根的位置，vite.config.ts 与 .gitignore 两处都按它对齐 */
export const LOCAL_CONFIG_PATH = 'devtools/config.local.ts'

/**
 * 调试页连哪个后端，每人不一样，所以这份文件不进 git（.gitignore 里那条）。
 * 空模板只讲怎么填，不预置任何地址 —— 预置一个就等于替所有人猜，猜错是整站 404。
 */
const TEMPLATE = `import type { EwConfig } from '@ew/runtime/config'

/**
 * 本机专用的调试页配置，不进 git —— 每人连自己的后端，互不干扰。
 *
 * 首次 pnpm dev 生成这份空模板，填完刷新页面即生效。例如：
 *
 *   export default {
 *     baseURL: 'https://your-backend/admin-api',
 *     auth: { method: 'SELF_MONITOR_TOKEN' },
 *   } satisfies Partial<EwConfig>
 *
 * 不填即组件里的兜底：/ 与 15 秒、不带鉴权头。
 *
 * auth.secret 不给走 DEFAULT_SECRET，得与宿主那份 VITE_APP_STORE_SECURE_KEY 一致才解得开；
 * 而调试页读的是本机 localStorage（localhost:5273 这个 origin），所以还得把真系统里那条
 * *-core-access 的值手工 setItem 过来，解析才命中得了。解不出来不阻断请求，只是这一次不带
 * 鉴权头，后端回 401 —— 与压根没配鉴权表现一致。
 */
export default {} satisfies Partial<EwConfig>
`

/**
 * 不存在就落一份空模板，**存在就一个字都不动** —— 那份文件是开发者填过的本机地址，
 * 覆盖它等于把人家的配置删了。
 */
export function ensureLocalConfig(file: string): void {
  if (existsSync(file)) return
  writeFileSync(file, TEMPLATE)
}
