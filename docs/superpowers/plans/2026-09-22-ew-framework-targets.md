# easy-webcomp 框架组件产物 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 esm / cdn 之外新增第三个构建目标，把组件按源码形态打成原生 Vue / React 组件，通过 `easy-webcomp/vue` 与 `easy-webcomp/react` 给宿主框架项目直接 import。

**Architecture:** 组件源码（`Component.vue` / `Component.tsx`）本就是普通框架组件，WC 只是外面套的壳。框架产物绕开那层壳：构建期为每个组件生成一个薄包装组件（透传 props、把原生 emit 接到 `EW_EMIT_KEY`、渲染一层带 `ew-<名>-host` 类的宿主 div），`external` 掉 vue/react，样式以 `?inline` 字符串随模块走、挂载时注入。组件库（Element Plus）的样式拆成独立入口由消费方决定引不引。

**Tech Stack:** Vite 7 lib mode（ESM）、sass 1.104（构建期编译以做类名检查）、Vitest 3 + jsdom、Playwright（系统 Chrome）、VitePress 1.6

**Spec:** `docs/superpowers/specs/2026-09-22-ew-framework-targets-design.md`

---

## 文件结构

**新建**

| 文件 | 职责 |
|---|---|
| `scripts/style-prefix.ts` | 纯函数：从 CSS 里取出选择器里的类名，找出未按组件名前缀命名的 |
| `scripts/framework-entries.ts` | 纯函数：为每个组件生成包装源码与桶文件源码，以及 `hostClassOf` |
| `scripts/check-framework.ts` | 构建后守卫：产物存在性与裸导入说明符 |
| `vitest.integration.config.ts` | 只跑构建后集成测试的第二份 Vitest 配置 |
| `tests/integration/framework.test.ts` | 在 jsdom 里真的挂载 `dist/framework/*.js`，验 Vue 与 React 两条路 |
| `tests/e2e/fixture/framework.html` | 用 import map 在真实浏览器里跑 Vue 框架产物 |
| `tests/e2e/framework.spec.ts` | 上一条页面的断言 |

**修改**

| 文件 | 改什么 |
|---|---|
| `packages/runtime/src/style.ts` | 加 `rewriteHost()` 与 `applyGlobalStyles()` |
| `packages/runtime/src/index.ts` | 导出上面两个 |
| `scripts/build.ts` | 探测样式文件名 → 类名检查 → 生成框架入口 → 新增 framework 构建 → exports/`--only` |
| `scripts/new-component.ts` | 脚手架生成的根类名从 `ew-root` 改成 `ew-<组件名>` |
| `src/workspaces/demo/components/hello-vue/{Component.vue,style.scss}` | `.ew-hello` → `.ew-hello-vue` |
| `src/workspaces/demo/components/hello-react/{Component.tsx,style.scss}` | `.ew-hello` → `.ew-hello-react` |
| `tests/e2e/smoke.spec.ts` | 5 处 `.ew-hello` 选择器跟着改名 |
| `package.json` | `peerDependencies`、`check:framework` 脚本、`verify` 加一步 |
| `vitest.config.ts` | 把 `tests/integration/**` 排除出主测试 |
| `tsconfig.json` | 把 `tests/integration` 排除出类型检查（它引 `dist/**`，没有 `.d.ts`） |
| `docs/guide/authoring.md`、`docs/guide/build.md` | 命名约定与框架产物说明 |

---

### Task 1: 运行时补两个函数

**Files:**
- Modify: `packages/runtime/src/style.ts`
- Modify: `packages/runtime/src/index.ts`
- Test: `tests/runtime/style.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/runtime/style.test.ts` 顶部把 import 换成：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { applyGlobalStyles, applyStyles, resetStyleCache, rewriteHost } from '@ew/runtime'
```

在文件末尾（最后一个 `})` 之后）追加：

```ts
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
})
```

> `rewriteHost` 是纯函数，不需要 `beforeEach`。`applyGlobalStyles` 需要 —— 但**别去改** `describe('applyStyles')` 里那个共用的 `beforeEach`：它的作用域只在自己那个块里，靠「共用」是错觉。

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test -- style
```

预期：FAIL，`rewriteHost is not a function` 与 `applyGlobalStyles is not a function`。

- [ ] **Step 3: 实现**

在 `packages/runtime/src/style.ts` 的 `resetStyleCache` 之前插入：

```ts
/**
 * 把 shadow 专用的 `:host` 改写成 light DOM 里的宿主选择器。
 *
 * 只认裸 `:host`。`:host(...)` 是有意留着的 —— 它在 light DOM 里匹配不到任何元素，
 * 是一条无害的空规则；而改成 `.h(.card)` 会拼出非法选择器，整条规则连同块一起被丢弃。
 * 当前没有组件用这个形态，真要用再单独设计。
 */
export function rewriteHost(css: string, selector: string): string {
  return css.replace(/:host(?![\w-])/g, selector)
}

/**
 * 把一份 CSS 作为**全局**样式注入 `document.head`，同一份只注入一次。
 *
 * 框架产物用它：那条路径下没有自定义元素，也就没有 `applyStyles` 的 shadow / light
 * 分流，组件样式直接落整页。与 `applyStyles` 的 light DOM 分支共用同一份去重表。
 */
export function applyGlobalStyles(css: string, doc: Document = document): void {
  if (!css) return
  injectLightStyle(doc, css)
}
```

在 `packages/runtime/src/index.ts` 里改成：

```ts
export { applyGlobalStyles, applyStyles, resetStyleCache, rewriteHost } from './style.ts'
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm run test -- style
```

预期：PASS（原有 5 条 + 新增 6 条）。

- [ ] **Step 5: 提交**

```bash
git add packages/runtime/src/style.ts packages/runtime/src/index.ts tests/runtime/style.test.ts
git commit -m "feat(runtime): 补 rewriteHost 与 applyGlobalStyles，供框架产物使用"
```

---

### Task 2: 构建期类名前缀检查，并修掉 demo 里两处撞车

**Files:**
- Create: `scripts/style-prefix.ts`
- Test: `tests/scripts/style-prefix.test.ts`
- Modify: `scripts/build.ts`
- Modify: `src/workspaces/demo/components/hello-vue/Component.vue`
- Modify: `src/workspaces/demo/components/hello-vue/style.scss`
- Modify: `src/workspaces/demo/components/hello-react/Component.tsx`
- Modify: `src/workspaces/demo/components/hello-react/style.scss`
- Modify: `tests/e2e/smoke.spec.ts`（5 处 `.ew-hello`，漏改会让 e2e 红）

- [ ] **Step 1: 写失败测试**

