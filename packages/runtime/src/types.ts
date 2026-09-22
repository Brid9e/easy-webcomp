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
}

/** 构造器上额外挂了 refresh() 与 styles */
export interface EwElementConstructor extends CustomElementConstructor {
  /** 供 HMR 与文档站交互面板强制重渲染 */
  refresh: () => void
  /**
   * 建这个元素时传进来的整份 CSS（含 index.ts 里内联的 UI 库样式）。
   * 交给预览的源码模式取用 —— 那一路不经过 index.ts，否则拿不到库样式，
   * 组件在自己目录的 style.scss 之外就没有别的样式来源了。
   */
  styles: string
}

export function defineComponentMeta(meta: ComponentMeta): ComponentMeta {
  return meta
}
