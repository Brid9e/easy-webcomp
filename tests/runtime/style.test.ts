import { beforeEach, describe, expect, it } from 'vitest'
import { applyStyles, resetStyleCache } from '@ew/runtime'

describe('applyStyles', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    resetStyleCache()
  })

  it('shadow root 下注入 style 元素', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })

    applyStyles(shadow, '.a { color: red; }')

    const style = shadow.querySelector('style')
    expect(style).not.toBeNull()
    expect(style?.textContent).toBe('.a { color: red; }')
  })

  it('shadow root 支持 adoptedStyleSheets 时优先使用', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })

    // jsdom 25 未实现 ShadowRoot.adoptedStyleSheets，按支持该特性的浏览器语义打桩。
    // 只打在这一个实例上：全局打桩会让上面那个降级用例失效。
    let sheets: CSSStyleSheet[] = []
    Object.defineProperty(shadow, 'adoptedStyleSheets', {
      configurable: true,
      get: () => sheets,
      set: (value: CSSStyleSheet[]) => {
        sheets = value
      },
    })

    const original = globalThis.CSSStyleSheet
    // @ts-expect-error 测试替身
    globalThis.CSSStyleSheet = class {
      text = ''
      replaceSync(css: string) {
        this.text = css
      }
    }

    try {
      applyStyles(shadow, '.b { color: blue; }')
      expect(shadow.querySelector('style')).toBeNull()
      expect(shadow.adoptedStyleSheets).toHaveLength(1)
    } finally {
      globalThis.CSSStyleSheet = original
    }
  })

  it('light DOM 注入到 document.head 且相同 CSS 只注入一次', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    document.body.append(a, b)

    applyStyles(a, '.c { color: green; }')
    applyStyles(b, '.c { color: green; }')

    const styles = document.head.querySelectorAll('style[data-ew-style]')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toBe('.c { color: green; }')
  })

  it('空 CSS 不做任何事', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })

    applyStyles(shadow, '')

    expect(shadow.querySelector('style')).toBeNull()
  })
})
