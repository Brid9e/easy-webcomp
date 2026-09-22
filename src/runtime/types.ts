export type PropType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'function'

export interface PropDefinition {
  type: PropType
  /** 自定义 attribute 名；默认由属性名 camelCase 转 kebab-case */
  attr?: string
  default?: unknown
}

export interface ComponentMeta {
  /** 自定义元素标签名，必须包含连字符 */
  tag: string
  /** 是否使用 Shadow DOM，默认 true */
  shadow?: boolean
  props?: Record<string, PropDefinition>
  /** 允许派发的事件名，派发时会被加上 ew- 前缀 */
  events?: string[]
}

export interface ElementAdapter {
  mount(
    host: HTMLElement | ShadowRoot,
    props: Record<string, unknown>,
    emit: (name: string, detail: unknown) => void,
  ): unknown
  update(instance: unknown, props: Record<string, unknown>): void
  unmount(instance: unknown): void
}

/** 构造器上额外挂了 refresh()，供 HMR 与文档站交互面板强制重渲染 */
export interface EwElementConstructor extends CustomElementConstructor {
  refresh: () => void
}

export function defineComponentMeta(meta: ComponentMeta): ComponentMeta {
  return meta
}
