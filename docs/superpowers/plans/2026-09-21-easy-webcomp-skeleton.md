# easy-webcomp 一期（骨架跑通）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让一个 Vue 业务组件和一个 React 业务组件端到端跑通 —— 从源码编写、桥接为 Web Component、构建出 self-contained 产物、在 playground 里双模式预览、到最后 CDN 产物通过浏览器冒烟测试。

**Architecture:** 单包 + 目录分层。桥接层自写 Vue/React 适配器（不用 `defineCustomElement` / `@r2wc`，因为它们自己管 shadow root，无法支持 per-instance 的 `disable-shadow` 降级）。组件目录只需 `Component.vue|tsx` + `meta.ts` + `style.css` + `index.ts` + `define.ts`，构建脚本扫目录自动出入口，加组件零配置。

**Tech Stack:** Vite 7、TypeScript 严格模式、Vue 3.5、React 19、pnpm、Vitest + jsdom、Playwright。

**Scope:** 只做 self-contained 产物列。`window.__EW_SHARED__` 注册表、宿主注入三级协议、shared 模式产物、d.ts 之外的文档站均在二期/三期，本计划不涉及。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/runtime/types.ts` | `ComponentMeta` / `PropDefinition` / `ElementAdapter` 类型 + `defineComponentMeta` |
| `src/runtime/registry.ts` | tag 注册去重，防止重复 `customElements.define` 抛错 |
| `src/runtime/props.ts` | attribute 名推导、类型强转、通道判定 |
| `src/runtime/style.ts` | CSS 投递（shadow 用 `adoptedStyleSheets`，带 `<style>` 降级；light 注入 head 一次） |
| `src/runtime/element.ts` | CE 基类工厂：生命周期、属性双通道、事件转发、`refresh()` |
| `src/runtime/vue.ts` | Vue 适配器 + `useEmit()` + `EW_EMIT_KEY` |
| `src/runtime/react.ts` | React 适配器 + `useEmit()` + `EwEmitContext` |
| `src/tokens/tokens.css` | 设计 token（CSS 自定义属性） |
| `src/tokens/tokens.ts` | 供 JS 使用的 token 变量名常量 |
| `scripts/build.ts` | 扫组件目录、生成 entries、编排 ESM 与 IIFE 两种构建、回写 package.json exports |
| `playground/plugins/wc-mode.ts` | 提供 `virtual:ew-wc/*` 与 `virtual:ew-wc-index` 虚拟模块 |
| `tests/e2e/server.mjs` | 零依赖静态服务器，供 Playwright 加载 CDN 产物 |

---

## Task 1: 项目脚手架与依赖

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/env.d.ts`
- Modify: `.gitignore`

**不创建 `vite.config.ts`** —— 库构建配置内联在 Task 12 的 `scripts/build.ts` 里（用 `configFile: false`），playground 和 vitest 各有自己的配置。留一个没人使用的根配置只会让人误以为改了它会生效。

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "easy-webcomp",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "files": ["dist", "src/tokens/tokens.css"],
  "exports": {
    "./tokens.css": "./src/tokens/tokens.css"
  },
  "scripts": {
    "dev": "vite --config vite.playground.config.ts",
    "build": "tsx scripts/build.ts",
    "typecheck": "vue-tsc --noEmit -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.50.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@vitejs/plugin-vue": "^5.2.0",
    "jsdom": "^25.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vite": "^7.0.0",
    "vitest": "^3.0.0",
    "vue-tsc": "^2.2.0"
  }
}
```

`exports` 先只放 `tokens.css` —— 组件子路径由 Task 11 的构建脚本扫描生成后覆写。

- [ ] **Step 2: 安装依赖**

Run: `pnpm install`
Expected: 安装成功，生成 `pnpm-lock.yaml`。若 React 19 与 `@vitejs/plugin-react` 版本冲突，按 pnpm 提示升级 `@vitejs/plugin-react`。

- [ ] **Step 3: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "useDefineForClassFields": true,
    "types": ["vite/client"]
  },
  "include": ["src", "playground", "tests", "scripts"]
}
```

- [ ] **Step 4: 写 `src/env.d.ts`**

```ts
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
```

- [ ] **Step 5: 写 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      vue: 'vue/dist/vue.runtime.esm-bundler.js',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/runtime/**/*.test.ts'],
    globals: false,
  },
})
```

- [ ] **Step 6: 补 `.gitignore`**

在已有内容末尾追加：

```
src/.generated/
test-results/
playwright-report/
```

- [ ] **Step 7: 验证工具链可用**

Run: `pnpm exec tsc --version && pnpm exec vitest --version && pnpm exec playwright --version`
Expected: 三条命令都输出版本号，无报错。

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts src/env.d.ts .gitignore
git commit -m "chore: 项目脚手架与依赖"
```

---

## Task 2: 设计 token

**Files:**
- Create: `src/tokens/tokens.css`
- Create: `src/tokens/tokens.ts`

- [ ] **Step 1: 写 `src/tokens/tokens.css`**

```css
:root {
  --ew-color-primary: #1677ff;
  --ew-color-text: #1f2329;
  --ew-color-text-secondary: #646a73;
  --ew-color-bg: #ffffff;
  --ew-color-border: #d9d9d9;
  --ew-color-danger: #f5222d;

  --ew-radius-sm: 4px;
  --ew-radius-md: 6px;
  --ew-radius-lg: 12px;

  --ew-space-xs: 2px;
  --ew-space-sm: 4px;
  --ew-space-md: 8px;
  --ew-space-lg: 16px;

  --ew-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  --ew-font-size-sm: 12px;
  --ew-font-size-md: 14px;
  --ew-font-size-lg: 16px;
}
```

这条规则**只写 `:root`，绝不写 `:host`**。写成 `:host` 会把默认值塞进每个 shadow root，其优先级高于宿主继承来的值，导致宿主换肤失效 —— 见 spec 第 8.3 节陷阱 2。组件内部一律用 `var(--ew-x, 兜底值)` 的形式取用。

- [ ] **Step 2: 写 `src/tokens/tokens.ts`**

```ts
export const colorPrimary = 'var(--ew-color-primary)'
export const colorText = 'var(--ew-color-text)'
export const colorTextSecondary = 'var(--ew-color-text-secondary)'
export const colorBg = 'var(--ew-color-bg)'
export const colorBorder = 'var(--ew-color-border)'
export const colorDanger = 'var(--ew-color-danger)'

export const radiusSm = 'var(--ew-radius-sm)'
export const radiusMd = 'var(--ew-radius-md)'
export const radiusLg = 'var(--ew-radius-lg)'

export const spaceXs = 'var(--ew-space-xs)'
export const spaceSm = 'var(--ew-space-sm)'
export const spaceMd = 'var(--ew-space-md)'
export const spaceLg = 'var(--ew-space-lg)'

export const fontFamily = 'var(--ew-font-family)'
export const fontSizeSm = 'var(--ew-font-size-sm)'
export const fontSizeMd = 'var(--ew-font-size-md)'
export const fontSizeLg = 'var(--ew-font-size-lg)'
```

供 JS 侧代码（如二期给 echarts 传主题）引用同一个 token，避免 CSS 与 JS 两处硬编码漂移。

- [ ] **Step 3: Commit**

```bash
git add src/tokens
git commit -m "feat(tokens): 设计 token 与 CSS 变量"
```

---

## Task 3: 运行时类型定义

**Files:**
- Create: `src/runtime/types.ts`

- [ ] **Step 1: 写 `src/runtime/types.ts`**

```ts
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
    emit: (name: string, detail: unknown) => void,
  ): unknown
  update(instance: unknown, props: Record<string, unknown>): void
  unmount(instance: unknown): void
}

/** 构造器上额外挂了 refresh()，供 HMR 与 playground 强制重渲染 */
export interface EwElementConstructor extends CustomElementConstructor {
  refresh: () => void
}

export function defineComponentMeta(meta: ComponentMeta): ComponentMeta {
  return meta
}
```

- [ ] **Step 2: 验证类型可编译**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: 无报错（此时还没别的源码文件）。

- [ ] **Step 3: Commit**

```bash
git add src/runtime/types.ts
git commit -m "feat(runtime): 桥接层类型定义"
```

---

## Task 4: tag 注册去重

