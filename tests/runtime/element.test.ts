import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElementClass } from '../../src/runtime/element'
import { resetRegistry } from '../../src/runtime/registry'
import { resetStyleCache } from '../../src/runtime/style'
import type { ComponentMeta, ElementAdapter } from '../../src/runtime/types'

interface StubInstance {
  host: HTMLElement | ShadowRoot
  props: Record<string, unknown>
  emit: (name: string, detail: unknown) => void
  updates: number
  unmounted: boolean
}

function stubAdapter(log: StubInstance[]): ElementAdapter {
  return {
    mount(host, props, emit) {
      const instance: StubInstance = { host, props, emit, updates: 0, unmounted: false }
      log.push(instance)
      return instance
    },
    update(instance, props) {
      const i = instance as StubInstance
      i.props = props
      i.updates += 1
    },
    unmount(instance) {
      ;(instance as StubInstance).unmounted = true
    },
  }
}

let log: StubInstance[] = []
let counter = 0

function uniqueTag(): string {
  counter += 1
  return `ew-el-test-${counter}`
}

function defineComponent(meta: ComponentMeta, css = '') {
  const tag = meta.tag
  const ctor = createElementClass(meta, stubAdapter(log), css)
  customElements.define(tag, ctor)
  return ctor
}

function mount(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

describe('createElementClass', () => {
  beforeEach(() => {
    log = []
    resetRegistry()
    resetStyleCache()
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('连接到文档时挂载，断开时卸载', () => {
    const tag = uniqueTag()
    defineComponent({ tag })
    const el = mount(tag)
    expect(log).toHaveLength(1)
    document.body.removeChild(el)
    expect(log[0]?.unmounted).toBe(true)
  })

  it('默认创建 shadow root', () => {
    const tag = uniqueTag()
    defineComponent({ tag })
    const el = mount(tag)
    expect(el.shadowRoot).not.toBeNull()
    expect(log[0]?.host).toBe(el.shadowRoot)
  })

  it('disable-shadow 属性降级到 light DOM', () => {
    const tag = uniqueTag()
    defineComponent({ tag })
    const el = mount(tag, { 'disable-shadow': '' })
    expect(el.shadowRoot).toBeNull()
    expect(log[0]?.host).toBe(el)
  })

  it('meta.shadow 为 false 时默认 light DOM', () => {
    const tag = uniqueTag()
    defineComponent({ tag, shadow: false })
    const el = mount(tag)
    expect(el.shadowRoot).toBeNull()
    expect(log[0]?.host).toBe(el)
  })

  it('CSS 被投递到 shadow root', () => {
    const tag = uniqueTag()
    defineComponent({ tag }, '.x { color: red; }')
    const el = mount(tag)
    expect(el.shadowRoot?.querySelector('style')?.textContent).toBe('.x { color: red; }')
  })

  it('标量 attribute 映射为带类型的 props', () => {
    const tag = uniqueTag()
    defineComponent({
      tag,
      props: {
        name: { type: 'string', default: 'World' },
        count: { type: 'number' },
        autoLoad: { type: 'boolean', attr: 'auto-load' },
      },
    })
    mount(tag, { name: 'EW', count: '7', 'auto-load': '' })
    expect(log[0]?.props).toMatchObject({ name: 'EW', count: 7, autoLoad: true })
  })

  it('未提供 attribute 时使用 default', () => {
    const tag = uniqueTag()
    defineComponent({
      tag,
      props: { name: { type: 'string', default: 'World' } },
    })
    mount(tag)
    expect(log[0]?.props.name).toBe('World')
  })

  it('attribute 变化触发 adapter.update', () => {
    const tag = uniqueTag()
    defineComponent({ tag, props: { name: { type: 'string', default: 'World' } } })
    const el = mount(tag)
    el.setAttribute('name', 'Changed')
    expect(log[0]?.updates).toBe(1)
    expect(log[0]?.props.name).toBe('Changed')
  })

  it('property 直设触发 adapter.update 且不回写 attribute', () => {
    const tag = uniqueTag()
    defineComponent({ tag, props: { payload: { type: 'object' } } })
    const el = mount(tag)
    const payload = { a: 1 }
    ;(el as unknown as { payload: unknown }).payload = payload
    expect(log[0]?.updates).toBe(1)
    expect(log[0]?.props.payload).toBe(payload)
    expect(el.hasAttribute('payload')).toBe(false)
  })

  it('property 可读回', () => {
    const tag = uniqueTag()
    defineComponent({ tag, props: { name: { type: 'string', default: 'World' } } })
    const el = mount(tag) as unknown as { name: string }
    expect(el.name).toBe('World')
    el.name = 'Direct'
    expect(el.name).toBe('Direct')
  })

  it('对象类型不进入 observedAttributes', () => {
    const tag = uniqueTag()
    const ctor = defineComponent({
      tag,
      props: { name: { type: 'string' }, payload: { type: 'object' } },
    })
    const statics = ctor as unknown as { observedAttributes: string[] }
    expect(statics.observedAttributes).toEqual(['name'])
  })

  it('事件派发为 ew- 前缀且 composed 为 true', () => {
    const tag = uniqueTag()
    defineComponent({ tag, events: ['select'] })
    mount(tag)

    const received: CustomEvent[] = []
    window.addEventListener('ew-select', (e) => received.push(e as CustomEvent))

    log[0]?.emit('select', { id: 1 })

    expect(received).toHaveLength(1)
    expect(received[0]?.detail).toEqual({ id: 1 })
    expect(received[0]?.composed).toBe(true)
    expect(received[0]?.bubbles).toBe(true)
  })

  it('派发未声明的事件时给出警告但仍然派发', () => {
    const tag = uniqueTag()
    defineComponent({ tag, events: ['select'] })
    mount(tag)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    log[0]?.emit('unknown', null)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown'))
    warn.mockRestore()
  })

  it('refresh() 强制重渲染已挂载实例', () => {
    const tag = uniqueTag()
    const ctor = defineComponent({ tag, props: { name: { type: 'string' } } })
    mount(tag)
    ctor.refresh()
    expect(log[0]?.updates).toBe(1)
  })

  it('refresh() 不影响已卸载实例', () => {
    const tag = uniqueTag()
    const ctor = defineComponent({ tag })
    const el = mount(tag)
    document.body.removeChild(el)
    ctor.refresh()
    expect(log[0]?.updates).toBe(0)
  })
})
