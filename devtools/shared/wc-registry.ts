export interface WcModule {
  Element: CustomElementConstructor
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
export async function registerWcElement(name: string, tag: string): Promise<void> {
  if (!tag) return
  const mod = (await loadAll())[name]
  if (!mod) return
  if (!customElements.get(tag)) customElements.define(tag, mod.Element)
}
