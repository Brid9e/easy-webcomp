import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import { HelloReact } from '../../dist/framework/react.js'
import { HelloVue } from '../../dist/framework/vue.js'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

// 只清 body，不清 head：样式去重表是 dist 产物里的一个模块级 Set，用例够不着它，
// 清掉 head 只会在下一条用例里造出「Set 说注入过、DOM 里却没有」的假红。
beforeEach(() => {
  document.body.innerHTML = ''
})

function injectedCss(): string {
  return [...document.head.querySelectorAll('style[data-ew-style]')]
    .map((el) => el.textContent ?? '')
    .join('\n')
}

describe('Vue 框架产物', () => {
  it('渲染进宿主 div，host 类名与内部组件都在', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    createApp({ render: () => h(HelloVue, { name: '框架模式', count: 3 }) }).mount(host)

    expect(host.querySelector('.ew-hello-vue-host')).not.toBeNull()
    expect(host.querySelector('button')?.textContent).toContain('框架模式 × 3')
  })

  it('@select 走原生 v-on，onSelect 收到 detail', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const received: unknown[] = []

    createApp({
      render: () => h(HelloVue, { name: 'X', onSelect: (detail: unknown) => received.push(detail) }),
    }).mount(host)

    host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(received).toEqual([{ source: 'hello-vue', name: 'X' }])
  })

  it('样式注入 head，且 :host 已被改写成宿主类', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    createApp({ render: () => h(HelloVue, {}) }).mount(host)

    const css = injectedCss()
    expect(css).toContain('.ew-hello-vue-host')
    expect(css).not.toContain(':host')
  })

  it('同页两个实例只注入一份样式', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    document.body.append(a, b)

    createApp({ render: () => h(HelloVue, {}) }).mount(a)
    // 断言「不再增长」而不是「恰好 1 份」：去重表在 dist 产物里，用例清不掉它，
    // 前面用例注入的那份会一直留在 head 里。
    const afterFirst = document.head.querySelectorAll('style[data-ew-style]').length
    createApp({ render: () => h(HelloVue, {}) }).mount(b)

    expect(document.head.querySelectorAll('style[data-ew-style]')).toHaveLength(afterFirst)
  })
})

describe('React 框架产物', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
  })

  it('渲染进宿主 div，props 透传到内层组件', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(createElement(HelloReact, { name: '框架模式', count: 3 }))
    })

    expect(host.querySelector('.ew-hello-react-host')).not.toBeNull()
    expect(host.querySelector('button')?.textContent).toContain('框架模式 × 3')

    await act(async () => root.unmount())
  })

  it('emit 映射成 onSelect 回调', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onSelect = vi.fn()

    await act(async () => {
      root.render(createElement(HelloReact, { name: 'X', onSelect }))
    })
    await act(async () => {
      host.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onSelect).toHaveBeenCalledWith({ source: 'hello-react', name: 'X' })
    await act(async () => root.unmount())
  })

  it('样式注入 head，且 :host 已被改写成宿主类', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(createElement(HelloReact, {}))
    })

    const css = injectedCss()
    expect(css).toContain('.ew-hello-react-host')
    expect(css).not.toContain(':host')
    await act(async () => root.unmount())
  })
})
