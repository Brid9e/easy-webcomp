export type EmitFn = (name: string, detail?: unknown) => void

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
    emit: EmitFn,
  ): unknown
  update(instance: unknown, props: Record<string, unknown>): void
  unmount(instance: unknown): void
  /**
   * 元素被移出文档但选择保状态（keep-alive）时通知组件。
   *
   * 可选：不实现不会让元素失效，只是组件收不到激活信号 —— 状态照样保住。
   */
  setActive?(instance: unknown, active: boolean): void
}

/** 构造器上额外挂了 refresh() */
export interface EwElementConstructor extends CustomElementConstructor {
  /** 供 HMR 与文档站交互面板强制重渲染 */
  refresh: () => void
}

export function defineComponentMeta(meta: ComponentMeta): ComponentMeta {
  return meta
}