创建 `tests/scripts/style-prefix.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { findPrefixViolations } from '../../scripts/style-prefix'

describe('findPrefixViolations', () => {
  it('合规的类名不报', () => {
    const css = '.ew-my-list { display: flex; }\n.ew-my-list__head { gap: 8px; }'
    expect(findPrefixViolations(css, 'my-list')).toEqual([])
  })

  it('库前缀 el- 放行', () => {
    expect(findPrefixViolations('.el-form-item { max-width: 100%; }', 'my-list')).toEqual([])
  })

  // 这条检查存在的唯一理由：demo 里 hello-vue 与 hello-react 曾经共用 .ew-hello
  it('前缀指向别的组件时报出来', () => {
    expect(findPrefixViolations('.ew-hello { color: red; }', 'hello-vue')).toEqual(['ew-hello'])
  })

  it('裸根类名不算违规', () => {
    expect(findPrefixViolations('.ew-my-list { a: 1 }', 'my-list')).toEqual([])
  })

  it('同名前缀但缺分隔符也算违规 —— ew-hello 不能冒充 ew-hello-vue 的命名空间', () => {
    expect(findPrefixViolations('.ew-hellovue { a: 1 }', 'hello-vue')).toEqual(['ew-hellovue'])
  })

  it('只扫选择器，声明里的点号不算类名', () => {
    expect(findPrefixViolations('.ew-my-list { content: ".other"; }', 'my-list')).toEqual([])
  })

  it('@media 里的选择器照样扫，@media 自身的条件文本不当选择器', () => {
    const css = '@media (min-width: 600px) { .ew-my-list { a: 1 } .other { b: 2 } }'
    expect(findPrefixViolations(css, 'my-list')).toEqual(['other'])
  })

  it('注释里的花括号不影响括号配对', () => {
    const css = '/* { .other } */\n.ew-my-list { a: 1 }'
    expect(findPrefixViolations(css, 'my-list')).toEqual([])
  })

  it('去重后按出现顺序返回', () => {
    const css = '.b { a: 1 }\n.a { a: 1 }\n.b { c: 2 }'
    expect(findPrefixViolations(css, 'my-list')).toEqual(['b', 'a'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test -- style-prefix
```

预期：FAIL，`Failed to resolve import "../../scripts/style-prefix"`。

- [ ] **Step 3: 实现**

创建 `scripts/style-prefix.ts`：

```ts
/**
 * 组件样式的类名必须落在自己的命名空间里。
 *
 * 这条检查存在的唯一理由是「不影响其他组件」这句承诺 —— shadow 模式下各写各的没人管，
 * 一旦落到 light DOM（框架产物，或组件自己的 disable-shadow 模式），同页两个组件用了
 * 同一个类名就是直接互相覆盖。demo 里的 hello-vue 与 hello-react 共用 `.ew-hello` 正是
 * 这种情形，构建必须拦住它，而不是靠人自觉。
 */

/** 非本组件但允许出现的类名前缀：UI 库自己的类名 */
const LIBRARY_PREFIXES = ['el-']

/** 去掉注释，避免注释里的花括号干扰配对 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 取出所有选择器文本：每个 `{` 之前那段就是它的选择器，`@` 开头的是 at 规则的条件
 * 而不是选择器。用这种括号配对而不是正则匹配 `{...}`，是为了让 `@media` 块里嵌套的
 * 选择器也能被扫到 —— 只按顶层切会把它们整段漏掉。
 */
function selectorsOf(css: string): string[] {
  const out: string[] = []
  let buffer = ''
  for (const char of stripComments(css)) {
    if (char === '{') {
      const text = buffer.trim()
      if (text !== '' && !text.startsWith('@')) out.push(text)
      buffer = ''
    } else if (char === '}') {
      buffer = ''
    } else {
      buffer += char
    }
  }
  return out
}

/**
 * 返回该 CSS 里所有不属于 `name` 命名空间的类名，去重并保持出现顺序。
 *
 * 命名空间靠分隔符界定：`ew-my-list` 放行 `ew-my-list__head`、`ew-my-list--active`、
 * `ew-my-list-filters`，但 `ew-hellovue` 对 `hello-vue` 不算 —— 缺了分隔符就只是
 * 名字碰巧长在一起。
 */
export function findPrefixViolations(css: string, name: string): string[] {
  const base = `ew-${name}`
  const inNamespace = (token: string): boolean =>
    token === base ||
    token.startsWith(`${base}__`) ||
    token.startsWith(`${base}--`) ||
    token.startsWith(`${base}-`)

  const violations = new Set<string>()
  for (const selector of selectorsOf(css)) {
    for (const match of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      const token = match[1] as string
      if (inNamespace(token)) continue
      if (LIBRARY_PREFIXES.some((prefix) => token.startsWith(prefix))) continue
      violations.add(token)
    }
  }
  return [...violations]
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm run test -- style-prefix
```

预期：PASS（9 条）。

- [ ] **Step 5: 修掉 demo 里两处撞车**

`src/workspaces/demo/components/hello-vue/Component.vue`，把模板里的根按钮改成：

```html
<template>
  <button class="ew-hello-vue" type="button" @click="handleClick">{{ label }}</button>
</template>
```

`src/workspaces/demo/components/hello-vue/style.scss`，把两处 `.ew-hello` 改成 `.ew-hello-vue`（`.ew-hello` 与 `.ew-hello:hover`）。

`src/workspaces/demo/components/hello-react/Component.tsx`，把 `className="ew-hello"` 改成 `className="ew-hello-react"`。

`src/workspaces/demo/components/hello-react/style.scss`，把两处 `.ew-hello` 改成 `.ew-hello-react`。

`tests/e2e/smoke.spec.ts` 里有 5 处 `querySelector('.ew-hello')`，必须一起改，否则 e2e 直接红：

| 行 | 现在 | 改成 |
|---|---|---|
| 51 | `vue.querySelector('.ew-hello')` | `.ew-hello-vue` |
| 52 | `react.querySelector('.ew-hello')` | `.ew-hello-react` |
| 79 | `shadowRoot!.querySelector<HTMLButtonElement>('.ew-hello')` | `.ew-hello-vue` |
| 91 | `el.querySelector('.ew-hello')`（`#light-el` 是 `ew-hello-vue`） | `.ew-hello-vue` |
| 105 | `shadowRoot!.querySelector('.ew-hello')` | `.ew-hello-vue` |

改完用下面这条命令确认没有漏网的（注意排除 `docs/.vitepress/dist` 那份构建产物）：

```bash
grep -rn "\.ew-hello\b" src tests docs/guide devtools 2>/dev/null | grep -v "ew-hello-vue\|ew-hello-react"
```

预期：无输出。标签名 `ew-hello-vue` 本身不受影响，`grep "ew-hello"` 会命中一堆，所以这条查的是**带点号的类名**。

- [ ] **Step 6: 接进构建管线**

`scripts/build.ts`：

顶部 import 区加：

```ts
import { compile } from 'sass'
```

`ComponentInfo` 接口加一个字段：

```ts
interface ComponentInfo {
  name: string
  workspace: string
  dir: string
  framework: 'vue' | 'react'
  /** 样式文件名，两种后缀都由构建期探测，别处不再各自猜一遍 */
  styleFile: string
}
```

`discoverComponents()` 里，在 `for (const required of ['meta.ts', 'index.ts', 'define.ts'])` 那个循环之后加：

```ts
      const styleFiles = ['style.scss', 'style.css'].filter((f) => existsSync(join(dir, f)))
      if (styleFiles.length !== 1) {
        throw new Error(
          `[build] ${name} 必须且只能有一个 style.scss 或 style.css（当前 ${styleFiles.length} 个）`,
        )
      }
      const styleFile = styleFiles[0] as string
```

并把最后的 push 改成：

```ts
      components.push({ name, workspace, dir, framework: hasVue ? 'vue' : 'react', styleFile })
```

在 `writeGeneratedEntries` 之前加一个新函数：

```ts
/**
 * 组件样式的类名必须落在自己的命名空间里，否则落到 light DOM 就会互相覆盖。
 * 拦在构建里而不是写进文档，理由见 scripts/style-prefix.ts。
 */
function checkStylePrefixes(components: ComponentInfo[]): void {
  const failures: string[] = []

  for (const c of components) {
    const path = join(c.dir, c.styleFile)
    const source = readFileSync(path, 'utf8')
    // Tailwind 的 preflight 是一份全局 reset，与「不影响其他组件」在 light DOM 下天然
    // 冲突，它的类名也无法用前缀约束（见框架产物设计文档）。跳过。
    if (source.includes('@import "tailwindcss"')) continue

    const { css } = compile(path, { loadPaths: [workspacesDir] })
    for (const token of findPrefixViolations(css, c.name)) {
      failures.push(
        `${c.workspace}/${c.name} 的样式里出现类名 ".${token}"，应以 ".ew-${c.name}" 为前缀`,
      )
    }
  }

  if (failures.length > 0) {
    throw new Error(`[build] 组件样式类名未按组件名加前缀：\n  ${failures.join('\n  ')}`)
  }
}
```

import 区加：

```ts
import { findPrefixViolations } from './style-prefix.ts'
```

`main()` 里在 `const components = discoverComponents()` 与「发现 N 个组件」那句之间插一行：

```ts
  checkStylePrefixes(components)
```

- [ ] **Step 7: 确认构建通过**

```bash
pnpm run build
```

预期：绿。若报类名前缀违规，说明 Step 5 有漏改的组件。

再确认检查真的在工作——临时把 `hello-vue/style.scss` 里一处 `.ew-hello-vue` 改回 `.ew-hello`：

```bash
pnpm run build
```

预期：FAIL，报 `demo/hello-vue 的样式里出现类名 ".ew-hello"，应以 ".ew-hello-vue" 为前缀`。**改回来**。

- [ ] **Step 8: 提交**

```bash
git add scripts/style-prefix.ts scripts/build.ts tests/scripts/style-prefix.test.ts \
  src/workspaces/demo/components/hello-vue src/workspaces/demo/components/hello-react \
  tests/e2e/smoke.spec.ts
git commit -m "feat(build): 组件样式类名必须按组件名加前缀，并修掉 demo 里的撞车"
```

---

### Task 3: 脚手架生成按组件名命名的根类

**Files:**
- Modify: `scripts/new-component.ts`
- Test: `tests/scripts/new-component.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/scripts/new-component.test.ts` 的 `describe('createComponent · 基础骨架')` 里追加：

```ts
  it('Vue 组件根元素用 ew-<组件名> 作类名，不用共享的 ew-root', () => {
    createComponent(root, spec())
    expect(read('my-card', 'Component.vue')).toContain('class="ew-my-card"')
    expect(read('my-card', 'Component.vue')).not.toContain('ew-root')
  })

  it('React 组件同理', () => {
    createComponent(root, spec({ framework: 'react' }))
    expect(read('my-card', 'Component.tsx')).toContain('className="ew-my-card"')
    expect(read('my-card', 'Component.tsx')).not.toContain('ew-root')
  })
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test -- new-component
```

预期：FAIL，实际拿到的是 `class="ew-root"`。

- [ ] **Step 3: 实现**

`scripts/new-component.ts` 的 `plainVueComponent` 里，把 `class="ew-root"` 改成 `class="ew-${spec.name}"`：

```ts
<template>
  <button class="ew-${spec.name}" type="button" @click="handleClick">
    {{ props.label ?? '${spec.name}' }}
  </button>
</template>
```

`plainReactComponent` 里把 `className="ew-root"` 改成 `className="ew-${spec.name}"`：

```tsx
    <button
      type="button"
      className="ew-${spec.name}"
      onClick={() => emit('select', { source: '${spec.name}', label })}
    >
```

> 用了 UI 库的两个模板（`elementPlusComponent` / `antDesignVueComponent` / `antdComponent`）渲染的是库组件、不带自己的类名，不需要改。它们的样式命名留给作者按 Task 2 的检查约束。

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm run test -- new-component
```

预期：PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/new-component.ts tests/scripts/new-component.test.ts
git commit -m "feat(new:component): 根元素类名改用 ew-<组件名>，不再共用 ew-root"
```

---

### Task 4: 包装组件生成器

**Files:**
- Create: `scripts/framework-entries.ts`
- Test: `tests/scripts/framework-entries.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `tests/scripts/framework-entries.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  barrelSource,
  hostClassOf,
  reactWrapperSource,
  vueWrapperSource,
  type FrameworkComponent,
} from '../../scripts/framework-entries'

