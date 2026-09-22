import type { EwElementConstructor } from './types'

const registered = new Map<string, EwElementConstructor>()

export function registerElement(
  tag: string,
  ctor: EwElementConstructor,
): EwElementConstructor {
  const cached = registered.get(tag)
  if (cached) {
    if (cached !== ctor) {
      console.warn(`[ew] <${tag}> 已在本运行时注册过，忽略重复注册并复用已有构造器。`)
    }
    return cached
  }

  const existing = customElements.get(tag) as EwElementConstructor | undefined
  if (existing) {
    console.warn(`[ew] <${tag}> 已被其他代码注册，复用已有构造器。`)
    registered.set(tag, existing)
    return existing
  }

  customElements.define(tag, ctor)
  registered.set(tag, ctor)
  return ctor
}

/** 仅供测试使用，清空本运行时的注册缓存 */
export function resetRegistry(): void {
  registered.clear()
}
