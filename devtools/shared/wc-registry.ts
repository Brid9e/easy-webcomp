export interface WcModule {
  Element: CustomElementConstructor
  /** index.ts 内联给桥接层的整份 CSS（含 UI 库），源码模式靠它补样式 */
  styles: string
}

// 虚拟模块把全部组件打进一份，import 一次就够；两个预览页（调试页、文档站）共用这一份缓存
let pending: Promise<Record<string, WcModule>> | null = null

function loadAll(): Promise<Record<string, WcModule>> {
  pending ??= import('virtual:ew-wc-index').then(
    (mod) => mod.default as Record<string, WcModule>,
  )
  return pending
}

/** 要组件的 styles，不要在 WC 模式才去载 —— 源码模式同样需要它。 */
export function loadWcModule(name: string): Promise<WcModule | undefined> {
  return loadAll().then((all) => all[name])
}

/** 注册自定义元素。已注册过就复用，define 同 tag 会直接抛错。 */
export async function registerWcElement(name: string, tag: string): Promise<void> {
  const mod = await loadWcModule(name)
  if (!mod || !tag) return
  if (!customElements.get(tag)) customElements.define(tag, mod.Element)
}