**Files:**
- Create: `src/runtime/registry.ts`
- Test: `tests/runtime/registry.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { registerElement, resetRegistry } from '../../src/runtime/registry'
import type { EwElementConstructor } from '../../src/runtime/types'

function makeCtor(): EwElementConstructor {
  const ctor = class extends HTMLElement {} as unknown as EwElementConstructor
  ctor.refresh = () => {}
  return ctor
}

describe('registerElement', () => {
  it('首次注册后可从 customElements 取到同一构造器', () => {
    resetRegistry()
    const ctor = makeCtor()
    const result = registerElement('ew-test-first', ctor)
    expect(result).toBe(ctor)
    expect(customElements.get('ew-test-first')).toBe(ctor)
  })

  it('同 tag 二次注册不抛错，返回已注册的构造器', () => {
    resetRegistry()
    const first = makeCtor()
    const second = makeCtor()
    registerElement('ew-test-dup', first)
    const result = registerElement('ew-test-dup', second)
    expect(result).toBe(first)
    expect(customElements.get('ew-test-dup')).toBe(first)
  })

  it('customElements 上已存在同 tag 时复用而不覆盖', () => {
    resetRegistry()
    const external = makeCtor()
    customElements.define('ew-test-external', external)
    const result = registerElement('ew-test-external', makeCtor())
    expect(result).toBe(external)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/runtime/registry.test.ts`
Expected: FAIL —— 报错 `Failed to resolve import "../../src/runtime/registry"`。

- [ ] **Step 3: 写实现**

```ts
import type { EwElementConstructor } from './types'

const registered = new Map<string, EwElementConstructor>()

export function registerElement(
  tag: string,
  ctor: EwElementConstructor,
): EwElementConstructor {
  const cached = registered.get(tag)
  if (cached) {
    if (cached !== ctor) {
      console.warn(`[ew] <${tag}> 已在本运行时注册过，忽略重复注册并复用已有构造器。`)
    }
    return cached
  }

  const existing = customElements.get(tag) as EwElementConstructor | undefined
  if (existing) {
    console.warn(`[ew] <${tag}> 已被其他代码注册，复用已有构造器。`)
    registered.set(tag, existing)
    return existing
  }

  customElements.define(tag, ctor)
  registered.set(tag, ctor)
  return ctor
}

/** 仅供测试使用，清空本运行时的注册缓存 */
export function resetRegistry(): void {
  registered.clear()
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/runtime/registry.test.ts`
Expected: PASS，3 个用例全绿。

- [ ] **Step 5: Commit**

```bash
git add src/runtime/registry.ts tests/runtime/registry.test.ts
git commit -m "feat(runtime): tag 注册去重"
```

---

## Task 5: 属性映射

**Files:**
- Create: `src/runtime/props.ts`
- Test: `tests/runtime/props.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest'
import { attrNameFor, coerceAttr, isAttributeChannel } from '../../src/runtime/props'

describe('attrNameFor', () => {
  it('camelCase 属性名默认转 kebab-case', () => {
    expect(attrNameFor('autoLoad', { type: 'boolean' })).toBe('auto-load')
  })

  it('显式 attr 优先', () => {
    expect(attrNameFor('endpoint', { type: 'string', attr: 'data-endpoint' })).toBe(
      'data-endpoint',
    )
  })

  it('全小写属性名保持不变', () => {
    expect(attrNameFor('name', { type: 'string' })).toBe('name')
  })
})

describe('isAttributeChannel', () => {
  it('标量走 attribute 通道', () => {
    expect(isAttributeChannel('string')).toBe(true)
    expect(isAttributeChannel('number')).toBe(true)
    expect(isAttributeChannel('boolean')).toBe(true)
  })

  it('对象与函数不走 attribute 通道', () => {
    expect(isAttributeChannel('object')).toBe(false)
    expect(isAttributeChannel('array')).toBe(false)
    expect(isAttributeChannel('function')).toBe(false)
  })
})

describe('coerceAttr', () => {
  it('null 转 undefined', () => {
    expect(coerceAttr(null, 'string')).toBeUndefined()
  })

  it('boolean 存在即为 true', () => {
    expect(coerceAttr('', 'boolean')).toBe(true)
    expect(coerceAttr('true', 'boolean')).toBe(true)
  })

  it('boolean 显式 false 字符串为 false', () => {
    expect(coerceAttr('false', 'boolean')).toBe(false)
  })

  it('number 正常解析', () => {
    expect(coerceAttr('42', 'number')).toBe(42)
    expect(coerceAttr('-1.5', 'number')).toBe(-1.5)
  })

  it('number 非法值转 undefined', () => {
    expect(coerceAttr('abc', 'number')).toBeUndefined()
  })

  it('string 原样返回', () => {
    expect(coerceAttr('hello', 'string')).toBe('hello')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/runtime/props.test.ts`
Expected: FAIL —— 无法解析 `../../src/runtime/props`。

- [ ] **Step 3: 写实现**

```ts
import type { PropDefinition, PropType } from './types'

export function attrNameFor(name: string, def: PropDefinition): string {
  return def.attr ?? name.replace(/([A-Z])/g, '-$1').toLowerCase()
}

export function isAttributeChannel(type: PropType): boolean {
  return type === 'string' || type === 'number' || type === 'boolean'
}

export function coerceAttr(raw: string | null, type: PropType): unknown {
  if (raw === null) return undefined
  if (type === 'boolean') return raw !== 'false'
  if (type === 'number') {
    const n = Number(raw)
    return Number.isNaN(n) ? undefined : n
  }
  return raw
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/runtime/props.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/runtime/props.ts tests/runtime/props.test.ts
git commit -m "feat(runtime): attribute 名推导与类型强转"
```

---

## Task 6: 样式投递

**Files:**
- Create: `src/runtime/style.ts`
- Test: `tests/runtime/style.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { applyStyles, resetStyleCache } from '../../src/runtime/style'

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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/runtime/style.test.ts`
Expected: FAIL —— 无法解析 `../../src/runtime/style`。

- [ ] **Step 3: 写实现**

```ts
const injectedLightStyles = new Set<string>()

function supportsAdoptedStyleSheets(root: ShadowRoot): boolean {
  return (
    'adoptedStyleSheets' in root &&
    typeof CSSStyleSheet !== 'undefined' &&
    typeof CSSStyleSheet.prototype.replaceSync === 'function'
  )
}

function injectLightStyle(doc: Document, css: string): void {
  if (injectedLightStyles.has(css)) return
  const style = doc.createElement('style')
  style.setAttribute('data-ew-style', '')
  style.textContent = css
  doc.head.appendChild(style)
  injectedLightStyles.add(css)
}

export function applyStyles(root: ShadowRoot | HTMLElement, css: string): void {
  if (!css) return

  if (root instanceof ShadowRoot) {
    if (supportsAdoptedStyleSheets(root)) {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(css)
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
      return
    }
    const style = root.ownerDocument.createElement('style')
    style.textContent = css
    root.appendChild(style)
    return
  }

  injectLightStyle(root.ownerDocument, css)
}

/** 仅供测试使用 */
export function resetStyleCache(): void {
  injectedLightStyles.clear()
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/runtime/style.test.ts`
Expected: PASS，4 个用例全绿。

- [ ] **Step 5: Commit**

```bash
git add src/runtime/style.ts tests/runtime/style.test.ts
git commit -m "feat(runtime): 样式投递与老浏览器降级"
```

---

## Task 7: CE 基类工厂（核心）

**Files:**
- Create: `src/runtime/element.ts`
- Test: `tests/runtime/element.test.ts`

- [ ] **Step 1: 写失败测试**

测试全部使用**桩适配器**，不引入任何框架 —— 桥接层是自研代码，必须独立于 Vue/React 验证。

```ts
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
    const el = mount(tag)

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
    const el = mount(tag)
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/runtime/element.test.ts`
Expected: FAIL —— 无法解析 `../../src/runtime/element`。

- [ ] **Step 3: 写实现**

```ts
import { attrNameFor, coerceAttr, isAttributeChannel } from './props'
import { applyStyles } from './style'
import type { ComponentMeta, EwElementConstructor, ElementAdapter } from './types'

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
```

三处关键点：

- `composed: true` 是硬编码的（spec 陷阱 1）。漏了它事件出不了 shadow root，且不报错。
- `liveInstances` 只在 `connectedCallback` 加入、`disconnectedCallback` 移除，所以 `refresh()` 不会碰已卸载的实例。
- property setter 只改 `_props` 并重渲染，**从不写回 attribute**（spec 7.4）。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/runtime/element.test.ts`
Expected: PASS，15 个用例全绿。

- [ ] **Step 5: 全量回归**

Run: `pnpm exec vitest run`
Expected: 之前 3 个测试文件 + 本文件全绿。

- [ ] **Step 6: Commit**

```bash
git add src/runtime/element.ts tests/runtime/element.test.ts
git commit -m "feat(runtime): CE 基类工厂与事件转发"
```

---

## Task 8: Vue 适配器

**Files:**
- Create: `src/runtime/vue.ts`
- Test: `tests/runtime/vue-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createElementClass } from '../../src/runtime/element'
import { resetRegistry } from '../../src/runtime/registry'
import { resetStyleCache } from '../../src/runtime/style'
import { useEmit, vueAdapter } from '../../src/runtime/vue'

