export interface WcModule {
  Element: CustomElementConstructor
  /**
   * 组件目录下可选的第 6 个文件 `mock.ts` 提供的；没有那个文件的组件这里是 undefined。
   * 可以是异步的 —— `mock.ts` 对 `./api` 用动态 import（它要在 Node 里也能被裸着 import）。
   */
  installMock?: () => void | Promise<void>
}

export interface RegisterWcElementOptions {
  /**
   * 用组件自带的假数据顶替真实请求。**只给文档站预览用**：它要的是一眼就看得懂的画面，
   * 不该依赖后端有没有数据、要不要鉴权。调试页不传，那里走真后端正是它的意义。
   */
  mock?: boolean

}

// 虚拟模块把全部组件打进一份，import 一次就够；两个预览页（调试页、文档站）共用这一份缓存
let pending: Promise<Record<string, WcModule>> | null = null

function loadAll(): Promise<Record<string, WcModule>> {
  pending ??= import('virtual:ew-wc-index').then(
    (mod) => mod.default as Record<string, WcModule>,
  )
  return pending
}

/** 注册自定义元素。已注册过就复用，define 同 tag 会直接抛错。 */
export async function registerWcElement(
  name: string,
  tag: string,
  options: RegisterWcElementOptions = {},
): Promise<void> {
  if (!tag) return
  const mod = (await loadAll())[name]
  if (!mod) return

  // 在 define 之前装：元素一进 DOM 就发第一次请求，装晚了那一次已经打到真后端上。
  // 装的是适配器而不是数据，重复调用无害（installMock 自己带一次性开关）。
  if (options.mock) await mod.installMock?.()

  if (!customElements.get(tag)) customElements.define(tag, mod.Element)
}
