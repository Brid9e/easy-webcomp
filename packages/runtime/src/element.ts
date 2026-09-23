import { attrNameFor, coerceAttr, isAttributeChannel } from './props.ts'
import { applyStyles } from './style.ts'
import type { ComponentMeta, EwElementConstructor, ElementAdapter } from './types.ts'

export function createElementClass(
  meta: ComponentMeta,
  adapter: ElementAdapter,
  css: string,
): EwElementConstructor {
  const propEntries = Object.entries(meta.props ?? {})
  const eventNames = new Set(meta.events ?? [])
  const useShadowDefault = meta.shadow ?? true

  const liveInstances = new Set<EwElement>()

  class EwElement extends HTMLElement {
    static get observedAttributes(): string[] {
      return propEntries
        .filter(([, def]) => isAttributeChannel(def.type))
        .map(([name, def]) => attrNameFor(name, def))
    }

    private _props: Record<string, unknown> = {}
    private _instance: unknown = null
    private _styledRoot: HTMLElement | ShadowRoot | null = null

    constructor() {
      super()
      for (const [name, def] of propEntries) {
        if (def.default !== undefined) this._props[name] = def.default
        Object.defineProperty(this, name, {
          configurable: true,
          enumerable: true,
          get: () => this._props[name],
          set: (value: unknown) => this._setProp(name, value),
        })
      }
    }

    connectedCallback(): void {
      // 实例还在，说明上一轮断开时我们把它挂起了（keep-alive）—— 直接唤回来。
      // 重新 mount 会把内层那份状态扔掉，而这正是挂起要保的东西。
      if (this._instance !== null) {
        adapter.setActive?.(this._instance, true)
        return
      }

      for (const [name, def] of propEntries) {
        if (!isAttributeChannel(def.type)) continue
        const attr = attrNameFor(name, def)
        if (this.hasAttribute(attr)) {
          this._props[name] = coerceAttr(this.getAttribute(attr), def.type)
        }
      }

      // 元素被移出文档再放回来会走第二轮 connectedCallback（切页签、被宿主框架挪动、
      // v-if 重挂都会）。shadow root 这时已经存在，再 attachShadow 一次会抛
      // NotSupportedError 并从这里中断 —— 既不投样式也不 mount，元素永久空着。
      // 复用已有的那个；样式只认自己投过的那个 root，重复投会一直往
      // adoptedStyleSheets 上堆（每轮一份，无上限）。
      const useShadow = useShadowDefault && !this.hasAttribute('disable-shadow')
      const root: HTMLElement | ShadowRoot = useShadow
        ? (this.shadowRoot ?? this.attachShadow({ mode: 'open' }))
        : this
      if (this._styledRoot !== root) {
        applyStyles(root, css)
        this._styledRoot = root
      }

      this._instance = adapter.mount(root, { ...this._props }, this._emit)
      liveInstances.add(this)
    }

    disconnectedCallback(): void {
      liveInstances.delete(this)
      if (this._instance === null) return

      // keep-alive：宿主（Vue 的 KeepAlive、或任何「把 DOM 挪走而不是销毁」的容器）只是把
      // 元素移进了一个游离容器，元素会回来。这时不卸载 —— 一卸，内层 app 与它那份 pinia 就
      // 没了，回来是新实例、必然重新请求。改为通知组件失活，让它自己停掉隐藏期间的轮询。
      //
      // 代价：元素被真正销毁时（v-if 撤掉、缓存淘汰）DOM 是从游离容器里被摘走的，我们那时
      // 已经处于断开状态，收不到第二次信号，这份实例会一直挂着。所以这个属性默认不带。
      if (this.hasAttribute('keep-alive')) {
        adapter.setActive?.(this._instance, false)
        return
      }

      adapter.unmount(this._instance)
      this._instance = null
    }

    attributeChangedCallback(attr: string, _old: string | null, value: string | null): void {
      const entry = propEntries.find(([name, def]) => attrNameFor(name, def) === attr)
      if (!entry) return
      const [name, def] = entry
      this._setProp(name, value === null ? def.default : coerceAttr(value, def.type))
    }

    refresh(): void {
      if (this._instance === null) return
      adapter.update(this._instance, { ...this._props })
    }

    private _setProp(name: string, value: unknown): void {
      this._props[name] = value
      this.refresh()
    }

    private _emit = (name: string, detail: unknown): void => {
      if (!eventNames.has(name)) {
        console.warn(
          `[ew] <${meta.tag}> 派发了未在 meta.events 中声明的事件 "${name}"。`,
        )
      }
      this.dispatchEvent(
        new CustomEvent(`ew-${name}`, { detail, bubbles: true, composed: true }),
      )
    }
  }

  const ctor = EwElement as unknown as EwElementConstructor
  ctor.refresh = () => {
    for (const el of liveInstances) el.refresh()
  }
  return ctor
}