function component(overrides: Partial<FrameworkComponent> = {}): FrameworkComponent {
  return {
    name: 'hello-vue',
    workspace: 'demo',
    framework: 'vue',
    styleFile: 'style.scss',
    meta: { tag: 'ew-hello-vue', events: ['select'], props: { name: { type: 'string' } } },
    ...overrides,
  }
}

describe('hostClassOf', () => {
  it('宿主类名由组件名派生', () => {
    expect(hostClassOf('my-list')).toBe('ew-my-list-host')
  })
})

describe('vueWrapperSource', () => {
  const source = vueWrapperSource(component())

  it('从组件目录直接引源码，不经过 index.ts（那会把 createElementClass 拖进来）', () => {
    expect(source).toContain("from '../../workspaces/demo/components/hello-vue/Component.vue'")
    expect(source).not.toContain("index'")
  })

  it('样式按 ?inline 引，并在模块顶层改写好 :host', () => {
    expect(source).toContain("import rawCss from '../../workspaces/demo/components/hello-vue/style.scss?inline'")
    expect(source).toContain("rewriteHost(rawCss, '.ew-hello-vue-host')")
  })

  it('导出名是 PascalCase', () => {
    expect(source).toContain('export const HelloVue = defineComponent(')
  })

  it('emits 取自 meta.events，这样派发不会触发 Vue 的未声明事件警告', () => {
    expect(source).toContain("emits: ['select']")
  })

  it('渲染一层带宿主类的 div，并把 attrs 透传给内层组件', () => {
    expect(source).toContain("h('div', { class: 'ew-hello-vue-host' }")
    expect(source).toContain('h(Component as never, { ...attrs }, slots)')
  })

  it('inheritAttrs 关掉 —— 否则 attrs 会同时落到宿主 div 与内层组件上', () => {
    expect(source).toContain('inheritAttrs: false')
  })

  it('包装层提供 EW_EMIT_KEY，把 emit 接到原生 v-on 上', () => {
    expect(source).toContain('provide(EW_EMIT_KEY, (name: string, detail?: unknown) => emit(name, detail))')
  })

  it('props 类型从 meta.props 生成', () => {
    expect(source).toContain('export interface HelloVueProps {')
    expect(source).toContain('  name?: string')
  })

  it('object / array 退化成宽松类型', () => {
    const src = vueWrapperSource(
      component({ meta: { tag: 'x', props: { data: { type: 'object' }, list: { type: 'array' } } } }),
    )
    expect(src).toContain('data?: Record<string, unknown>')
    expect(src).toContain('list?: unknown[]')
  })

  it('没有 props 时仍生成一个空接口，消费方 import 得到的东西不会是 undefined', () => {
    const src = vueWrapperSource(component({ meta: { tag: 'x' } }))
    expect(src).toContain('export interface HelloVueProps {}')
  })
})

