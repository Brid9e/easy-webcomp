import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createElementClass } from '../../src/runtime/element'
import { resetRegistry } from '../../src/runtime/registry'
import { resetStyleCache } from '../../src/runtime/style'
import { useEmit, vueAdapter } from '../../src/runtime/vue'

let counter = 0
function uniqueTag(): string {
  counter += 1
  return `ctc-vue-adapter-${counter}`
}

const Probe = defineComponent({
  props: { name: { type: String, default: 'World' } },
  setup(props) {
    const emit = useEmit()
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

  it('useEmit 派发出冒泡到 window 的 CustomEvent', async () => {
    const tag = uniqueTag()
    const el = mountVue(tag)
    await tick()

    const received: CustomEvent[] = []
    window.addEventListener('ctc-select', (e) => received.push(e as CustomEvent))

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
})
