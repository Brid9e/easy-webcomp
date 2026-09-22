import { beforeEach, describe, expect, it } from 'vitest'
import { applyGlobalStyles, applyStyles, resetStyleCache, rewriteHost } from '@ew/runtime'

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

  it('shadow root 往 head 放的那份额外副本裹在 @layer 里 —— 不许盖过宿主页面的样式', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })

    applyStyles(shadow, '.a { color: red; }')

    // 树里那份是原样的；head 那份必须降级，UI 库自带的 `:root{color-scheme:light}`
    // 和一堆 --el-* 默认值否则会反压宿主自己的主题。
    expect(shadow.querySelector('style')?.textContent).toBe('.a { color: red; }')

    const head = document.head.querySelector('style[data-ew-style]')
    expect(head).not.toBeNull()
    expect(head?.textContent).toMatch(/^@layer [\w-]+ \{/)
    expect(head?.textContent).toContain('.a { color: red; }')
  })

  it('空 CSS 不做任何事', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })

    applyStyles(shadow, '')

    expect(shadow.querySelector('style')).toBeNull()
  })
})

describe('rewriteHost', () => {
  it('把裸 :host 换成宿主选择器', () => {
    expect(rewriteHost(':host { display: block; }', '.ew-x-host')).toBe(
      '.ew-x-host { display: block; }',
    )
  })

  it('出现多次时全部替换', () => {
    expect(rewriteHost(':host { a: 1 }\n:host:hover { b: 2 }', '.h')).toBe(
      '.h { a: 1 }\n.h:hover { b: 2 }',
    )
  })

  it('不碰 :host(...) —— 它在 light DOM 里匹配不到任何元素，留着是无害的空规则', () => {
    expect(rewriteHost(':host(.card) { a: 1 }', '.h')).toBe(':host(.card) { a: 1 }')
  })

  // 负向先行断言挡的是「:host 后面还接着标识符字符」的情形
  it('不碰 :hostname 这类同前缀的属性选择器', () => {
    expect(rewriteHost('a:hostname { a: 1 }', '.h')).toBe('a:hostname { a: 1 }')
  })

  // 「-」那半边前瞻挡的是这个：它是 shadow 里的又一个伪类，改写成 `.h-context(.x)` 是非法选择器
  it('不碰 :host-context()', () => {
    expect(rewriteHost(':host-context(.dark) { a: 1 }', '.h')).toBe(':host-context(.dark) { a: 1 }')
  })

  // 已知行为，不是 bug：改写是朴素字符串替换，不做 CSS 解析，所以注释里的 :host 同样会被换掉。
  // 注释里被换成什么都不影响渲染，而为此上真正的 CSS parser 不划算。这条用例把这个行为钉住，
  // 免得将来有人当成 bug 去「修」。
  it('注释里的 :host 也会被替换 —— 朴素替换的已知代价，无害', () => {
    expect(rewriteHost('/* :host was here */ :host { a: 1 }', '.h')).toBe(
      '/* .h was here */ .h { a: 1 }',
    )
  })
})

describe('applyGlobalStyles', () => {
  // 文件里那个 beforeEach 写在 describe('applyStyles') 内部，作用域不到这里，必须自己来一份。
  // 少了它会串味：前一个 describe 留下的 style 元素与去重表会让这里的断言飘。
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    resetStyleCache()
  })

  it('同一份 CSS 只注入一次', () => {
    applyGlobalStyles('.g { color: red; }')
    applyGlobalStyles('.g { color: red; }')
    expect(document.head.querySelectorAll('style[data-ew-style]')).toHaveLength(1)
  })

  it('空 CSS 不做任何事', () => {
    applyGlobalStyles('')
    expect(document.head.querySelectorAll('style[data-ew-style]')).toHaveLength(0)
  })

  it('注入的是裸 CSS，不裹 @layer —— 组件自身样式理应参与正常层叠', () => {
    applyGlobalStyles('.g { color: red; }')
    expect(document.head.querySelector('style[data-ew-style]')?.textContent).toBe(
      '.g { color: red; }',
    )
  })
})