describe('reactWrapperSource', () => {
  const source = reactWrapperSource(
    component({ name: 'hello-react', framework: 'react', meta: { tag: 'ew-hello-react', events: ['select'] } }),
  )

  it('不写 JSX —— 生成物是 .ts，交给 react() 插件编译会白搭', () => {
    expect(source).not.toContain('<div')
    expect(source).toContain("'div'")
    expect(source).toContain("{ className: 'ew-hello-react-host' }")
  })

  it('事件名映射到 React 的 onXxx 约定', () => {
    expect(source).toContain("'select': 'onSelect'")
  })

  // useLayoutEffect 而不是 useEffect：它在 paint 之前同步跑完，首帧就已经带上样式，
  // 不会先闪一下无样式的按钮。
  it('挂载后注入样式，且在 paint 之前', () => {
    expect(source).toContain('useLayoutEffect(() => applyGlobalStyles(css), [])')
  })

  it('用 EwEmitContext 而不是 EW_EMIT_KEY', () => {
    expect(source).toContain('EwEmitContext.Provider')
  })
})

describe('barrelSource', () => {
  it('只导出该框架的组件', () => {
    const src = barrelSource(
      [
        component({ name: 'a-one', framework: 'vue' }),
        component({ name: 'b-two', framework: 'react' }),
      ],
      'vue',
    )
    expect(src).toContain("export { AOne } from './a-one'")
    expect(src).not.toContain('BTwo')
  })

  it('没有该框架的组件时是一个合法的空模块', () => {
    expect(barrelSource([], 'react').trim()).toBe('export {}')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test -- framework-entries
```

预期：FAIL，`Failed to resolve import "../../scripts/framework-entries"`。

- [ ] **Step 3: 实现**

创建 `scripts/framework-entries.ts`：

```ts
import { toIdentifier } from '@ew/utils'
import type { ComponentMeta, PropType } from '@ew/runtime'

export interface FrameworkComponent {
  name: string
  workspace: string
  framework: 'vue' | 'react'
  /** 样式文件名，由构建期从组件目录里探测 */
  styleFile: string
  meta: ComponentMeta
}

/**
 * 包装组件渲染的那层 div 的类名，也是 `:host` 的改写目标。
 *
 * 为什么是额外一层 div 而不是把类挂到组件自己的根元素上：my-list 的根 `<section>` 已经
 * 带 `class="ew-my-list"`，样式里同时有 `:host { display: block }` 和
 * `.ew-my-list { display: flex }`，两条落到同一个元素上，display 谁赢全看顺序。
 * 这层 div 的角色与 WC 模式里的自定义元素宿主完全等价，height: 100% 的传递链一模一样。
 */
export function hostClassOf(name: string): string {
  return `ew-${name}-host`
}

/** 组件源码目录，相对于 src/.generated/framework/ */
function sourcePath(c: FrameworkComponent): string {
  return `../../workspaces/${c.workspace}/components/${c.name}`
}

function tsTypeOf(type: PropType): string {
  switch (type) {
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'object':
      return 'Record<string, unknown>'
    case 'array':
      return 'unknown[]'
    case 'function':
      return '(...args: unknown[]) => unknown'
  }
}

/**
 * props 类型从 meta.props 生成，精度不如组件自己的声明（object 退化成 Record），
 * 但足够让消费方拿到补全。要做到精确得去解 Vue 的 defineProps<{...}>，那是另一期的事。
 *
 * `body.join('\n')` 在空数组时得到空串，会拼出 `{\n\n}` —— 合法但难看；没有 props 时直接
 * 出 `{}`。这条分支真的会走到：hello-react 那种干净组件之外，新建的组件也可能没有 props。
 */
function propsInterface(c: FrameworkComponent): string {
  const body = Object.entries(c.meta.props ?? {}).map(
    ([name, def]) => `  ${name}?: ${tsTypeOf(def.type)}`,
  )
  const block = body.length === 0 ? '{}' : `{\n${body.join('\n')}\n}`
  return `export interface ${toIdentifier(c.name)}Props ${block}\n\n`
}

export function vueWrapperSource(c: FrameworkComponent): string {
  const id = toIdentifier(c.name)
  const host = hostClassOf(c.name)
  const events = (c.meta.events ?? []).map((event) => `'${event}'`).join(', ')

  return `import { defineComponent, h, provide } from 'vue'
import { EW_EMIT_KEY, applyGlobalStyles, rewriteHost } from '@ew/runtime'
import Component from '${sourcePath(c)}/Component.vue'
import rawCss from '${sourcePath(c)}/${c.styleFile}?inline'
${propsInterface(c)}const css = rewriteHost(rawCss, '.${host}')

export const ${id} = defineComponent({
  name: '${id}',
  // attrs 要落到内层组件上（那里才是视觉根），不关掉的话它会被同时贴到宿主 div 上
  inheritAttrs: false,
  emits: [${events}],
  setup(_props, { attrs, emit, slots }) {
    // 挂载时注入而不是模块顶层：未用到的组件会被 tree-shake 掉，样式不跟着进包。
    // 顶层注入要让 package.json 写 sideEffects: false 才摇得掉，那个字段写错会整包丢样式。
    applyGlobalStyles(css)
    provide(EW_EMIT_KEY, (name: string, detail?: unknown) => emit(name, detail))
    return () => h('div', { class: '${host}' }, [h(Component as never, { ...attrs }, slots)])
  },
})
`
}

export function reactWrapperSource(c: FrameworkComponent): string {
  const id = toIdentifier(c.name)
  const host = hostClassOf(c.name)
  const mapping = (c.meta.events ?? [])
    .map((event) => `  '${event}': 'on${event.charAt(0).toUpperCase()}${event.slice(1)}',`)
    .join('\n')

  return `import { createElement, useLayoutEffect } from 'react'
import { EwEmitContext, applyGlobalStyles, rewriteHost } from '@ew/runtime'
import Component from '${sourcePath(c)}/Component'
import rawCss from '${sourcePath(c)}/${c.styleFile}?inline'
${propsInterface(c)}const css = rewriteHost(rawCss, '.${host}')

const EVENT_PROPS: Record<string, string> = {
${mapping}
}

export function ${id}(props: ${id}Props): ReturnType<typeof createElement> {
  // 挂载时注入而不是模块顶层：未用到的组件会被 tree-shake 掉，样式不跟着进包。
  // useLayoutEffect 而非 useEffect —— 在 paint 之前同步跑完，首帧就带样式。
  useLayoutEffect(() => applyGlobalStyles(css), [])

  const emit = (name: string, detail?: unknown): void => {
    const key = EVENT_PROPS[name]
    const handler = key === undefined ? undefined : (props as Record<string, unknown>)[key]
    if (typeof handler === 'function') (handler as (detail: unknown) => void)(detail)
  }

  return createElement(
    'div',
    { className: '${host}' },
    // React 没有 attrs 透传，props 原样交给内层组件 —— 它的函数签名就是契约
    createElement(EwEmitContext.Provider, { value: emit }, createElement(Component, props as never)),
  )
}
`
}

/**
 * 桶文件。`src/.generated/framework/` 下每个组件一个文件、两个框架各一个桶。
 * 桶名固定为 index-vue / index-react，与组件名理论上有撞的可能，但组件名要叫
 * "index-vue" 才会发生 —— 与现有 all.ts 是同一量级的风险，不值得为它加前缀。
 */
export function barrelSource(components: FrameworkComponent[], framework: 'vue' | 'react'): string {
  const lines = components
    .filter((c) => c.framework === framework)
    .map((c) => `export { ${toIdentifier(c.name)} } from './${c.name}'`)
  return lines.length > 0 ? `${lines.join('\n')}\n` : 'export {}\n'
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm run test -- framework-entries
```

预期：PASS（17 条）。若 `ReturnType<typeof createElement>` 在类型检查上报错，改成 `ReactElement` 并相应调整 import —— 这一步只影响生成物的类型标注，不影响运行。

- [ ] **Step 5: 提交**

```bash
git add scripts/framework-entries.ts tests/scripts/framework-entries.test.ts
git commit -m "feat(build): 框架包装组件的源码生成器"
```

---

### Task 5: framework 构建目标

**Files:**
- Modify: `scripts/build.ts`

- [ ] **Step 1: 接上 meta 与入口生成**

`scripts/build.ts` 顶部 import 区加：

```ts
import { pathToFileURL } from 'node:url'
import { barrelSource, reactWrapperSource, vueWrapperSource, type FrameworkComponent } from './framework-entries.ts'
import type { ComponentMeta } from '@ew/runtime'
```

（`fileURLToPath` 已经 import 过了，`pathToFileURL` 是新加的，两者来自同一个模块，合并成一行 import。）

在 `writeGeneratedEntries` 上方加：

```ts
/**
 * 框架产物要 meta 里的 props 与 events（事件名、生成的类型全靠它），所以这里真的把
 * meta.ts 当模块加载一遍。必须走 pathToFileURL：裸绝对路径在 ESM 里不是合法说明符，
 * macOS 上碰巧能过、Windows 上会炸。
 */
async function loadFrameworkComponents(
  components: ComponentInfo[],
): Promise<FrameworkComponent[]> {
  const out: FrameworkComponent[] = []

  for (const c of components) {
    const stylePath = join(c.dir, c.styleFile)
    // Tailwind 的 preflight 是全局 reset，与 light DOM 下「不影响其他组件」天然冲突，
    // 它的类名也无法用前缀约束 —— 这类组件不出框架产物，只出 WC。
    if (readFileSync(stylePath, 'utf8').includes('@import "tailwindcss"')) {
      console.log(`[build] ${c.name} 用了 Tailwind，跳过框架产物`)
      continue
    }

    const mod = (await import(pathToFileURL(join(c.dir, 'meta.ts')).href)) as {
      default: ComponentMeta
    }
    out.push({
      name: c.name,
      workspace: c.workspace,
      framework: c.framework,
      styleFile: c.styleFile,
      meta: mod.default,
    })
  }

  return out
}
```

`writeGeneratedEntries` 的签名与实现改成：

```ts
function writeGeneratedEntries(
  components: ComponentInfo[],
  frameworkComponents: FrameworkComponent[],
): void {
  rmSync(generatedDir, { recursive: true, force: true })
  mkdirSync(generatedDir, { recursive: true })
  mkdirSync(join(generatedDir, 'framework'), { recursive: true })

  // 生成文件在 src/.generated/，故相对路径要从 src/ 往下写
  const entryPath = (c: ComponentInfo) =>
    `../workspaces/${c.workspace}/components/${c.name}/index`

  const allLines = components.map(
    (c) => `export * as ${toIdentifier(c.name)} from '${entryPath(c)}'`,
  )
  writeFileSync(join(generatedDir, 'all.ts'), `${allLines.join('\n')}\n`)

  const defineLines = components.map(
    (c, i) => `import { register as r${i} } from '${entryPath(c)}'`,
  )
  defineLines.push('', components.map((_, i) => `r${i}()`).join('\n'), '')
  writeFileSync(join(generatedDir, 'all-define.ts'), `${defineLines.join('\n')}\n`)

  for (const c of frameworkComponents) {
    const source = c.framework === 'vue' ? vueWrapperSource(c) : reactWrapperSource(c)
    writeFileSync(join(generatedDir, 'framework', `${c.name}.ts`), source)
  }
  writeFileSync(
    join(generatedDir, 'framework', 'index-vue.ts'),
    barrelSource(frameworkComponents, 'vue'),
  )
  writeFileSync(
    join(generatedDir, 'framework', 'index-react.ts'),
    barrelSource(frameworkComponents, 'react'),
  )
}
```

- [ ] **Step 2: 加构建函数**

在 `buildCdn` 之后加：

```ts
/** 宿主框架自己带一份，打进产物会让 provide/inject 与 hooks 双双失效 */
const frameworkExternals = ['vue', 'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']

const elementPlusCssSpec = 'element-plus/dist/index.css'

/**
 * 组件库样式单独出一个入口，让「宿主已有 EP」的项目可以不引。
 *
 * 必须裹 `@layer`：EP 的 `:root` 里除了 `--el-*` 还带一句 `color-scheme: light`，
 * 不分层注入会把宿主的深色主题连同原生控件一起翻成浅色。分层之后它是一份默认值，
 * 宿主自己写的未分层规则永远赢；宿主完全没引 EP 时这层才顶上来。
 * 与 packages/runtime/src/style.ts 里那份 head 副本是同一个理由。
 */
function writeElementPlusCss(): void {
  const path = fileURLToPath(import.meta.resolve(elementPlusCssSpec))
  const raw = readFileSync(path, 'utf8')
  // @charset 必须排在文件最前，裹进 @layer 块里就失效了 —— 提到块外
  const charset = /^@charset\s+"[^"]*";\s*/.exec(raw)?.[0] ?? ''
  const body = raw.slice(charset.length)
  writeFileSync(
    join(root, 'dist/framework/element-plus.css'),
    `${charset}@layer ew {\n${body}\n}\n`,
  )
}

async function buildFramework(frameworkComponents: FrameworkComponent[]): Promise<void> {
  await build({
    root,
    configFile: false,
    // 这里**不能**挂 vueAlias：别名会把裸说明符 `vue` 改写成 vue/dist/...，
    // 而 external 匹配的是改写前的说明符，两边一错开 vue 就被打进产物 ——
    // 那正是本文件里 check:artifacts 要拦的东西，别在源头制造它。
    css: cssConfig,
    plugins: sharedPlugins(),
    build: {
      target: 'es2020',
      outDir: 'dist/framework',
      emptyOutDir: true,
      minify: 'esbuild',
      rollupOptions: { external: frameworkExternals },
      lib: {
        entry: {
          vue: join(generatedDir, 'framework/index-vue.ts'),
          react: join(generatedDir, 'framework/index-react.ts'),
        },
        formats: ['es'],
        fileName: (_format, entryName) => `${entryName}.js`,
      },
    },
  })

  writeElementPlusCss()
}
```

- [ ] **Step 3: 接线**

`writeExportsField()` 里的 `pkg.exports` 改成（新增三条精确键，其余不动）：

```ts
  pkg.exports = {
    './tokens.css': './src/tokens/tokens.css',
    '.': './dist/esm/index.js',
    './vue': './dist/framework/vue.js',
    './react': './dist/framework/react.js',
    './element-plus.css': './dist/framework/element-plus.css',
    './cdn/*': './dist/cdn/*.js',
    './*': './dist/esm/*.js',
  }
```

`main()` 改成：

```ts
async function main(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
  if (only && only !== 'esm' && only !== 'cdn' && only !== 'framework') {
    throw new Error(`[build] --only 只接受 esm、cdn 或 framework，收到 "${only}"`)
  }

  const components = discoverComponents()
  if (components.length === 0) throw new Error('[build] 未发现任何组件')

  console.log(
    `[build] 发现 ${components.length} 个组件：` +
      components.map((c) => `${c.workspace}/${c.name}`).join(', '),
  )

  checkStylePrefixes(components)

  if (!only) rmSync(join(root, 'dist'), { recursive: true, force: true })

  const frameworkComponents = await loadFrameworkComponents(components)
  writeGeneratedEntries(components, frameworkComponents)

  if (!only || only === 'esm') {
    console.log('[build] 构建 ESM 产物...')
    await buildEsm(components)
  }

  if (!only || only === 'cdn') {
    console.log('[build] 构建 CDN（IIFE）产物...')
    await buildCdn(components)
  }

  if (!only || only === 'framework') {
    console.log('[build] 构建框架产物...')
    await buildFramework(frameworkComponents)
  }

  writeExportsField()
  reportSizes()

  console.log('[build] 完成')
}
```

`reportSizes()` 只 walk `dist` 下的 `.js`，框架产物已覆盖；Element Plus 那份 css 不计入，没关系。

- [ ] **Step 4: 构建并肉眼确认产物**

```bash
pnpm run build
```

预期：绿，`产物体积` 列表里多出 `dist/framework/vue.js` 与 `dist/framework/react.js`，两者都应是几十 KB 以内（包装层而已；Vue 那份因为外部化了 vue 会明显更小）。

```bash
head -c 300 dist/framework/vue.js; echo; echo '--- css 头 ---'; head -c 80 dist/framework/element-plus.css
ls -la dist/framework/
```

预期：`vue.js` 里有 `from"vue"` 字样；`element-plus.css` 以 `@layer ew {` 开头；目录下三个文件齐全。

- [ ] **Step 5: 加 peerDependencies**

手动编辑 `package.json`，在 `dependencies` 之前插入：

```json
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vue": "^3.5.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true },
    "react-dom": { "optional": true },
    "vue": { "optional": true }
  },
```

> 两个框架都标 optional：Vue 项目不该因为没装 React 被警告。`writeExportsField()` 只改 `exports` 键，不会动这两块。

- [ ] **Step 6: 提交**

```bash
git add scripts/build.ts
git commit -m "feat(build): 新增 framework 构建目标，输出 vue / react / element-plus.css 三个入口"
```

`package.json` 这次**不要一起提交**：它当前还带着 self-monitor 那批在制品依赖改动，提交要由你自己挑。改动本身已经落盘，不影响构建。

---

### Task 6: 产物守卫与集成测试

**Files:**
- Create: `vitest.integration.config.ts`
- Create: `tests/integration/framework.test.ts`
- Modify: `vitest.config.ts`
- Modify: `tsconfig.json`
- Modify: `scripts/check-artifacts.ts`
- Modify: `package.json`（脚本与 verify）

- [ ] **Step 1: 写守卫测试**

创建 `vitest.integration.config.ts`：

```ts
import { defineConfig } from 'vitest/config'

/**
 * 第二份配置，只跑**构建后**的集成测试。
 *
 * 主配置（vitest.config.ts）的 include 不覆盖这里，且 verify 里 test 排在 build 之前 ——
 * 这些用例 import 的是 dist/framework/*.js，构建没跑过它们必然失败。所以用独立配置 +
 * 独立的 npm script，把它钉在 build 之后。
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/integration/**/*.test.{ts,tsx}'],
    globals: false,
  },
})
```

创建 `tests/integration/framework.test.ts`：

```ts
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

