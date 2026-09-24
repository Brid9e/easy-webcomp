/**
 * 运行时全局配置：槽位与读写。
 *
 * **状态落在 globalThis 上，不是模块级变量。** @ew/runtime 被内联进每一份产物 ——
 * CDN 的单组件、CDN 的空间入口、ESM、framework 各含一份 —— 一个页面里同时引 CDN 的
 * my-list 与 ESM 的 demo，就是两份互不相识的运行时。模块级变量在这些副本之间不通，
 * 全局槽是唯一能让它们共读共写的位置。
 *
 * 槽名用字符串而不是 Symbol：devtools 里要看得见，排查时能直接敲出来。
 */

export interface EwConfig {
  baseURL?: string
  timeout?: number
  headers?: Record<string, string>
}

/** 与 globalThis 取交集：直接断言成一个光秃秃的形状，TS 会嫌两边不重叠 */
type EwConfigGlobal = typeof globalThis & { __ew_config__?: EwConfig }

function store(): EwConfig {
  const g = globalThis as EwConfigGlobal
  return (g.__ew_config__ ??= {})
}

/**
 * 顶层浅合并，返回合并后的快照。晚调也生效 —— 消费方是请求时读的。
 *
 * 逐个键写而不是遍历 patch 的键：`next[key] = patch[key]` 在 key 是联合类型时过不了
 * 类型检查（写入要求值同时满足三个键的值类型）。三行也更直白。
 *
 * `undefined` 的键不参与合并，所以没法用 `configure({ baseURL: undefined })` 清掉一项；
 * 要清就 `resetConfig()` 重来。
 */
export function configure(patch: EwConfig): EwConfig {
  const next = store()
  if (patch.baseURL !== undefined) next.baseURL = patch.baseURL
  if (patch.timeout !== undefined) next.timeout = patch.timeout
  if (patch.headers !== undefined) next.headers = patch.headers
  return getConfig()
}

/**
 * 返回副本，改它不影响存储。headers 是这里唯一的容器，所以要单独再拷一层 ——
 * 少了它，`getConfig().headers['x'] = 'y'` 会直接写进存储。
 */
export function getConfig(): EwConfig {
  const next = store()
  return next.headers === undefined
    ? { ...next }
    : { ...next, headers: { ...next.headers } }
}

/** 仅供测试使用，清空全局配置，照 resetRegistry / resetStyleCache 的先例 */
export function resetConfig(): void {
  delete (globalThis as EwConfigGlobal).__ew_config__
}
