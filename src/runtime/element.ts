import { attrNameFor, coerceAttr, isAttributeChannel } from './props'
import { applyStyles } from './style'
import type { ComponentMeta, CtcElementConstructor, ElementAdapter } from './types'

export function createElementClass(
  meta: ComponentMeta,
  adapter: ElementAdapter,
  css: string,
): CtcElementConstructor {
  const propEntries = Object.entries(meta.props ?? {})
  const eventNames = new Set(meta.events ?? [])
  const useShadowDefault = meta.shadow ?? true

  const liveInstances = new Set<CtcElement>()

  class CtcElement extends HTMLElement {
    static get observedAttributes(): string[] {
      return propEntries
        .filter(([, def]) => isAttributeChannel(def.type))
        .map(([name, def]) => attrNameFor(name, def))
    }

    private _props: Record<string, unknown> = {}
    private _instance: unknown = null

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
      if (this._instance !== null) return

      for (const [name, def] of propEntries) {
        if (!isAttributeChannel(def.type)) continue
        const attr = attrNameFor(name, def)
        if (this.hasAttribute(attr)) {
          this._props[name] = coerceAttr(this.getAttribute(attr), def.type)
        }
      }

      const useShadow = useShadowDefault && !this.hasAttribute('disable-shadow')
      const root: HTMLElement | ShadowRoot = useShadow
        ? this.attachShadow({ mode: 'open' })
        : this
      applyStyles(root, css)

      this._instance = adapter.mount(root, { ...this._props }, this._emit)
      liveInstances.add(this)
    }

    disconnectedCallback(): void {
      liveInstances.delete(this)
      if (this._instance === null) return
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
          `[ctc] <${meta.tag}> 派发了未在 meta.events 中声明的事件 "${name}"。`,
        )
      }
      this.dispatchEvent(
        new CustomEvent(`ctc-${name}`, { detail, bubbles: true, composed: true }),
      )
    }
  }

  const ctor = CtcElement as unknown as CtcElementConstructor
  ctor.refresh = () => {
    for (const el of liveInstances) el.refresh()
  }
  return ctor
}