beforeEach(() => {
  document.head.innerHTML = ''
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
    createApp({ render: () => h(HelloVue, {}) }).mount(b)

    expect(document.head.querySelectorAll('style[data-ew-style]')).toHaveLength(1)
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
```

> React 那三条用 `createElement` 而不是 Vue 的 `h` —— 两者产物不同，`h` 造出来的 Vue vnode 交给 `root.render` 会直接抛错。`act` 来自 `react` 而非 `react-dom/test-utils`（React 19 已把它移出来），并把 `IS_REACT_ACT_ENVIRONMENT` 置真，否则控制台会刷警告。

- [ ] **Step 2: 把集成测试排除出主测试与类型检查**

`vitest.config.ts` 的 `test` 块改成：

```ts
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    // tests/integration 只用 vitest.integration.config.ts 跑：它 import 的是构建产物，
    // 排在 build 之前必然失败。
    exclude: ['**/node_modules/**', 'tests/integration/**'],
    globals: false,
  },
```

`tsconfig.json` 的 `include` 那一行之后加一行 `exclude`：

```json
  "include": ["*.config.ts", "src", "docs", "tests", "scripts", "packages", "devtools"],
  "exclude": ["tests/integration"]
```

**这一步不能省。** `include` 里有 `tests`，而 `tests/integration/framework.test.ts` 引的是
`../../dist/framework/vue.js` —— 那是构建产物，没有 `.d.ts`，`allowJs` 也没开。`vue-tsc --noEmit`
会直接报 `TS2307: Cannot find module`，把 `verify` 的第一步打红，而这一步排在 `build` 之前，
产物此刻可能压根不存在。这类文件本来也不该被类型检查：它验的是运行时行为，且导入的符号在
类型上只能是 `any`。

- [ ] **Step 3: 加脚本**

`package.json` 的 `scripts` 里，在 `"check:artifacts"` 之后加：

```json
    "check:framework": "vitest run --config vitest.integration.config.ts",
```

并把 `verify` 改成：

```json
    "verify": "pnpm run typecheck && pnpm run test && pnpm run build && pnpm run check:artifacts && pnpm run check:framework && pnpm run docs:build && pnpm run test:e2e"
```

- [ ] **Step 4: 跑集成测试**

```bash
pnpm run build && pnpm run check:framework
```

预期：7 条 PASS。若报 `Cannot find module '../../dist/framework/vue.js'`，说明 build 没成功或 `--only` 漏了 framework。

- [ ] **Step 5: 扩展 check:artifacts**

`scripts/check-artifacts.ts` 里，`MARKER` 下面加：

```ts
/**
 * 框架产物的守卫。两件事：
 *
 * 1. 宿主框架**不能**被打进去 —— 两份 Vue 会让 provide/inject 对不上，两份 React 会让
 *    hooks 报错。这里沿用 CDN 那套「自家标记恰好出现 N 次」的思路，只是框架产物里
 *    期望值是 0（说明符被 external 掉之后，运行时代码一个字都不该在）。
 * 2. 包装层不该把适配器拖进来 —— `@ew/runtime` 的桶同时导出两个适配器，只引
 *    EW_EMIT_KEY / EwEmitContext 时另一个应当被摇掉。react-dom 只被 reactAdapter 用到，
 *    它的出现就是没摇干净的证据。
 */
function checkFramework(failures: string[]): void {
  const dir = join(root, 'dist/framework')

  for (const [file, marker] of [
    ['vue.js', '__isVue'],
    ['react.js', 'react-dom'],
  ] as const) {
    const path = join(dir, file)
    if (!existsSync(path)) {
      failures.push(`缺少框架产物 dist/framework/${file}`)
      continue
    }
    const code = readFileSync(path, 'utf8')
    const hits = count(code, marker)
    if (hits !== 0) {
      failures.push(`dist/framework/${file} 里出现 ${marker} ${hits} 次，框架运行时不该被打进产物`)
    }
    const framework = file === 'vue.js' ? 'vue' : 'react'
    if (!new RegExp(`from\\s*["']${framework}["']`).test(code)) {
      failures.push(`dist/framework/${file} 里没有对 ${framework} 的裸导入，external 没生效`)
    }
  }

  if (!existsSync(join(dir, 'element-plus.css'))) {
    failures.push('缺少 dist/framework/element-plus.css')
  }
}
```

`checkExports` 的 `wanted` 数组里加三条：

```ts
  const wanted = [
    PKG,
    `${PKG}/tokens.css`,
    `${PKG}/vue`,
    `${PKG}/react`,
    `${PKG}/element-plus.css`,
    `${PKG}/cdn/ew-all`,
    ...components.flatMap((c) => [
      `${PKG}/${c.name}`,
      `${PKG}/${c.name}/define`,
      `${PKG}/cdn/${c.name}`,
    ]),
  ]
```

`main()` 里在 `checkExports(components, failures)` 之后加：

```ts
  checkFramework(failures)
```

- [ ] **Step 6: 确认守卫能拦**

```bash
pnpm run check:artifacts
```

预期：两行「产物隔离正常」「exports 契约正常」，无失败。

反向确认一次——临时把 `scripts/build.ts` 里 `buildFramework` 的
`rollupOptions: { external: frameworkExternals }` 整行注释掉：

```bash
pnpm exec tsx scripts/build.ts --only=framework
pnpm run check:artifacts
```

预期：FAIL，报 `dist/framework/vue.js 里出现 __isVue N 次，框架运行时不该被打进产物`。
**改回来，再 `pnpm run build` 重建**（`--only=framework` 会 `emptyOutDir` 掉 dist/framework，
不重建的话后面 `check:framework` 与 e2e 都会红）。

- [ ] **Step 7: 提交**

```bash
git add vitest.integration.config.ts tests/integration vitest.config.ts tsconfig.json scripts/check-artifacts.ts
git commit -m "test(framework): 构建后守卫与 jsdom 集成测试，覆盖两个框架"
```

`package.json` 这次同样不要提交（在制品混在一起）。

---

### Task 7: 真实浏览器里跑一遍 Vue 框架产物

**Files:**
- Create: `tests/e2e/fixture/framework.html`
- Create: `tests/e2e/framework.spec.ts`

- [ ] **Step 1: 写页面**

创建 `tests/e2e/fixture/framework.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>EW 框架产物冒烟</title>
    <link rel="stylesheet" href="/src/tokens/tokens.css" />
    <!--
      产物里的 `import ... from "vue"` 是裸说明符，静态服务器没有打包器解析它。
      import map 是这个页面里唯一能把它接上的办法，也让这条用例真正做到「用一个真实
      浏览器跑真实产物」。React 侧没有浏览器可用的 ESM 构建（上游只发 CJS），
      那条路由 tests/integration/framework.test.ts 在 jsdom 里覆盖。
    -->
    <script type="importmap">
      {
        "imports": {
          "vue": "/node_modules/vue/dist/vue.runtime.esm-browser.prod.js"
        }
      }
    </script>
  </head>
  <body>
    <div id="app"></div>
    <p id="log">（还没点）</p>

    <script type="module">
      import { createApp, h, ref } from 'vue'
      import { HelloVue } from '/dist/framework/vue.js'

      const log = ref('（还没点）')
      const app = createApp({
        render: () =>
          h('div', { id: 'root' }, [
            h(HelloVue, {
              name: '浏览器',
              count: 2,
              onSelect: (detail) => {
                log.value = JSON.stringify(detail)
              },
            }),
          ]),
      })
      app.mount('#app')

      // 把响应式日志写到 DOM 上供断言读取
      const tick = () => {
        document.getElementById('log').textContent = log.value
        requestAnimationFrame(tick)
      }
      tick()
    </script>
  </body>
</html>
```

- [ ] **Step 2: 写用例**

创建 `tests/e2e/framework.spec.ts`：

```ts
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/fixture/framework.html')
})