let counter = 0
function uniqueTag(): string {
  counter += 1
  return `ew-vue-adapter-${counter}`
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
  const meta = { tag, props: { name: { type: 'string' as const, default: 'World' } }, events: ['select'] }
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
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/runtime/vue-adapter.test.ts`
Expected: FAIL —— 无法解析 `../../src/runtime/vue`。

- [ ] **Step 3: 写实现**

```ts
import { createApp, h, inject, shallowRef, type App, type ShallowRef } from 'vue'
import type { ElementAdapter } from './types'

export const EW_EMIT_KEY: unique symbol = Symbol('ew-emit')

export type EmitFn = (name: string, detail?: unknown) => void

interface VueInstance {
  app: App
  propsRef: ShallowRef<Record<string, unknown>>
}

export function vueAdapter(getComponent: () => unknown): ElementAdapter {
  return {
    mount(host, props, emit) {
      const propsRef = shallowRef<Record<string, unknown>>({ ...props })
      const app = createApp({
        render: () => h(getComponent() as never, propsRef.value),
      })
      app.provide(EW_EMIT_KEY, emit)
      app.mount(host as HTMLElement)
      const instance: VueInstance = { app, propsRef }
      return instance
    },
    update(instance, props) {
      ;(instance as VueInstance).propsRef.value = { ...props }
    },
    unmount(instance) {
      ;(instance as VueInstance).app.unmount()
    },
  }
}

export function useEmit(): EmitFn {
  const emit = inject<EmitFn | null>(EW_EMIT_KEY, null)
  if (!emit) {
    console.warn('[ew] useEmit() 在 EW_EMIT_KEY 未注入的上下文中被调用，事件不会被派发。')
    return () => {}
  }
  return emit
}
```

`render` 里每次调用 `getComponent()` 而不是缓存快照 —— 这是 HMR 的关键：Task 15 的虚拟模块只需换掉闭包里的引用，再触发一次 `refresh()` 即可换掉实现，**不需要重新 `customElements.define`**。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/runtime/vue-adapter.test.ts`
Expected: PASS，4 个用例全绿。

- [ ] **Step 5: Commit**

```bash
git add src/runtime/vue.ts tests/runtime/vue-adapter.test.ts
git commit -m "feat(runtime): Vue 适配器与 useEmit"
```

---

## Task 9: React 适配器

**Files:**
- Create: `src/runtime/react.ts`
- Test: `tests/runtime/react-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createElementClass } from '../../src/runtime/element'
import { reactAdapter, useEmit } from '../../src/runtime/react'
import { resetRegistry } from '../../src/runtime/registry'
import { resetStyleCache } from '../../src/runtime/style'

let counter = 0
function uniqueTag(): string {
  counter += 1
  return `ew-react-adapter-${counter}`
}

interface ProbeProps {
  name?: string
}

function Probe({ name = 'World' }: ProbeProps) {
  const emit = useEmit()
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

describe('reactAdapter', () => {
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
    const tag = uniqueTag()
    defineProbe(tag)
    const el = document.createElement(tag)
    document.body.appendChild(el)
    await tick()
    expect(el.shadowRoot?.querySelector('.probe')?.textContent).toBe('Hello, World')
  })

  it('attribute 变化反映到渲染结果', async () => {
    const tag = uniqueTag()
    defineProbe(tag)
    const el = document.createElement(tag)
    document.body.appendChild(el)
    await tick()
    el.setAttribute('name', 'Changed')
    await tick()
    expect(el.shadowRoot?.querySelector('.probe')?.textContent).toBe('Hello, Changed')
  })

  it('useEmit 派发出冒泡到 window 的 CustomEvent', async () => {
    const tag = uniqueTag()
    defineProbe(tag)
    const el = document.createElement(tag)
    document.body.appendChild(el)
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
    document.body.appendChild(el)
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
```

注意测试文件是 `.tsx`，需要在 `vitest.config.ts` 的 `include` 里覆盖到 —— `tests/runtime/**/*.test.ts` 已包含 `.test.tsx`？不，glob 不匹配。**Step 2 之前先把 `vitest.config.ts` 的 include 改为 `tests/runtime/**/*.test.{ts,tsx}`。**

- [ ] **Step 2: 修正 vitest include**

修改 `vitest.config.ts`：

```ts
    include: ['tests/runtime/**/*.test.{ts,tsx}'],
```

- [ ] **Step 3: 写实现**

```ts
import { createContext, createElement, useContext, type Context } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ElementAdapter } from './types'

export type EmitFn = (name: string, detail?: unknown) => void

export const EwEmitContext: Context<EmitFn> = createContext<EmitFn>(() => {})

interface ReactInstance {
  root: Root
  render: (props: Record<string, unknown>) => void
}

export function reactAdapter(getComponent: () => unknown): ElementAdapter {
  return {
    mount(host, props, emit) {
      const root = createRoot(host as unknown as Element | DocumentFragment)
      const render = (next: Record<string, unknown>): void => {
        root.render(
          createElement(
            EwEmitContext.Provider,
            { value: emit },
            createElement(getComponent() as never, next),
          ),
        )
      }
      render(props)
      const instance: ReactInstance = { root, render }
      return instance
    },
    update(instance, props) {
      ;(instance as ReactInstance).render({ ...props })
    },
    unmount(instance) {
      ;(instance as ReactInstance).root.unmount()
    },
  }
}

export function useEmit(): EmitFn {
  return useContext(EwEmitContext)
}
```

与 Vue 侧同理，`render` 内每次调 `getComponent()`，HMR 换引用后重渲染即可生效。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/runtime/react-adapter.test.ts`
Expected: PASS，4 个用例全绿。React 的渲染是异步的，若断言失败先确认 `tick()` 里用了 `act()`。

- [ ] **Step 5: 全量回归**

Run: `pnpm exec vitest run`
Expected: 6 个测试文件全绿。

- [ ] **Step 6: Commit**

```bash
git add src/runtime/react.ts tests/runtime/react-adapter.test.ts vitest.config.ts
git commit -m "feat(runtime): React 适配器与 useEmit"
```

---

## Task 10: hello-vue 组件

**Files:**
- Create: `src/components/hello-vue/Component.vue`
- Create: `src/components/hello-vue/meta.ts`
- Create: `src/components/hello-vue/style.css`
- Create: `src/components/hello-vue/index.ts`
- Create: `src/components/hello-vue/define.ts`

- [ ] **Step 1: 写 `meta.ts`**

```ts
import { defineComponentMeta } from '../../runtime/types'

export default defineComponentMeta({
  tag: 'ew-hello-vue',
  shadow: true,
  props: {
    name: { type: 'string', default: 'World' },
    count: { type: 'number', default: 0 },
    autoLoad: { type: 'boolean', attr: 'auto-load', default: false },
  },
  events: ['select'],
})
```

- [ ] **Step 2: 写 `Component.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useEmit } from '../../runtime/vue'

const props = defineProps<{
  name?: string
  count?: number
  autoLoad?: boolean
}>()

const emit = useEmit()

const label = computed(() => `Vue 组件：${props.name ?? 'World'} × ${props.count ?? 0}`)

function handleClick(): void {
  emit('select', { source: 'hello-vue', name: props.name ?? 'World' })
}
</script>

<template>
  <button class="ew-hello" type="button" @click="handleClick">{{ label }}</button>
</template>
```

**没有 `<style>` 块** —— 样式一律走同目录的 `style.css`，见 Task 1 的文件结构约定。

- [ ] **Step 3: 写 `style.css`**

```css
:host {
  display: inline-block;
}

