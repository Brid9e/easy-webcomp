import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, inject, type Plugin } from 'vue'
import {
  createElementClass,
  resetRegistry,
  resetStyleCache,
  useVueEmit,
  vueAdapter,
} from '@ew/runtime'

let counter = 0
function uniqueTag(): string {
  counter += 1
  return `ew-vue-adapter-${counter}`
}

const Probe = defineComponent({
  props: { name: { type: String, default: 'World' } },
  setup(props) {
    const emit = useVueEmit()
    return () =>
      h(
        'button',
        {
          class: 'probe',
          onClick: () => emit('select', { name: props.name }),
        },
        `Hello, ${props.name}`,
      )
  },
})

function mountVue(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const meta = {
    tag,
    props: { name: { type: 'string' as const, default: 'World' } },
    events: ['select'],
  }
  const ctor = createElementClass(meta, vueAdapter(() => Probe), '')
  customElements.define(tag, ctor)
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

async function tick(): Promise<void> {
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
}

describe('vueAdapter', () => {
  beforeEach(() => {
    resetRegistry()
    resetStyleCache()
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('渲染到 shadow root 内', async () => {
    const el = mountVue(uniqueTag())
    await tick()
    expect(el.shadowRoot?.querySelector('.probe')?.textContent).toBe('Hello, World')
  })

  it('attribute 变化反映到渲染结果', async () => {
    const tag = uniqueTag()
    const el = mountVue(tag)
    await tick()
    el.setAttribute('name', 'Changed')
    await tick()
    expect(el.shadowRoot?.querySelector('.probe')?.textContent).toBe('Hello, Changed')
  })

  it('useVueEmit 派发出冒泡到 window 的 CustomEvent', async () => {
    const tag = uniqueTag()
    const el = mountVue(tag)
    await tick()

    const received: CustomEvent[] = []
    window.addEventListener('ew-select', (e) => received.push(e as CustomEvent))

    el.shadowRoot?.querySelector<HTMLButtonElement>('.probe')?.click()

    expect(received).toHaveLength(1)
    expect(received[0]?.detail).toEqual({ name: 'World' })
    expect(received[0]?.composed).toBe(true)
  })

  it('宿主用 property 传对象可渲染', async () => {
    const tag = uniqueTag()
    const ObjectProbe = defineComponent({
      props: { payload: { type: Object, default: () => ({}) } },
      setup(props) {
        return () => h('span', { class: 'obj' }, JSON.stringify(props.payload))
      },
    })
    const ctor = createElementClass(
      { tag, props: { payload: { type: 'object' } } },
      vueAdapter(() => ObjectProbe),
      '',
    )
    customElements.define(tag, ctor)
    const el = document.createElement(tag)
    document.body.appendChild(el)
    ;(el as unknown as { payload: unknown }).payload = { a: 1 }
    await tick()
    expect(el.shadowRoot?.querySelector('.obj')?.textContent).toBe('{"a":1}')
  })

  it('插件工厂按元素实例装一次，provide 的值互相隔离', async () => {
    const probeKey = Symbol('probe')
    let seq = 0

    // 每次调用返回一份新的插件 —— 这正是 Pinia 的用法：一个元素一份状态
    const factory = (): Plugin[] => {
      seq += 1
      const mine = seq
      return [{ install: (app) => app.provide(probeKey, mine) }]
    }

    const ProbeComp = defineComponent({
      setup() {
        return () => h('span', { class: 'probe-value' }, String(inject(probeKey, 0)))
      },
    })

    const adapter = vueAdapter(() => ProbeComp, { plugins: factory })
    const hostA = document.createElement('div')
    const hostB = document.createElement('div')
    adapter.mount(hostA, {}, () => {})
    adapter.mount(hostB, {}, () => {})
    await tick()

    expect(seq).toBe(2)
    expect(hostA.querySelector('.probe-value')?.textContent).toBe('1')
    expect(hostB.querySelector('.probe-value')?.textContent).toBe('2')
  })

  it('不传 options 时行为不变', async () => {
    const el = mountVue(uniqueTag())
    await tick()
    expect(el.shadowRoot?.querySelector('.probe')?.textContent).toBe('Hello, World')
  })
})