test('框架产物在真实浏览器里挂载出宿主 div 与组件内容', async ({ page }) => {
  await expect(page.locator('#root .ew-hello-vue-host')).toHaveCount(1)
  await expect(page.locator('#root button')).toHaveText('Vue 组件：浏览器 × 2')
})

test('@select 走原生 v-on，onSelect 收到 detail', async ({ page }) => {
  await page.locator('#root button').click()
  await expect(page.locator('#log')).toHaveText('{"source":"hello-vue","name":"浏览器"}')
})

test('样式注入到 head，且没有留下 :host', async ({ page }) => {
  const style = await page.evaluate(() => {
    const el = document.querySelector('style[data-ew-style]')
    return el === null ? null : (el.textContent ?? '')
  })
  expect(style).not.toBeNull()
  expect(style).toContain('.ew-hello-vue-host')
  expect(style).not.toContain(':host')
})
```

- [ ] **Step 3: 跑**

```bash
pnpm run build && pnpm run test:e2e
```

预期：12 条 PASS（原有 9 + 新增 3）。

> 若报 `Failed to load script ... /dist/framework/vue.js`，先查 4173 是否被残留进程占着（`lsof -i :4173`）——`reuseExistingServer` 会静默复用它，症状看起来像构建回归。

- [ ] **Step 4: 提交**

```bash
git add tests/e2e/fixture/framework.html tests/e2e/framework.spec.ts
git commit -m "test(e2e): 用 import map 在真实浏览器里跑 Vue 框架产物"
```

---

### Task 8: 文档

**Files:**
- Modify: `docs/guide/authoring.md`
- Modify: `docs/guide/build.md`
- Create: `docs/guide/framework-usage.md`
- Modify: `docs/.vitepress/config.mts`（侧边栏加一项）

- [ ] **Step 1: `authoring.md` 补命名约定**

在「样式：SCSS 与空间共享」一节之后插入：

````markdown
## 类名必须落在组件自己的命名空间里

组件样式的每一个类名都要以 `ew-<组件名>` 打头（UI 库自己的 `el-*` 类除外）：

```scss
.ew-my-list { }            // 根
.ew-my-list__head { }      // BEM 元素
.ew-my-list--active { }    // 修饰符
```

**构建会强制这条规则**，违反直接报错。原因是 shadow 模式关掉之后（框架产物、或组件自己的
`disable-shadow`），样式落到整页，两个组件用了同一个类名就是直接互相覆盖。这条约定没有
「看着差不多就行」的余地。

`new:component` 生成的骨架已经按这条规则命名根元素。
````

- [ ] **Step 2: `build.md` 补框架产物**

`docs/guide/build.md` 的产物路径表（第 9-14 行）里加一行：

```markdown
| `dist/framework/vue.js`、`dist/framework/react.js` | 原生 Vue / React 组件，见下节 |
| `dist/framework/element-plus.css` | 组件库样式，可选引入 |
```

再在「## 引入方式」一节整段之后、「## 体积基线」之前插入一小节：

````markdown
### 框架产物（宿主本来就是 Vue / React 项目时）

上一节那套 Web Component 用法，代价是跨不过框架边界：props 只能走 attribute、事件是
`CustomEvent` 不是 `@select`、用不了宿主的插槽。宿主本来就是 Vue 3 或 React 项目时这些代价
白付 —— 直接用原生组件形态：

```ts
import { MyList } from 'easy-webcomp/vue'
import 'easy-webcomp/element-plus.css'   // 宿主已经引了 Element Plus 就不用引
```

```tsx
import { MyList } from 'easy-webcomp/react'
```

- `easy-webcomp/vue` 只有 `Component.vue` 写的组件，`easy-webcomp/react` 只有 `Component.tsx` 写的。
- 事件按宿主框架的写法接：Vue 用 `@select`，React 用 `onSelect`。
- 组件样式随模块自动注入，不需要逐个引 css；未用到的组件会被 tree-shaking 摇掉。
- **Vue / React 不打进产物**，用的是宿主自己那份。
- 组件库样式（Element Plus）单独一个入口，宿主已有就不必引。
- 顶层挂载的那层 div 带 `class="ew-<组件名>-host"`，要对它设宽高就选这个类。
````

- [ ] **Step 3: 新建 `docs/guide/framework-usage.md`**

```markdown
# 在 Vue / React 项目里使用