.ew-hello {
  padding: var(--ew-space-sm, 4px) var(--ew-space-lg, 16px);
  border: 1px solid var(--ew-color-primary, #1677ff);
  border-radius: var(--ew-radius-md, 6px);
  background: var(--ew-color-bg, #ffffff);
  color: var(--ew-color-primary, #1677ff);
  font-family: var(--ew-font-family, sans-serif);
  font-size: var(--ew-font-size-md, 14px);
  cursor: pointer;
}

.ew-hello:hover {
  background: var(--ew-color-primary, #1677ff);
  color: var(--ew-color-bg, #ffffff);
}
```

所有 token 都用 `var(--ew-x, 兜底值)` 形式（spec 陷阱 2）。`:host { display: inline-block }` 是布局规则不是变量默认值，不违反该规则。

- [ ] **Step 4: 写 `index.ts`**

```ts
import { createElementClass } from '../../runtime/element'
import { registerElement } from '../../runtime/registry'
import { vueAdapter } from '../../runtime/vue'
import Component from './Component.vue'
import meta from './meta'
import css from './style.css?inline'

export { meta }
export const HelloVueElement = createElementClass(meta, vueAdapter(() => Component), css)
export function register(): void {
  registerElement(meta.tag, HelloVueElement)
}
```

- [ ] **Step 5: 写 `define.ts`**

```ts
import { register } from './index'

register()
```

- [ ] **Step 6: 验证类型**

Run: `pnpm exec vue-tsc --noEmit -p tsconfig.json`
Expected: 无报错。

- [ ] **Step 7: Commit**

```bash
git add src/components/hello-vue
git commit -m "feat(components): hello-vue 示例组件"
```

---

## Task 11: hello-react 组件

**Files:**
- Create: `src/components/hello-react/Component.tsx`
- Create: `src/components/hello-react/meta.ts`
- Create: `src/components/hello-react/style.css`
- Create: `src/components/hello-react/index.ts`
- Create: `src/components/hello-react/define.ts`

- [ ] **Step 1: 写 `meta.ts`**

```ts
import { defineComponentMeta } from '../../runtime/types'

export default defineComponentMeta({
  tag: 'ew-hello-react',
  shadow: true,
  props: {
    name: { type: 'string', default: 'World' },
    count: { type: 'number', default: 0 },
    autoLoad: { type: 'boolean', attr: 'auto-load', default: false },
  },
  events: ['select'],
})
```

- [ ] **Step 2: 写 `Component.tsx`**

```tsx
import { useEmit } from '../../runtime/react'

export interface HelloReactProps {
  name?: string
  count?: number
  autoLoad?: boolean
}

export default function HelloReact({ name = 'World', count = 0 }: HelloReactProps) {
  const emit = useEmit()

  return (
    <button
      type="button"
      className="ew-hello"
      onClick={() => emit('select', { source: 'hello-react', name })}
    >
      {`React 组件：${name} × ${count}`}
    </button>
  )
}
```

- [ ] **Step 3: 写 `style.css`**

```css
:host {
  display: inline-block;
}

.ew-hello {
  padding: var(--ew-space-sm, 4px) var(--ew-space-lg, 16px);
  border: 1px solid var(--ew-color-danger, #f5222d);
  border-radius: var(--ew-radius-md, 6px);
  background: var(--ew-color-bg, #ffffff);
  color: var(--ew-color-danger, #f5222d);
  font-family: var(--ew-font-family, sans-serif);
  font-size: var(--ew-font-size-md, 14px);
  cursor: pointer;
}

.ew-hello:hover {
  background: var(--ew-color-danger, #f5222d);
  color: var(--ew-color-bg, #ffffff);
}
```

用 `--ew-color-danger` 是为了在视觉上一眼区分 Vue 组件与 React 组件，同时验证两套组件共用同一份 token。

- [ ] **Step 4: 写 `index.ts`**

```ts
import { createElementClass } from '../../runtime/element'
import { registerElement } from '../../runtime/registry'
import { reactAdapter } from '../../runtime/react'
import Component from './Component'
import meta from './meta'
import css from './style.css?inline'

export { meta }
export const HelloReactElement = createElementClass(
  meta,
  reactAdapter(() => Component),
  css,
)
export function register(): void {
  registerElement(meta.tag, HelloReactElement)
}
```

注意 `import Component from './Component'` 不带扩展名 —— 由 Vite 解析 `.tsx`。不要写 `./Component.tsx`。

- [ ] **Step 5: 验证类型**

Run: `pnpm exec vue-tsc --noEmit -p tsconfig.json`
Expected: 无报错。

- [ ] **Step 6: Commit**

```bash
git add src/components/hello-react
git commit -m "feat(components): hello-react 示例组件"
```

---

## Task 12: 构建脚本与产物矩阵

**Files:**
- Create: `scripts/build.ts`
- Modify: `package.json`（`scripts` 里加 `build:esm` / `build:cdn`）

- [ ] **Step 1: 写 `scripts/build.ts`**

```ts
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { build } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const componentsDir = join(root, 'src/components')
const generatedDir = join(root, 'src/.generated')

interface ComponentInfo {
  name: string
  dir: string
  framework: 'vue' | 'react'
}

function discoverComponents(): ComponentInfo[] {
  return readdirSync(componentsDir)
    .filter((name) => statSync(join(componentsDir, name)).isDirectory())
    .map((name) => {
      const dir = join(componentsDir, name)
      const hasVue = existsSync(join(dir, 'Component.vue'))
      const hasReact = existsSync(join(dir, 'Component.tsx'))
      if (hasVue === hasReact) {
        throw new Error(
          `[build] ${name} 必须且只能有一个 Component.vue 或 Component.tsx（当前 vue=${hasVue} react=${hasReact}）`,
        )
      }
      for (const required of ['meta.ts', 'index.ts', 'define.ts']) {
        if (!existsSync(join(dir, required))) {
          throw new Error(`[build] ${name} 缺少 ${required}`)
        }
      }
      return { name, dir, framework: hasVue ? 'vue' : 'react' }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function writeGeneratedEntries(components: ComponentInfo[]): void {
  rmSync(generatedDir, { recursive: true, force: true })
  mkdirSync(generatedDir, { recursive: true })

  const allLines = components.map(
    (c) => `export * as ${toIdentifier(c.name)} from '../components/${c.name}/index'`,
  )
  writeFileSync(join(generatedDir, 'all.ts'), `${allLines.join('\n')}\n`)

  const defineLines = [
    `import { register as r0 } from '../components/${components[0]!.name}/index'`,
  ]
  components.slice(1).forEach((c, i) => {
    defineLines.push(`import { register as r${i + 1} } from '../components/${c.name}/index'`)
  })
  defineLines.push(
    '',
    components.map((_, i) => `r${i}()`).join('\n'),
    '',
  )
  writeFileSync(join(generatedDir, 'all-define.ts'), `${defineLines.join('\n')}\n`)
}

function toIdentifier(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

const sharedPlugins = () => [vue(), react()]

const vueAlias = { vue: 'vue/dist/vue.runtime.esm-bundler.js' }

async function buildEsm(components: ComponentInfo[]): Promise<void> {
  const entry: Record<string, string> = {
    index: join(generatedDir, 'all.ts'),
  }
  for (const c of components) {
    entry[c.name] = join(c.dir, 'index.ts')
    entry[`${c.name}/define`] = join(c.dir, 'define.ts')
  }

  await build({
    root,
    configFile: false,
    resolve: { alias: vueAlias },
    plugins: sharedPlugins(),
    build: {
      target: 'es2020',
      outDir: 'dist/esm',
      emptyOutDir: true,
      minify: 'esbuild',
      lib: {
        entry,
        formats: ['es'],
        fileName: (_format, entryName) => `${entryName}.js`,
      },
    },
  })
}

async function buildCdn(components: ComponentInfo[]): Promise<void> {
  for (const c of components) {
    await build({
      root,
      configFile: false,
      resolve: { alias: vueAlias },
      plugins: sharedPlugins(),
      build: {
        target: 'es2020',
        outDir: 'dist/cdn',
        emptyOutDir: false,
        minify: 'esbuild',
        lib: {
          entry: join(c.dir, 'define.ts'),
          formats: ['iife'],
          name: toIdentifier(c.name),
          fileName: () => `${c.name}.js`,
        },
      },
    })
  }

  await build({
    root,
    configFile: false,
    resolve: { alias: vueAlias },
    plugins: sharedPlugins(),
    build: {
      target: 'es2020',
      outDir: 'dist/cdn',
      emptyOutDir: false,
      minify: 'esbuild',
      lib: {
        entry: join(generatedDir, 'all-define.ts'),
        formats: ['iife'],
        name: 'EwAll',
        fileName: () => 'ew-all.js',
      },
    },
  })
}

function writeExportsField(components: ComponentInfo[]): void {
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>

  const exports: Record<string, unknown> = {
    './tokens.css': './src/tokens/tokens.css',
    '.': './dist/esm/index.js',
  }
  for (const c of components) {
    exports[`./${c.name}`] = `./dist/esm/${c.name}.js`
    exports[`./${c.name}/define`] = `./dist/esm/${c.name}/define.js`
    exports[`./cdn/${c.name}`] = `./dist/cdn/${c.name}.js`
  }
  exports['./cdn/ew-all'] = './dist/cdn/ew-all.js'

  pkg.exports = exports
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

function reportSizes(): void {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.js')) files.push(full)
    }
  }
  walk(join(root, 'dist'))

  console.log('\n产物体积（gzip）：')
  for (const file of files.sort()) {
    const gz = gzipSync(readFileSync(file)).length
    console.log(`  ${file.replace(`${root}/`, '')}  ${(gz / 1024).toFixed(1)} KB`)
  }
  console.log('')
}

async function main(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
  if (only && only !== 'esm' && only !== 'cdn') {
    throw new Error(`[build] --only 只接受 esm 或 cdn，收到 "${only}"`)
  }

  const components = discoverComponents()
  if (components.length === 0) throw new Error('[build] 未发现任何组件')

  console.log(`[build] 发现 ${components.length} 个组件：${components.map((c) => c.name).join(', ')}`)

  if (!only) rmSync(join(root, 'dist'), { recursive: true, force: true })
  writeGeneratedEntries(components)

  if (!only || only === 'esm') {
    console.log('[build] 构建 ESM 产物...')
    await buildEsm(components)
  }

  if (!only || only === 'cdn') {
    console.log('[build] 构建 CDN（IIFE）产物...')
    await buildCdn(components)
  }

  writeExportsField(components)
  reportSizes()

  console.log('[build] 完成')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
```

两处实现要点（spec 10.1）：

- **ESM 一次构建多入口，允许代码分割** —— 消费方是打包器，整目录解析无部署耦合。
- **IIFE 每个组件单独跑一次构建** —— Rollup 的 IIFE 格式不支持多入口，这是唯一能产出「单文件可拷走」的方式。

- [ ] **Step 2: 加 npm scripts**

修改 `package.json` 的 `scripts`，把 `build` 保留为 `tsx scripts/build.ts`，另加：

```json
    "build:esm": "tsx scripts/build.ts --only=esm",
    "build:cdn": "tsx scripts/build.ts --only=cdn",
```

- [ ] **Step 3: 运行构建**

Run: `pnpm run build`
Expected: 打印发现的 2 个组件，ESM 与 CDN 阶段都完成，末尾列出产物体积表。

- [ ] **Step 4: 验证产物文件齐全**

Run: `find dist -type f -name '*.js' | sort`
Expected: 至少包含
```
dist/cdn/ew-all.js
dist/cdn/hello-react.js
dist/cdn/hello-vue.js
dist/esm/hello-react.js
dist/esm/hello-react/define.js
dist/esm/hello-vue.js
dist/esm/hello-vue/define.js
dist/esm/index.js
```
（可能还有 `dist/esm/chunks/*.js` 代码分割产物，属正常。）

- [ ] **Step 5: 验证 exports 已回写**

Run: `node -e "console.log(Object.keys(require('./package.json').exports).join('\n'))"`
Expected: 列出 `.`、`./tokens.css`、`./hello-vue`、`./hello-vue/define`、`./hello-react`、`./hello-react/define`、`./cdn/hello-vue`、`./cdn/hello-react`、`./cdn/ew-all`。

- [ ] **Step 6: 验证 IIFE 产物确实自包含**

Run: `grep -c 'Hello, World\|ew-hello-vue' dist/cdn/hello-vue.js || true`
Expected: 输出大于 0 —— 说明组件实现确实被打进了单文件。

- [ ] **Step 7: Commit**

```bash
git add scripts/build.ts package.json
git commit -m "feat(build): 产物矩阵构建脚本"
```

---

## Task 13: Playground 源码模式

**Files:**
- Create: `vite.playground.config.ts`
- Create: `playground/index.html`
- Create: `playground/main.ts`
- Create: `playground/App.vue`
- Create: `playground/ComponentPage.vue`
- Create: `playground/renderers/VueMount.vue`
- Create: `playground/renderers/ReactMount.vue`

- [ ] **Step 1: 写 `vite.playground.config.ts`**

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: resolve(rootDir, 'playground'),
  resolve: {
    alias: {
      vue: 'vue/dist/vue.runtime.esm-bundler.js',
    },
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('ew-'),
        },
      },
    }),
    react(),
  ],
  server: {
    port: 5273,
    open: false,
  },
})
```

Task 14 会把 `wcModePlugin` 插到 `plugins` 数组最前面。

`isCustomElement` 现在就配上 —— 否则在浏览器里看到 `<ew-*>` 会被 Vue 当成未注册组件并刷警告。Task 14 加上 `wcModePlugin` 时，它是唯一改动 `plugins` 的地方。

- [ ] **Step 2: 写 `playground/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>easy-webcomp Playground</title>
    <style>
      body {
        margin: 0;
        font-family: var(--ew-font-family);
        color: var(--ew-color-text);
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

**token 样式通过 `main.ts` 里的 `import` 引入，不要用 `<link>`。** playground 的 Vite root 是 `playground/`，`<link href="/src/...">` 会被当成 root 下的路径解析而 404；作为模块 import 则由 Vite 正常处理。

- [ ] **Step 3: 写 `playground/main.ts`**

```ts
import { createApp } from 'vue'
import App from './App.vue'
import '../src/tokens/tokens.css'

createApp(App).mount('#app')
```

- [ ] **Step 4: 写 `playground/renderers/VueMount.vue`**

```vue
<script setup lang="ts">
import { provide, type Component } from 'vue'
import { EW_EMIT_KEY } from '../../src/runtime/vue'

const props = defineProps<{
  component: Component
  propsData: Record<string, unknown>
  onEvent: (name: string, detail: unknown) => void
}>()

provide(EW_EMIT_KEY, (name: string, detail: unknown) => props.onEvent(name, detail))
</script>

<template>
  <component :is="props.component" v-bind="props.propsData" />
</template>
```

把 `EW_EMIT_KEY` 提供出去，让源码模式下的事件行为与 WC 模式一致 —— 否则 React/Vue 组件在源码模式下 emit 会被吞掉，两种模式表现不一致，playground 就失去验证意义。

- [ ] **Step 5: 写 `playground/renderers/ReactMount.vue`**

```vue
<script setup lang="ts">
import { createElement, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EwEmitContext } from '../../src/runtime/react'

const props = defineProps<{
  component: ComponentType<Record<string, unknown>>
  propsData: Record<string, unknown>
  onEvent: (name: string, detail: unknown) => void
}>()

const container = ref<HTMLDivElement | null>(null)
let root: Root | null = null

function render(): void {
  if (!root) return
  root.render(
    createElement(
      EwEmitContext.Provider,
      { value: (name: string, detail: unknown) => props.onEvent(name, detail) },
      createElement(props.component, props.propsData),
    ),
  )
}

onMounted(() => {
  if (!container.value) return
  root = createRoot(container.value)
  render()
})

watch(() => [props.component, props.propsData], render, { deep: true })

onBeforeUnmount(() => {
  root?.unmount()
  root = null
})
</script>

<template>
  <div ref="container"></div>
</template>
```

- [ ] **Step 6: 写 `playground/App.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import ComponentPage from './ComponentPage.vue'

const metaModules = import.meta.glob('../src/components/*/meta.ts', { eager: true }) as Record<
  string,
  { default: { tag: string } }
>
const sourceModules = import.meta.glob('../src/components/*/Component.{vue,tsx}', { eager: true }) as
  Record<string, { default: unknown }>

interface Entry {
  name: string
  tag: string
  sourceComponent: unknown
  framework: 'vue' | 'react'
}

const entries = computed<Entry[]>(() =>
  Object.entries(metaModules).map(([path, mod]) => {
    const name = path.replace('../src/components/', '').replace('/meta.ts', '')
    const vueKey = `../src/components/${name}/Component.vue`
    const reactKey = `../src/components/${name}/Component.tsx`
    const isVue = vueKey in sourceModules
    return {
      name,
      tag: mod.default.tag,
      sourceComponent: sourceModules[isVue ? vueKey : reactKey]?.default,
      framework: isVue ? 'vue' : 'react',
    }
  }),
)

const currentName = ref<string>(entries.value[0]?.name ?? '')
const current = computed(() => entries.value.find((e) => e.name === currentName.value))
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <h1>EW Components</h1>
      <button
        v-for="entry in entries"
        :key="entry.name"
        type="button"
        :class="['nav-item', { active: entry.name === currentName }]"
        @click="currentName = entry.name"
      >
        {{ entry.name }}
        <small>{{ entry.framework }}</small>
      </button>
    </aside>
    <main class="content">
      <ComponentPage v-if="current" :key="current.name" :entry="current" />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
}
.sidebar {
  width: 220px;
  padding: 16px;
  border-right: 1px solid var(--ew-color-border);
  background: #fafafa;
}
.sidebar h1 {
  font-size: var(--ew-font-size-md);
  margin: 0 0 16px;
}
.nav-item {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 4px;
  padding: 8px;
  border: none;
  border-radius: var(--ew-radius-sm);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.nav-item.active {
  background: var(--ew-color-primary);
  color: #fff;
}
.nav-item small {
  opacity: 0.6;
}
.content {
  flex: 1;
  padding: 24px;
}
</style>
```

- [ ] **Step 7: 写 `playground/ComponentPage.vue`**

这个文件在 Task 14 会扩展出 WC 模式，本步先写源码模式。

```vue
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import ReactMount from './renderers/ReactMount.vue'
import VueMount from './renderers/VueMount.vue'

interface Entry {
  name: string
  tag: string
  sourceComponent: unknown
  framework: 'vue' | 'react'
}

const props = defineProps<{ entry: Entry }>()

const metaModules = import.meta.glob('../src/components/*/meta.ts', { eager: true }) as Record<
  string,
  {
    default: {
      tag: string
      props?: Record<string, { type: string; default?: unknown }>
    }
  }
>

const meta = computed(
  () => metaModules[`../src/components/${props.entry.name}/meta.ts`]?.default,
)

const propDefs = computed(() => Object.entries(meta.value?.props ?? {}))

const values = reactive<Record<string, string>>({})
const booleanValues = reactive<Record<string, boolean>>({})

function initValue(name: string, type: string, fallback: unknown): void {
  if (type === 'boolean') {
    if (!(name in booleanValues)) booleanValues[name] = Boolean(fallback)
    return
  }
  if (!(name in values)) values[name] = fallback === undefined ? '' : String(fallback)
}

const propsData = computed<Record<string, unknown>>(() => {
  const result: Record<string, unknown> = {}
  for (const [name, def] of propDefs.value) {
    if (def.type === 'boolean') result[name] = booleanValues[name]
    else if (def.type === 'number') result[name] = Number(values[name] || 0)
    else result[name] = values[name]
  }
  return result
})

watch(
  propDefs,
  (defs) => {
    for (const [name, def] of defs) initValue(name, def.type, def.default)
  },
  { immediate: true },
)

const events = ref<Array<{ name: string; detail: unknown; at: string }>>([])

function handleEvent(name: string, detail: unknown): void {
  events.value.unshift({ name, detail, at: new Date().toLocaleTimeString() })
  events.value = events.value.slice(0, 20)
}
</script>

<template>
  <section>
    <h2>{{ entry.name }}</h2>
    <p class="tag">&lt;{{ entry.tag }}&gt; · {{ entry.framework }}</p>

    <div class="panel">
      <h3>属性</h3>
      <label v-for="[name, def] in propDefs" :key="name" class="field">
        <span>{{ name }} <small>({{ def.type }})</small></span>
        <input
          v-if="def.type === 'boolean'"
          type="checkbox"
          :checked="booleanValues[name]"
          @change="booleanValues[name] = ($event.target as HTMLInputElement).checked"
        />
        <input
          v-else-if="def.type === 'number'"
          type="number"
          :value="values[name]"
          @input="values[name] = ($event.target as HTMLInputElement).value"
        />
        <input
          v-else
          type="text"
          :value="values[name]"
          @input="values[name] = ($event.target as HTMLInputElement).value"
        />
      </label>
      <p v-if="propDefs.length === 0" class="empty">该组件没有声明属性</p>
    </div>

    <div class="panel">
      <h3>预览</h3>
      <VueMount
        v-if="entry.framework === 'vue'"
        :component="entry.sourceComponent as never"
        :props-data="propsData"
        :on-event="handleEvent"
      />
      <ReactMount
        v-else
        :component="entry.sourceComponent as never"
        :props-data="propsData"
        :on-event="handleEvent"
      />
    </div>

    <div class="panel">
      <h3>事件日志</h3>
      <p v-if="events.length === 0" class="empty">点击组件试试</p>
      <ul v-else>
        <li v-for="(e, i) in events" :key="i">
          <code>ew-{{ e.name }}</code> · {{ e.at }} · {{ JSON.stringify(e.detail) }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.tag {
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
.panel {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-md);
}
.panel h3 {
  margin: 0 0 12px;
  font-size: var(--ew-font-size-md);
}
.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.field small {
  color: var(--ew-color-text-secondary);
}
.empty {
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
ul {
  margin: 0;
  padding-left: 18px;
  font-size: var(--ew-font-size-sm);
}
</style>
```

`watch(propDefs, ..., { immediate: true })` 负责在组件切换时把输入框的初始值填上 —— 没有它，面板会是空的。

- [ ] **Step 8: 启动 dev server 并验证热更新**

Run: `pnpm run dev`
Expected: 终端打印 `http://localhost:5273`，无编译错误。

在浏览器打开该地址，确认：
- 左侧列出 `hello-vue` 与 `hello-react`
- 点击 `hello-vue`，右侧出现 Vue 组件按钮，文案为「Vue 组件：World × 0」
- 修改属性面板的 `name` 输入框，预览**实时**变化
- 点击预览区按钮，事件日志出现 `ew-select`
- 切到 `hello-react`，同样验证一遍，按钮为红色

- [ ] **Step 9: 验证源码模式热更新**

保持 dev server 运行，修改 `src/components/hello-vue/Component.vue` 里的文案（如把「Vue 组件」改成「Vue 组件！」），保存。
Expected: 浏览器**不刷新整页**，预览文案立即更新。

- [ ] **Step 10: Commit**

```bash
git add vite.playground.config.ts playground
git commit -m "feat(playground): 双模式预览站（源码模式）"
```

---

## Task 14: Playground WC 模式虚拟模块

**Files:**
- Create: `playground/plugins/wc-mode.ts`
- Modify: `vite.playground.config.ts`
- Modify: `playground/ComponentPage.vue`

- [ ] **Step 1: 写 `playground/plugins/wc-mode.ts`**

```ts
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

const COMPONENTS_PREFIX = 'virtual:ew-wc/'
const INDEX_ID = 'virtual:ew-wc-index'
const RESOLVED_PREFIX = '\0ew-wc/'
const RESOLVED_INDEX = '\0ew-wc-index'

function listComponents(componentsDir: string): Array<{ name: string; framework: 'vue' | 'react' }> {
  return readdirSync(componentsDir)
    .filter((name) => statSync(join(componentsDir, name)).isDirectory())
    .map((name) => {
      const hasVue = existsSync(join(componentsDir, name, 'Component.vue'))
      return { name, framework: hasVue ? ('vue' as const) : ('react' as const) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function wcModePlugin(componentsDir: string): Plugin {
  const root = resolve(componentsDir, '..', '..')

  return {
    name: 'ew-wc-mode',

    resolveId(id) {
      if (id === INDEX_ID) return RESOLVED_INDEX
      if (id.startsWith(COMPONENTS_PREFIX)) {
        return RESOLVED_PREFIX + id.slice(COMPONENTS_PREFIX.length)
      }
      return null
    },

    load(id) {
      if (id === RESOLVED_INDEX) {
        const components = listComponents(componentsDir)
        const imports = components
          .map((c, i) => `import * as m${i} from '${COMPONENTS_PREFIX}${c.name}'`)
          .join('\n')
        const entries = components.map((c, i) => `  '${c.name}': m${i}`).join(',\n')
        return `${imports}\n\nexport default {\n${entries}\n}\n`
      }

      if (id.startsWith(RESOLVED_PREFIX)) {
        const name = id.slice(RESOLVED_PREFIX.length)
        const dir = join(componentsDir, name)
        if (!existsSync(dir)) return null

        const isVue = existsSync(join(dir, 'Component.vue'))
        const componentPath = `/src/components/${name}/${isVue ? 'Component.vue' : 'Component.tsx'}`
        const adapterModule = isVue
          ? "import { vueAdapter } from '/src/runtime/vue'"
          : "import { reactAdapter } from '/src/runtime/react'"
        const adapterCall = isVue ? 'vueAdapter' : 'reactAdapter'

        return `
import { createElementClass } from '/src/runtime/element'
import meta from '/src/components/${name}/meta'
import css from '/src/components/${name}/style.css?inline'
import * as ComponentModule from '${componentPath}'
${adapterModule}

const componentRef = { current: ComponentModule.default }
export { meta }
export const Element = createElementClass(meta, ${adapterCall}(() => componentRef.current), css)

if (import.meta.hot) {
  import.meta.hot.accept('${componentPath}', (updated) => {
    if (!updated) return
    componentRef.current = updated[0].default
    Element.refresh()
  })
}
`
      }

      return null
    },
  }
}
```

三个关键点：

- **虚拟模块 import 的是组件源码**（`/src/components/x/Component.vue`），不是构建产物。Vite 照常追踪依赖，所以 HMR 保留；同时走的是真实的 `createElementClass` 路径，属性和事件行为与线上一致。
- **用静态 `import * as ComponentModule`**，配合 `import.meta.hot.accept(路径, cb)` 拿到新模块 —— 不重新 `customElements.define`，只换 `componentRef.current` 再 `refresh()`。这正是 spec 7.5 要求的引用替换，也规避了 spec 陷阱 3。
- **`\0` 前缀** 是 Rollup 虚拟模块的约定，避免被当成真实文件路径解析。

- [ ] **Step 2: 接入 playground 配置**

修改 `vite.playground.config.ts`，把插件加进去：

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { wcModePlugin } from './playground/plugins/wc-mode'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: resolve(rootDir, 'playground'),
  resolve: {
    alias: {
      vue: 'vue/dist/vue.runtime.esm-bundler.js',
    },
  },
  plugins: [
    wcModePlugin(resolve(rootDir, 'src/components')),
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag.startsWith('ew-'),
        },
      },
    }),
    react(),
  ],
  server: {
    port: 5273,
    open: false,
  },
})
```

两处必须这样写：

- **`wcModePlugin` 放在最前** —— `resolveId` 需要先于其他插件处理 `virtual:` 前缀。
- **`isCustomElement` 必须配置** —— 否则 Vue 会把 `<ew-hello-vue>` 当成未注册的 Vue 组件，每次渲染都打一条 "Failed to resolve component" 警告。

- [ ] **Step 3: 在 ComponentPage 加模式开关**

把 `playground/ComponentPage.vue` 的 `<script setup>` 首行 import 改为：

```ts
import { computed, reactive, ref, watch } from 'vue'
```

在 `handleEvent` 之后追加：

```ts
const mode = ref<'source' | 'wc'>('source')

const wcAttributes = computed<Record<string, unknown>>(() => {
  const result: Record<string, unknown> = {}
  for (const [name, def] of propDefs.value) {
    const attr = name.replace(/([A-Z])/g, '-$1').toLowerCase()
    if (def.type === 'boolean') {
      if (booleanValues[name]) result[attr] = ''
    } else if (def.type === 'string' || def.type === 'number') {
      result[attr] = values[name]
    }
  }
  return result
})

async function enableWc(): Promise<void> {
  const modules = (await import('virtual:ew-wc-index')) as {
    default: Record<string, { Element: CustomElementConstructor }>
  }
  const mod = modules.default[props.entry.name]
  if (!mod) {
    console.warn(`[playground] 未找到 ${props.entry.name} 的虚拟模块`)
    return
  }
  const tag = props.entry.tag
  if (!customElements.get(tag)) {
    customElements.define(tag, mod.Element)
  }
}

watch(mode, (next) => {
  if (next === 'wc') void enableWc()
})
```

**不需要在切换时反注册 CE** —— Custom Element 一旦定义就无法取消，重定义会抛错。这正是 `enableWc` 里用 `customElements.get(tag)` 守卫的原因。

**用下面这段整体替换** Task 13 里那个包含 `<h3>预览</h3>` 的 `<div class="panel">`：

```html
<div class="panel">
  <div class="panel-head">
    <h3>预览</h3>
    <div class="mode-switch">
      <button
        type="button"
        :class="{ active: mode === 'source' }"
        @click="mode = 'source'"
      >
        源码模式
      </button>
      <button type="button" :class="{ active: mode === 'wc' }" @click="mode = 'wc'">
        WC 模式
      </button>
    </div>
  </div>

  <div :key="mode">
    <template v-if="mode === 'source'">
      <VueMount
        v-if="entry.framework === 'vue'"
        :component="entry.sourceComponent as never"
        :props-data="propsData"
        :on-event="handleEvent"
      />
      <ReactMount
        v-else
        :component="entry.sourceComponent as never"
        :props-data="propsData"
        :on-event="handleEvent"
      />
    </template>

    <component
      :is="entry.tag"
      v-else
      v-bind="wcAttributes"
      @ew-select="handleEvent('select', ($event as CustomEvent).detail)"
    />
  </div>
</div>
```

`wcAttributes` 只把标量 props 转成 attribute（对象类型无法走 attribute，WC 模式下不传）。

把预览区的 `<template v-if>` 与 `<component v-else>` 包进一个 `<div :key="mode">`，让切换模式时重建 DOM，避免 CE 实例与框架实例在同一 DOM 位置互相污染。

再加样式：

```css
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.panel-head h3 {
  margin: 0;
}
.mode-switch button {
  padding: 4px 10px;
  border: 1px solid var(--ew-color-border);
  background: #fff;
  font: inherit;
  font-size: var(--ew-font-size-sm);
  cursor: pointer;
}
.mode-switch button:first-child {
  border-radius: var(--ew-radius-sm) 0 0 var(--ew-radius-sm);
}
.mode-switch button:last-child {
  border-left: none;
  border-radius: 0 var(--ew-radius-sm) var(--ew-radius-sm) 0;
}
.mode-switch button.active {
  background: var(--ew-color-primary);
  border-color: var(--ew-color-primary);
  color: #fff;
}
```

- [ ] **Step 4: 验证 `virtual:ew-wc-index` 模块可被 TS 解析**

在 `src/env.d.ts` 末尾追加类型声明，否则 `import('virtual:ew-wc-index')` 会报 TS 错误：

```ts
declare module 'virtual:ew-wc-index' {
  const modules: Record<string, { Element: CustomElementConstructor }>
  export default modules
}
```

- [ ] **Step 5: 重启 dev server 验证 WC 模式**

Run: `pnpm run dev`
在浏览器切到 `hello-vue`，点「WC 模式」。

Expected:
- 页面出现 `<ew-hello-vue>` 元素
- 改属性面板的值，组件属性**同步更新**
- 点击组件，事件日志出现 `ew-select`
- 打开 devtools 检查该元素，能看到 `#shadow-root (open)` 及其内部的 `<style>`

- [ ] **Step 6: 验证 WC 模式热更新**

保持 dev server 运行，切到 WC 模式，修改 `src/components/hello-vue/Component.vue` 的文案并保存。

Expected: 预览区文案立即更新，**控制台不出现 `customElements.define` 重复注册的报错**。

若出现重复注册报错，说明 `Element.refresh()` 路径没生效、走了重新定义 —— 检查虚拟模块里是否确实用的是 `componentRef.current` 引用替换。

- [ ] **Step 7: 对 hello-react 重复 Step 5 与 Step 6**

Expected: React 组件在 WC 模式下同样渲染、响应属性、派发事件、支持热更新。

- [ ] **Step 8: Commit**

```bash
git add playground/plugins/wc-mode.ts vite.playground.config.ts playground/ComponentPage.vue src/env.d.ts
git commit -m "feat(playground): WC 模式虚拟模块与热更新"
```

---

## Task 15: CDN 产物冒烟测试

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/server.mjs`
- Create: `tests/e2e/fixture/index.html`
- Create: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: 写 `tests/e2e/server.mjs`**

```js
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const port = Number(process.env.PORT ?? 4173)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
  const target = normalize(join(root, urlPath))
  if (!target.startsWith(root)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  if (!existsSync(target) || statSync(target).isDirectory()) {
    res.writeHead(404).end('Not Found')
    return
  }
  res.writeHead(200, { 'content-type': types[extname(target)] ?? 'application/octet-stream' })
  createReadStream(target).pipe(res)
}).listen(port, () => {
  console.log(`static server listening on http://localhost:${port}`)
})
```

- [ ] **Step 2: 写 `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: 'http://localhost:4173/tests/e2e/fixture/index.html',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
})
```

- [ ] **Step 3: 写 `tests/e2e/fixture/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>EW CDN 冒烟</title>
    <link rel="stylesheet" href="/src/tokens/tokens.css" />
  </head>
  <body>
    <ew-hello-vue id="vue-el" name="Smoke"></ew-hello-vue>
    <ew-hello-react id="react-el" name="Smoke"></ew-hello-react>
    <ew-hello-vue id="light-el" name="Light" disable-shadow></ew-hello-vue>

    <script src="/dist/cdn/hello-vue.js"></script>
    <script src="/dist/cdn/hello-react.js"></script>
  </body>
</html>
```

- [ ] **Step 4: 写 `tests/e2e/smoke.spec.ts`**

```ts
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/fixture/index.html')
})

test('两个自定义元素都被注册并升级', async ({ page }) => {
  const defined = await page.evaluate(() => ({
    vue: Boolean(customElements.get('ew-hello-vue')),
    react: Boolean(customElements.get('ew-hello-react')),
  }))
  expect(defined.vue).toBe(true)
  expect(defined.react).toBe(true)
})

test('Vue 组件渲染进 shadow root', async ({ page }) => {
  const text = await page.evaluate(
    () => document.querySelector('#vue-el')!.shadowRoot!.textContent,
  )
  expect(text).toContain('Vue 组件：Smoke')
})

test('React 组件渲染进 shadow root', async ({ page }) => {
  const text = await page.evaluate(
    () => document.querySelector('#react-el')!.shadowRoot!.textContent,
  )
  expect(text).toContain('React 组件：Smoke')
})

test('Vue 与 React 组件同页共存互不干扰', async ({ page }) => {
  const result = await page.evaluate(() => {
    const vue = document.querySelector('#vue-el')!.shadowRoot!
    const react = document.querySelector('#react-el')!.shadowRoot!
    return {
      vueHasButton: Boolean(vue.querySelector('.ew-hello')),
      reactHasButton: Boolean(react.querySelector('.ew-hello')),
      separateRoots: vue !== react,
      styleCounts: [vue.querySelectorAll('style').length, react.querySelectorAll('style').length],
    }
  })
  expect(result.vueHasButton).toBe(true)
  expect(result.reactHasButton).toBe(true)
  expect(result.separateRoots).toBe(true)
  expect(result.styleCounts).toEqual([1, 1])
})

test('事件能穿透 shadow root 冒泡到 window', async ({ page }) => {
  const detail = await page.evaluate(async () => {
    return new Promise((resolve) => {
      window.addEventListener(
        'ew-select',
        (e) => resolve((e as CustomEvent).detail),
        { once: true },
      )
      document
        .querySelector('#vue-el')!
        .shadowRoot!.querySelector<HTMLButtonElement>('.ew-hello')!
        .click()
    })
  })
  expect(detail).toEqual({ source: 'hello-vue', name: 'Smoke' })
})

test('disable-shadow 降级到 light DOM 且样式注入 head', async ({ page }) => {
  const result = await page.evaluate(() => {
    const el = document.querySelector('#light-el')!
    return {
      hasShadow: Boolean(el.shadowRoot),
      hasButton: Boolean(el.querySelector('.ew-hello')),
      headStyles: document.head.querySelectorAll('style[data-ew-style]').length,
    }
  })
  expect(result.hasShadow).toBe(false)
  expect(result.hasButton).toBe(true)
  expect(result.headStyles).toBeGreaterThan(0)
})

test('token 换肤能穿透 shadow root 影响组件', async ({ page }) => {
  const colorOf = () =>
    page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector('#vue-el')!.shadowRoot!.querySelector('.ew-hello')!,
        ).borderTopColor,
    )

  const before = await colorOf()
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ew-color-primary', 'rgb(255, 0, 0)')
  })
  const after = await colorOf()

  expect(after).not.toBe(before)
  expect(after).toBe('rgb(255, 0, 0)')
})

test('单组件产物与全量包同时引入不触发重复注册错误', async ({ page }) => {
  // fixture 已引入 hello-vue.js / hello-react.js 单组件产物，
  // 这里再引入全量包，它会再次对同样的 tag 调 register()。
  // 注意这是两个独立的 bundle，registry 模块实例不共享 ——
  // 拦住重复注册的必须是 registerElement 里的 customElements.get() 兜底检查。
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.addScriptTag({ url: '/dist/cdn/ew-all.js' })

  expect(errors).toEqual([])

  const upgraded = await page.evaluate(() => {
    const el = document.createElement('ew-hello-vue')
    el.setAttribute('name', 'All')
    document.body.appendChild(el)
    return el.shadowRoot?.textContent?.includes('All') ?? false
  })
  expect(upgraded).toBe(true)
})
```

最后一个用例验证 **spec 陷阱 3**：单组件产物与全量包同时引入时，重复注册必须被拦下而不是抛 `NotSupportedError`。这里是**两个独立 bundle，`registry` 模块实例互不共享**，所以真正兜底的是 `registerElement` 里的 `customElements.get()` 检查 —— 如果只依赖模块级的 `registered` Map，这个用例就会失败。

- [ ] **Step 5: 确保产物已构建**

Run: `pnpm run build`
Expected: 构建成功。

- [ ] **Step 6: 安装 Playwright 浏览器**

Run: `pnpm exec playwright install chromium`
Expected: 下载完成。

- [ ] **Step 7: 运行冒烟测试**

Run: `pnpm run test:e2e`
Expected: 8 个用例全部 PASS。

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test(e2e): CDN 产物冒烟测试"
```

---

## Task 16: 收尾验证

**Files:**
- Modify: `package.json`（加 `verify` 脚本）
- Create: `README.md`

- [ ] **Step 1: 加 `verify` 脚本**

在 `package.json` 的 `scripts` 中加入：

```json
    "verify": "pnpm run typecheck && pnpm run test && pnpm run build && pnpm run test:e2e"
```

- [ ] **Step 2: 全量验证**

Run: `pnpm run verify`
Expected: 四项依次通过，末尾打印产物体积表。任何一项失败都必须先修好再继续 —— 不允许带着失败进入下一步。

- [ ] **Step 3: 记录体积基线**

Run: `pnpm run build 2>&1 | tail -20`
Expected: 记录每个产物的 gzip 体积。把这张表抄进 `README.md`。后续每次构建都应与这张表对比，若某个产物突然变大，说明引入了未察觉的大依赖。

- [ ] **Step 4: 写 `README.md`**

````markdown
# easy-webcomp

用 Vue 3 或 React 编写业务组件，构建管线输出统一形态的 Web Component。支持 npm ESM 引入与 CDN 单文件引入。

## 快速开始

```bash
pnpm install
pnpm run dev        # 启动 playground：http://localhost:5273
```

## 新增一个组件

在 `src/components/` 下新建目录，放入五个文件即可，**不需要修改任何构建配置**：

```
src/components/<组件名>/
├── Component.vue     # 或 Component.tsx，二者只能有一个
├── meta.ts           # 组件契约：tag、props、events
├── style.css         # 唯一样式来源，禁止用 <style> 块
├── index.ts          # 入口：导出构造器与 register()
└── define.ts         # 副作用入口，CDN 产物用
```

组件内派发事件用 `useEmit()`：

```ts
import { useEmit } from '../../runtime/vue'   // React 组件改为 '../../runtime/react'
const emit = useEmit()
emit('select', { id: 1 })                      // → 派发 ew-select 事件
```

事件名必须出现在 `meta.ts` 的 `events` 数组里，否则开发态会打印警告。

## 构建

```bash
pnpm run build      # ESM + CDN 全部产物
pnpm run build:esm  # 只出 ESM
pnpm run build:cdn  # 只出 CDN
```

产物结构：

| 路径 | 用途 |
|---|---|
| `dist/esm/*.js` | npm ESM 引入，无副作用，需显式调 `register()` |
| `dist/esm/*/define.js` | npm ESM 引入，import 即注册 |
| `dist/cdn/<组件>.js` | CDN 单文件，运行时内联，import 即注册 |
| `dist/cdn/ew-all.js` | CDN 全量单文件 |

## 引入方式

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/hello-vue.js"></script>

<ew-hello-vue name="World" count="3"></ew-hello-vue>
```

ESM：

```ts
import 'easy-webcomp/hello-vue/define'

document.body.innerHTML = '<ew-hello-vue name="World"></ew-hello-vue>'
```

React 项目里传对象属性：

```tsx
const ref = useRef<HTMLElement>(null)
useEffect(() => {
  if (ref.current) (ref.current as any).payload = { id: 1 }
}, [])
return <ew-hello-vue ref={ref} name="World" />
```

React ≤18 会把对象属性序列化，必须走 property 通道；`<ew-hello-vue>` 需要在自己的 `d.ts` 里补充 JSX 类型声明。

## 主题

覆盖任意 `--ew-*` 变量即可换肤，无需 `::part()`：

```css
:root {
  --ew-color-primary: #ff4d4f;
}
```

组件内部一律用 `var(--ew-color-primary, 兜底值)` 取用。**不要在 `:host` 上写变量默认值** —— 它的优先级高于宿主继承来的值，会让换肤失效。

## 验证

```bash
pnpm run verify   # typecheck + 单测 + 构建 + 冒烟测试
```
````

- [ ] **Step 5: Commit**

```bash
git add package.json README.md
git commit -m "docs: README 与 verify 脚本"
```

---

## 完成标准

一期完成的判定条件，逐条可验证：

1. `pnpm run verify` 四项全绿。
2. `dist/esm/`、`dist/cdn/` 下产出全部预期文件（Task 12 Step 4 的清单）。
3. `package.json` 的 `exports` 字段由构建脚本自动生成，包含全部组件子路径。
4. playground 中每个组件都能在「源码模式」与「WC 模式」下切换，两种模式的行为一致（属性响应、事件派发），且两种模式都支持热更新。
5. 冒烟测试证明：CDN 单文件引入即可用、Shadow DOM 隔离生效、`disable-shadow` 降级可用、token 换肤穿透生效、Vue 与 React 组件同页共存、单组件产物与全量包同时引入不抛重复注册错误。

## 遗留到二期的事项

以下内容**不在本计划内**，不要顺手实现：

- `window.__EW_SHARED__` 注册表与 `useSharedDep()`（重库单例）
- 宿主注入三级协议（`<ew-provider>` / `window.__EW_HOST__` / 组件属性）
- shared 模式产物（external 到 `window.Vue` / `window.React`）
- **由 `meta.ts` 驱动的组件契约测试**（spec 第 12 节第 2 层）—— 一期只有两个组件，其契约已由 Task 15 的 e2e 逐条覆盖；等组件上到一定数量、手写 e2e 开始重复时再做这套生成式测试才有收益
- `vite-plugin-dts` 生成 `.d.ts`（spec 第 6 节第 3 处驱动）—— 一期产物未发布，TS 消费方还不存在
- 体积哨兵（与上次构建对比）
- ESLint + Prettier + CI
