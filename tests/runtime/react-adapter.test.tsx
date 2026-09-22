// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import {
  createElementClass,
  reactAdapter,
  resetRegistry,
  resetStyleCache,
  useReactEmit,
} from '@ew/runtime'

// 不设这个标志位，act() 不会真正把 React 更新刷成同步，断言会变得看运气
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let counter = 0
function uniqueTag(): string {
  counter += 1
  return `ew-react-adapter-${counter}`
}

interface ProbeProps {
  name?: string
}

function Probe({ name = 'World' }: ProbeProps) {
  const emit = useReactEmit()
  return (
    <button type="button" className="probe" onClick={() => emit('select', { name })}>
      {`Hello, ${name}`}
    </button>
  )
}

function defineProbe(tag: string) {
  const ctor = createElementClass(
    {
      tag,
      props: { name: { type: 'string', default: 'World' } },
      events: ['select'],
    },
    reactAdapter(() => Probe),
    '',
  )
  customElements.define(tag, ctor)
  return ctor
}

async function tick(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

/** 挂载与改属性都会经由 CE 生命周期触发 root.render，必须包在 act 里才是确定性的 */
async function connect(el: HTMLElement): Promise<void> {
  await act(async () => {
    document.body.appendChild(el)
  })
}

describe('reactAdapter', () => {
  beforeEach(() => {
    resetRegistry()
    resetStyleCache()
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  afterEach(async () => {
    // 清空 body 会触发 CE 的断开生命周期，进而 root.unmount()，同样要包在 act 里
    await act(async () => {
      document.body.innerHTML = ''
    })
  })

  it('渲染到 shadow root 内', async () => {
    const tag = uniqueTag()
    defineProbe(tag)
    const el = document.createElement(tag)
    await connect(el)
    await tick()
    expect(el.shadowRoot?.querySelector('.probe')?.textContent).toBe('Hello, World')
  })

  it('attribute 变化反映到渲染结果', async () => {
    const tag = uniqueTag()
    defineProbe(tag)
    const el = document.createElement(tag)
    await connect(el)
    await tick()
    await act(async () => {
      el.setAttribute('name', 'Changed')
    })
    await tick()
    expect(el.shadowRoot?.querySelector('.probe')?.textContent).toBe('Hello, Changed')
  })

  it('useReactEmit 派发出冒泡到 window 的 CustomEvent', async () => {
    const tag = uniqueTag()
    defineProbe(tag)
    const el = document.createElement(tag)
    await connect(el)
    await tick()

    const received: CustomEvent[] = []
    window.addEventListener('ew-select', (e) => received.push(e as CustomEvent))

    await act(async () => {
      el.shadowRoot?.querySelector<HTMLButtonElement>('.probe')?.click()
    })

    expect(received).toHaveLength(1)
    expect(received[0]?.detail).toEqual({ name: 'World' })
    expect(received[0]?.composed).toBe(true)
  })

  it('卸载后不再渲染', async () => {
    const tag = uniqueTag()
    defineProbe(tag)
    const el = document.createElement(tag)
    await connect(el)
    await tick()
    const button = el.shadowRoot?.querySelector('.probe')
    expect(button).not.toBeNull()

    act(() => {
      document.body.removeChild(el)
    })
    await tick()
    expect(el.shadowRoot?.querySelector('.probe')).toBeNull()
  })
})