宿主是 Vue 3 或 React 项目时，用框架产物比 Web Component 更顺手：props 是真 props、事件是
`@select` / `onSelect`、不经过自定义元素的边界。

## Vue

```vue
<script setup lang="ts">
import { MyList } from 'easy-webcomp/vue'
import 'easy-webcomp/element-plus.css'
import 'easy-webcomp/tokens.css'
</script>

<template>
  <MyList label="我的列表" @select="onSelect" />
</template>
```

## React

```tsx
import { MyList } from 'easy-webcomp/react'
import 'easy-webcomp/element-plus.css'
import 'easy-webcomp/tokens.css'

export function Page() {
  return <MyList label="我的列表" onSelect={(detail) => console.log(detail)} />
}
```

## 样式从哪来

三份，各管各的：

| 来源 | 谁提供 | 不引会怎样 |
|---|---|---|
| 组件自身样式 | 随模块自动注入 | 无 |
| `element-plus.css` | 消费方，宿主已有 EP 就不必引 | 组件里的 EP 组件没样式 |
| `tokens.css` | 消费方 | 退化成本内置的设计默认值，换肤失效 |

组件样式用 `@layer` 之外的普通规则注入，宿主针对组件写的高权重规则能正常覆盖。
`element-plus.css` 则**裹在 `@layer ew` 里**：EP 的 `:root` 带一句 `color-scheme: light`，
不降级会把宿主的深色主题翻成浅色。

## 顶层那层 div

每个包装组件在组件外面渲染一层 `<div class="ew-<组件名>-host">`，它的角色与 Web Component
形态下的自定义元素宿主等价 —— `:host` 规则就落在它上面。要设宽高：

```css
.ew-my-list-host { height: 600px; }
```

## 还没支持的

- **SSR**（Nuxt / Next）：产物在挂载时注入样式，服务端渲染没有 `document`。
- **Tailwind 组件**：Tailwind 的 preflight 是全局 reset，与 light DOM 下「不影响其他组件」冲突，这类组件只出 Web Component 形态。
```

- [ ] **Step 4: 侧边栏**

`docs/.vitepress/config.mts` 的 `'/guide/'` 分组里，在「构建与产物」之后加：

```ts
            { text: '在 Vue / React 项目里使用', link: '/guide/framework-usage' },
```

- [ ] **Step 5: 跑文档构建**

```bash
pnpm run docs:build
```

预期：绿。若报新页面的链接 404，检查 sidebar 里的 link 与文件名是否一致（VitePress 的 link 不带 `.md`）。

- [ ] **Step 6: 提交**

```bash
git add docs/guide/authoring.md docs/guide/build.md docs/guide/framework-usage.md docs/.vitepress/config.mts
git commit -m "docs: 框架产物的用法、样式来源与类名命名约定"
```

---

## 验证

全量：

```bash
pnpm run verify
```

七个阶段依次要绿：`typecheck` → `test`（115 → **149**：Task 1 加 6、Task 2 加 9、Task 3 加 2、Task 4 加 17）→ `build` → `check:artifacts`（两行「产物隔离正常」「exports 契约正常」）→ `check:framework`（7 条）→ `docs:build` → `test:e2e`（9 → 12 条）。

> **与 spec §9 的一处偏离：** spec 写的是「在文档站里引 `dist/framework/vue.js` 渲染一个组件，跑一条 e2e」。实际做成了 jsdom 集成测试（`check:framework`）+ 一个 import-map 的独立 e2e 页面。原因是文档站页面要在**构建期**解析 `dist/framework/vue.js`，而 `verify` 里 `typecheck` 与 `docs:build` 都排在 `build` 之前 —— 干净 clone 上 `dist` 还不存在，页面直接构建失败。换成独立 fixture 页后覆盖的内容一样（真实浏览器 + 真实产物），且不再给文档站加一条「必须先构建」的隐性前置。

三项人工确认：

1. **WC 产物没被牵连。** 构建末尾打印的 gzip 体积里，`hello-vue.js` / `hello-react.js` / `ew-all.js` 应与 `docs/guide/build.md` 里那张基线表持平（26.8 / 69.3 / 95.2 KB 上下）。dev 模式下打开调试页，两个组件的按钮颜色仍是一蓝一红 —— 这是 Task 2 改类名没有改坏视觉的唯一证据。
2. **框架产物确实小。** `dist/framework/vue.js` 与 `react.js` 都应在几十 KB 以内。若某个上百 KB，`external` 没生效，`check:artifacts` 会报出来。
3. **Element Plus 那份确实裹了层。** `head -c 40 dist/framework/element-plus.css` 应看到 `@layer ew {`。把它引进一个深色主题页面，页面不应被翻成浅色。

## 不做的事

- 不做 SSR、不做 `typeof window` 守卫。
- 不做内容哈希类名。
- 不给框架产物做 CDN / IIFE 版。
- 不改现有 esm / cdn 产物的任何行为。
- 不做 `v-model` / 插槽的专门支持。
- 不给 Tailwind 组件出框架产物。
- 不动 `src/workspaces/self-monitor/**`（在制品）与 `docs/superpowers/**` 既有文件（历史记录）。
- **不把 `package.json` 的在制品改动一起提交**：它当前带着 self-monitor 那批依赖改动，Task 5 与 Task 6 只落盘、由你挑着提交。
