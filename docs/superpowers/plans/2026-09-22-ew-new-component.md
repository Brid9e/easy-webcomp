# new:component 脚手架实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 逐任务实施。步骤用 `- [ ]` 勾选跟踪。

**Goal:** 新增 `pnpm run new:component`，在控制台里选工作空间 → 选框架 → 填组件名 → 多选配套设施，生成一个能直接跑起来的组件目录，并自动 `pnpm add` 依赖。

**Architecture:** 生成逻辑做成纯函数 `createComponent(root, spec)`（可单测、不打依赖），CLI 只是一层 `@clack/prompts` 交互壳 + 跑 `pnpm add`。三个配套设施需要动管道，各自对应一处最小改动：Pinia → `vueAdapter` 加插件工厂；UI 库 → 组件改用 `shadow: false` 并把库样式拼进 `createElementClass` 的 css；Tailwind → 构建与文档站注册 `@tailwindcss/vite`。

**Tech Stack:** TypeScript、tsx、Node 22、`@clack/prompts`、Vite 7、VitePress 1.6.4、Vitest 3。

---

## 关键决策（实施时不要重新论证）

### D1 · UI 库组件一律 `shadow: false`

Element Plus / antd / Ant Design Vue 都是 light DOM 设计：

- `element-plus/dist/index.css` 把主题变量定义在 `:root` 上。shadow root 里 `:root` 不匹配任何元素，变量取不到，组件全是裸的。改写 `:root`→`:host` 能绕过，但——
- Element Plus 的 Select / DatePicker / Tooltip / Modal 走 `Teleport` 到 `document.body`，落在 shadow root **外面**，拿不到 shadow 里的样式。这个改不掉。
- antd / Ant Design Vue v4 是 CSS-in-JS，样式注入到 `document.head`。文档级样式表**不影响** shadow DOM 内容，所以 shadow 里必然无样式。

所以：选了 UI 库 → `meta.shadow = false`，组件自有样式与库样式一起被 `applyStyles` 送进 `document.head`（`src/runtime/style.ts:11` 的 `injectLightStyle` 已按 CSS 文本去重）。代价是该组件没有样式隔离 —— 这是用 light DOM 库的必付代价，在 `meta.ts` 里写明。

**这条只是减少工作量，不是加工作量**：UI 库的 CSS 进 shadow root 那条路本来就需要改运行时，现在零运行时改动。

### D2 · 库样式用 `?inline` 内联，不要裸 import

`import 'element-plus/dist/index.css'` 在 Vite lib 模式下会被**抽成独立的 `.css` 产物**，CDN 就不再是单文件 IIFE 了（项目的核心承诺）。用 `?inline` 拿到字符串，拼进去，CSS 始终是 JS 里的一段 —— 单文件承诺保住。

antd / Ant Design Vue 只需要 reset 那份（组件样式是运行时注入的），体量很小；Element Plus 要整份 `index.css`（约 330KB 原始 / ~35KB gzip），这个代价已经和用户确认过。

### D3 · Pinia 插件是**工厂**不是数组

`createPinia()` 每个元素实例调一次。一个 WC 元素一份状态是正确语义；传数组会让同页两个元素共享 state。

### D4 · Tailwind 组件保持 `shadow: true`

Tailwind v4 生成的主题变量块选择器是 `:root, :host`，本身就覆盖 shadow root，不像 UI 库那样有 `:root` 问题。样式扫描用显式 `@source`，指到组件目录下的 `Component.vue|tsx`，避免依赖 Tailwind 的自动探测范围。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `src/runtime/vue.ts` | 改：`vueAdapter` 加可选 `{ plugins?: () => Plugin[] }` |
| `scripts/new-component.ts` | 新：纯函数 `createComponent` + 模板 + `@clack/prompts` CLI |
| `scripts/build.ts` | 改：`sharedPlugins()` 注册 `@tailwindcss/vite` |
| `docs/.vitepress/config.mts` | 改：`vite.plugins` 注册 `@tailwindcss/vite` |
| `package.json` | 改：`new:component` 脚本；devDeps 加 `@clack/prompts`、`tailwindcss`、`@tailwindcss/vite` |
| `tests/scripts/new-component.test.ts` | 新：纯函数单测 |
| `tests/runtime/vue-adapter.test.ts` | 改：补插件工厂用例 |

**生成产物**（`src/workspaces/<ws>/components/<name>/`）：

```
Component.vue | Component.tsx   ← 框架二选一
meta.ts                          ← tag/shadow/props/events
style.css                        ← 组件自有样式（Tailwind 时顶部加 @import）
index.ts                         ← createElementClass + register
define.ts                        ← 自注册入口
store.ts                         ← 选 Pinia 时
api.ts                           ← 选 axios 时
```

---

## Task 1 · `vueAdapter` 插件缝

**Files:**
- Modify: `src/runtime/vue.ts`
- Test: `tests/runtime/vue-adapter.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/runtime/vue-adapter.test.ts` 追加：

```ts
it('插件工厂在每个元素实例上各调用一次，插件能 provide 值', () => {
  const calls: number[] = []
  let counter = 0
  const probe: Plugin = {
    install(app) {
      counter += 1
      calls.push(counter)
      app.provide('probe-key', counter)
    },
  }

  const adapter = vueAdapter(() => ({ template: '<span />' }), {
    plugins: () => [probe],
  })

  const hostA = document.createElement('div')
  const hostB = document.createElement('div')
  adapter.mount(hostA, {}, () => {})
  adapter.mount(hostB, {}, () => {})

  // 工厂每次 mount 调一次，两次 mount 拿到的是两个不同的插件实例
  expect(calls).toEqual([1, 2])
})

it('不传 options 时行为不变', () => {
  const adapter = vueAdapter(() => ({ template: '<span />' }))
  const host = document.createElement('div')
  expect(() => adapter.mount(host, {}, () => {})).not.toThrow()
})
```

顶部 import 补 `vueAdapter` 与 `type Plugin`（按现有文件风格调整）。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run tests/runtime/vue-adapter.test.ts`
Expected: FAIL —— `vueAdapter` 目前只接受一个参数，`calls` 是 `[]`。

- [ ] **Step 3: 实现**

`src/runtime/vue.ts` 全量替换为：

```ts
import {
  createApp,
  h,
  inject,
  shallowRef,
  type App,
  type Plugin,
  type ShallowRef,
} from 'vue'
import type { ElementAdapter } from './types'

export const EW_EMIT_KEY: unique symbol = Symbol('ew-emit')

export type EmitFn = (name: string, detail?: unknown) => void

export interface VueAdapterOptions {
  /**
   * 插件工厂，每个元素实例 mount 时调用一次。
   *
   * 必须是工厂而不是数组：一个 WC 元素一份状态才是对的语义 —— 传数组会让同页两个
   * 同名元素共享同一个 Pinia，改一处两处全变。Pinia 的 install 会把 pinia 实例
   * provide 给这个 app，所以组件 setup 里 useXxxStore() 拿到的是本实例的那份。
   */
  plugins?: () => Plugin[]
}

interface VueInstance {
  app: App
  propsRef: ShallowRef<Record<string, unknown>>
}

export function vueAdapter(
  getComponent: () => unknown,
  options: VueAdapterOptions = {},
): ElementAdapter {
  return {
    mount(host, props, emit) {
      const propsRef = shallowRef<Record<string, unknown>>({ ...props })
      const app = createApp({
        render: () => h(getComponent() as never, propsRef.value),
      })
      app.provide(EW_EMIT_KEY, emit)
      // 插件必须装在 mount 之前：Pinia 的 store 在 setup 里就调用，晚装就取不到
      for (const plugin of options.plugins?.() ?? []) app.use(plugin)
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

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run tests/runtime/vue-adapter.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/runtime/vue.ts tests/runtime/vue-adapter.test.ts
git commit -m "feat(runtime): vueAdapter 支持按元素实例安装插件"
```

---

## Task 2 · `createComponent` 纯函数骨架

**Files:**
- Create: `scripts/new-component.ts`
- Test: `tests/scripts/new-component.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `tests/scripts/new-component.test.ts`：

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createComponent } from '../../scripts/new-component'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ew-new-comp-'))
  mkdirSync(join(root, 'src/workspaces/demo/components'), { recursive: true })
  writeFileSync(join(root, 'src/workspaces/demo/workspace.ts'), 'export default {}\n')
  writeFileSync(join(root, 'src/workspaces/demo/components/.gitkeep'), '')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const dirOf = (name: string) => join(root, 'src/workspaces/demo/components', name)

describe('createComponent · 基础骨架', () => {
  it('Vue：生成五个文件，且没有 Component.tsx', () => {
    createComponent(root, { workspace: 'demo', name: 'my-card', framework: 'vue', addons: [] })
    for (const f of ['Component.vue', 'meta.ts', 'style.css', 'index.ts', 'define.ts']) {
      expect(existsSync(join(dirOf('my-card'), f)), f).toBe(true)
    }
    expect(existsSync(join(dirOf('my-card'), 'Component.tsx'))).toBe(false)
  })

  it('React：生成 Component.tsx，且没有 Component.vue', () => {
    createComponent(root, { workspace: 'demo', name: 'my-card', framework: 'react', addons: [] })
    expect(existsSync(join(dirOf('my-card'), 'Component.tsx'))).toBe(true)
    expect(existsSync(join(dirOf('my-card'), 'Component.vue'))).toBe(false)
  })

  it('tag 是 ew-<name>，默认开 shadow，默认导出 <Pascal>Element', () => {
    createComponent(root, { workspace: 'demo', name: 'my-card', framework: 'vue', addons: [] })
    expect(readFileSync(join(dirOf('my-card'), 'meta.ts'), 'utf8')).toContain("tag: 'ew-my-card'")
    expect(readFileSync(join(dirOf('my-card'), 'meta.ts'), 'utf8')).toContain('shadow: true')
    expect(readFileSync(join(dirOf('my-card'), 'index.ts'), 'utf8')).toContain(
      'export const MyCardElement',
    )
  })

  it('不选配套设施时不返回任何依赖', () => {
    const result = createComponent(root, {
      workspace: 'demo',
      name: 'my-card',
      framework: 'vue',
      addons: [],
    })
    expect(result.dependencies).toEqual([])
    expect(result.devDependencies).toEqual([])
  })
})

describe('createComponent · 校验', () => {
  it('拒绝非法组件名', () => {
    for (const bad of ['Demo', '-x', 'a/b', '', '有中文', 'a b']) {
      expect(() =>
        createComponent(root, { workspace: 'demo', name: bad, framework: 'vue', addons: [] }),
      ).toThrow(/不合法/)
    }
  })

  it('拒绝不存在的工作空间', () => {
    expect(() =>
      createComponent(root, { workspace: 'nope', name: 'my-card', framework: 'vue', addons: [] }),
    ).toThrow(/工作空间/)
  })

  it('拒绝目录已存在的组件名', () => {
    createComponent(root, { workspace: 'demo', name: 'my-card', framework: 'vue', addons: [] })
    expect(() =>
      createComponent(root, { workspace: 'demo', name: 'my-card', framework: 'vue', addons: [] }),
    ).toThrow(/已存在/)
  })

  it('拒绝跨工作空间重名 —— 组件名必须全局唯一', () => {
    mkdirSync(join(root, 'src/workspaces/other/components'), { recursive: true })
    writeFileSync(join(root, 'src/workspaces/other/workspace.ts'), 'export default {}\n')
    createComponent(root, { workspace: 'other', name: 'my-card', framework: 'vue', addons: [] })
    expect(() =>
      createComponent(root, { workspace: 'demo', name: 'my-card', framework: 'vue', addons: [] }),
    ).toThrow(/全局唯一/)
  })

  it('拒绝与框架不匹配的配套设施', () => {
    expect(() =>
      createComponent(root, {
        workspace: 'demo',
        name: 'my-card',
        framework: 'react',
        addons: ['pinia'],
      }),
    ).toThrow(/pinia/)
    expect(() =>
      createComponent(root, {
        workspace: 'demo',
        name: 'my-card',
        framework: 'react',
        addons: ['element-plus'],
      }),
    ).toThrow(/element-plus/)
    expect(() =>
      createComponent(root, {
        workspace: 'demo',
        name: 'my-card',
        framework: 'vue',
        addons: ['antd'],
      }),
    ).toThrow(/antd/)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run tests/scripts/new-component.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现纯函数骨架**

新建 `scripts/new-component.ts`（本步骤先只做基础骨架与校验，附加件在 Task 3 加）：

```ts
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const NAME_RE = /^[a-z][a-z0-9-]*$/

export type Framework = 'vue' | 'react'

export interface ComponentSpec {
  workspace: string
  name: string
  framework: Framework
  addons: string[]
}

export interface CreateResult {
  dir: string
  dependencies: string[]
  devDependencies: string[]
}

/** `my-card` → `MyCard` */
export function toIdentifier(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function assertName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new Error(
      `[new:component] 组件名不合法："${name}"。只允许小写字母、数字与连字符，且以字母开头`,
    )
  }
}

function assertWorkspace(targetRoot: string, workspace: string): string {
  const wsDir = join(targetRoot, 'src/workspaces', workspace)
  if (!existsSync(join(wsDir, 'workspace.ts'))) {
    throw new Error(`[new:component] 工作空间不存在：src/workspaces/${workspace}`)
  }
  return wsDir
}

/**
 * 组件名必须全局唯一：tag 与 package exports 都不带空间前缀，重名会被构建拦下
 * （scripts/build.ts:44）。在这里提前拦，是因为这时候还没写任何文件，报错更便宜。
 */
function assertGloballyUnique(targetRoot: string, name: string): void {
  const workspacesDir = join(targetRoot, 'src/workspaces')
  for (const ws of readdirSync(workspacesDir)) {
    const componentsDir = join(workspacesDir, ws, 'components')
    if (!existsSync(componentsDir)) continue
    for (const existing of readdirSync(componentsDir)) {
      if (!statSync(join(componentsDir, existing)).isDirectory()) continue
      if (existing !== name) continue
      throw new Error(
        `[new:component] 组件 "${name}" 已存在于 "${ws}" 下。` +
          'tag 与 package exports 都不带空间前缀，组件名必须全局唯一',
      )
    }
  }
}

export function createComponent(targetRoot: string, spec: ComponentSpec): CreateResult {
  assertName(spec.name)
  assertWorkspace(targetRoot, spec.workspace)
  assertGloballyUnique(targetRoot, spec.name)

  const dir = join(targetRoot, 'src/workspaces', spec.workspace, 'components', spec.name)
  mkdirSync(dir, { recursive: true })

  // Task 3 在这里铺开各附加件；Task 2 只保证五件套能落地
  writeFileSync(join(dir, spec.framework === 'vue' ? 'Component.vue' : 'Component.tsx'), '')
  writeFileSync(join(dir, 'meta.ts'), '')
  writeFileSync(join(dir, 'style.css'), '')
  writeFileSync(join(dir, 'index.ts'), '')
  writeFileSync(join(dir, 'define.ts'), '')

  return { dir, dependencies: [], devDependencies: [] }
}
```

- [ ] **Step 4: 跑测试**

Run: `pnpm exec vitest run tests/scripts/new-component.test.ts`
Expected: 校验类用例全 PASS；「tag 是 ew-<name>」「默认导出 <Pascal>Element」两条 FAIL（模板还没写）。

- [ ] **Step 5: 提交**

```bash
git add scripts/new-component.ts tests/scripts/new-component.test.ts
git commit -m "feat(scripts): new:component 骨架与校验"
```

---

## Task 3 · 模板与配套设施

**Files:**
- Modify: `scripts/new-component.ts`
- Test: `tests/scripts/new-component.test.ts`

- [ ] **Step 1: 写失败测试**

追加：

```ts
describe('createComponent · 配套设施', () => {
  it('Pinia：生成 store.ts、index.ts 传插件工厂、返回 pinia 依赖', () => {
    const result = createComponent(root, {
      workspace: 'demo',
      name: 'my-card',
      framework: 'vue',
      addons: ['pinia'],
    })
    expect(existsSync(join(dirOf('my-card'), 'store.ts'))).toBe(true)
    expect(readFileSync(join(dirOf('my-card'), 'index.ts'), 'utf8')).toContain(
      'plugins: () => [createPinia()]',
    )
    expect(result.dependencies).toEqual(['pinia'])
  })

  it('axios：生成 api.ts，返回 axios 依赖', () => {
    const result = createComponent(root, {
      workspace: 'demo',
      name: 'my-card',
      framework: 'vue',
      addons: ['axios'],
    })
    const api = readFileSync(join(dirOf('my-card'), 'api.ts'), 'utf8')
    expect(api).toContain("from 'axios'")
    expect(api).toContain('interceptors.response.use')
    expect(result.dependencies).toEqual(['axios'])
  })

  it('UI 库：shadow 关掉，库样式拼进 createElementClass', () => {
    createComponent(root, {
      workspace: 'demo',
      name: 'my-card',
      framework: 'vue',
      addons: ['element-plus'],
    })
    const meta = readFileSync(join(dirOf('my-card'), 'meta.ts'), 'utf8')
    expect(meta).toContain('shadow: false')
    const index = readFileSync(join(dirOf('my-card'), 'index.ts'), 'utf8')
    expect(index).toContain("from 'element-plus/dist/index.css?inline'")
    expect(index).toContain('libCss +')
    expect(index).not.toContain("from 'element-plus'")
  })

  it('React + antd：reset.css 内联，组件用 antd 的 Button', () => {
    const result = createComponent(root, {
      workspace: 'demo',
      name: 'my-card',
      framework: 'react',
      addons: ['antd'],
    })
    expect(readFileSync(join(dirOf('my-card'), 'index.ts'), 'utf8')).toContain(
      "from 'antd/dist/reset.css?inline'",
    )
    expect(readFileSync(join(dirOf('my-card'), 'Component.tsx'), 'utf8')).toContain(
      "from 'antd'",
    )
    expect(result.dependencies).toEqual(['antd'])
  })

  it('Tailwind：style.css 顶部有 @import 与 @source，装的是 devDependency', () => {
    const result = createComponent(root, {
      workspace: 'demo',
      name: 'my-card',
      framework: 'vue',
      addons: ['tailwind'],
    })
    const css = readFileSync(join(dirOf('my-card'), 'style.css'), 'utf8')
    expect(css).toContain('@import "tailwindcss"')
    expect(css).toContain('@source "./Component.vue"')
    expect(result.dependencies).toEqual([])
    expect(result.devDependencies).toEqual(['tailwindcss', '@tailwindcss/vite'])
  })

  it('Tailwind 不改 shadow —— v4 的主题选择器本身就含 :host', () => {
    createComponent(root, {
      workspace: 'demo',
      name: 'my-card',
      framework: 'vue',
      addons: ['tailwind'],
    })
    expect(readFileSync(join(dirOf('my-card'), 'meta.ts'), 'utf8')).toContain('shadow: true')
  })

  it('依赖去重且顺序稳定：UI 库 + axios + pinia', () => {
    const result = createComponent(root, {
      workspace: 'demo',
      name: 'my-card',
      framework: 'vue',
      addons: ['element-plus', 'axios', 'pinia'],
    })
    expect(result.dependencies).toEqual(['axios', 'element-plus', 'pinia'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec vitest run tests/scripts/new-component.test.ts`
Expected: 新增用例 FAIL（文件还都是空的）。

- [ ] **Step 3: 实现模板与附加件**

把 `scripts/new-component.ts` 的 `createComponent` 换成完整版，并加上下方的模板常量与附加件表。

附加件表（放在 `ComponentSpec` 之后）：

```ts
export interface AddonDef {
  /** 展示名，CLI 里用 */
  label: string
  /** 适用的框架 */
  frameworks: Framework[]
  /** 生产依赖 */
  dependencies: string[]
  /** 开发依赖 */
  devDependencies: string[]
  /** 相对组件目录生成的附加文件 */
  files?: (spec: ComponentSpec) => Record<string, string>
  /** 改 meta.ts：返回 undefined 表示不覆盖默认值 */
  shadow?: boolean
}

export const ADDONS: Record<string, AddonDef> = {
  pinia: {
    label: 'Pinia 状态管理',
    frameworks: ['vue'],
    dependencies: ['pinia'],
    devDependencies: [],
    files: (spec) => ({ 'store.ts': storeTemplate(spec) }),
  },
  axios: {
    label: 'axios 请求层（含拦截器）',
    frameworks: ['vue', 'react'],
    dependencies: ['axios'],
    devDependencies: [],
    files: () => ({ 'api.ts': apiTemplate() }),
  },
  'element-plus': {
    label: 'Element Plus',
    frameworks: ['vue'],
    dependencies: ['element-plus'],
    devDependencies: [],
    shadow: false,
  },
  'ant-design-vue': {
    label: 'Ant Design Vue',
    frameworks: ['vue'],
    dependencies: ['ant-design-vue'],
    devDependencies: [],
    shadow: false,
  },
  antd: {
    label: 'Ant Design (React)',
    frameworks: ['react'],
    dependencies: ['antd'],
    devDependencies: [],
    shadow: false,
  },
  tailwind: {
    label: 'Tailwind CSS',
    frameworks: ['vue', 'react'],
    dependencies: [],
    devDependencies: ['tailwindcss', '@tailwindcss/vite'],
  },
}

/** 每个框架可选的 UI 库 —— 只有一份，生成与 CLI 共用，避免两处走偏 */
export const UI_LIBRARY: Record<Framework, string> = {
  vue: 'element-plus',
  react: 'antd',
}
```

说明：Vue 的 UI 库菜单同时提供 `element-plus` 与 `ant-design-vue`，但 `UI_LIBRARY` 只决定**默认塞进 Component 模板**的那一个。若 `addons` 里同时有两个 UI 库，取 `UI_LIBRARY[framework]`，另一个只装依赖不写模板 —— CLI 的 multiselect 里把它们做成互斥提示即可（见 Task 4）。

校验附加件：

```ts
function assertAddons(spec: ComponentSpec): AddonDef[] {
  return spec.addons.map((key) => {
    const def = ADDONS[key]
    if (!def) throw new Error(`[new:component] 未知的配套设施："${key}"`)
    if (!def.frameworks.includes(spec.framework)) {
      throw new Error(
        `[new:component] 配套设施 "${key}" 不支持 ${spec.framework}，只支持：${def.frameworks.join(', ')}`,
      )
    }
    return def
  })
}
```

`createComponent` 的完整实现：

```ts
export function createComponent(targetRoot: string, spec: ComponentSpec): CreateResult {
  assertName(spec.name)
  assertWorkspace(targetRoot, spec.workspace)
  assertGloballyUnique(targetRoot, spec.name)

  const defs = assertAddons(spec)
  const tag = `ew-${spec.name}`
  const id = toIdentifier(spec.name)
  // 选中的 UI 库只认一个：真塞两个库的模板进去只会打架
  const uiAddon = defs.find((d) => d.shadow === false)
  // 选了 UI 库就必须关 shadow —— 库的样式是 light DOM 的（见计划 D1）
  const shadow = uiAddon ? false : true
  const usesTailwind = spec.addons.includes('tailwind')

  const dir = join(targetRoot, 'src/workspaces', spec.workspace, 'components', spec.name)
  mkdirSync(dir, { recursive: true })

  const files: Record<string, string> = {
    [spec.framework === 'vue' ? 'Component.vue' : 'Component.tsx']: componentTemplate(
      spec,
      tag,
      uiAddon?.label,
    ),
    'meta.ts': metaTemplate(spec, tag, shadow),
    'style.css': styleTemplate(spec, usesTailwind),
    'index.ts': indexTemplate(spec, id, uiAddon),
    'define.ts': defineTemplate(),
  }

  for (const def of defs) {
    if (!def.files) continue
    Object.assign(files, def.files(spec))
  }

  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(dir, filename), content)
  }

  const dependencies = [...new Set(defs.flatMap((d) => d.dependencies))].sort()
  const devDependencies = [...new Set(defs.flatMap((d) => d.devDependencies))].sort()

  return { dir, dependencies, devDependencies }
}
```

模板函数（同文件，放在 `createComponent` 之后）：

```ts
const RUNTIME = '../../../../runtime'

function metaTemplate(spec: ComponentSpec, tag: string, shadow: boolean): string {
  const shadowNote = shadow
    ? ''
    : `
  // 关掉 Shadow DOM 是 UI 库逼的：Element Plus 的主题变量定义在 :root 上、浮层 Teleport 到
  // body，antd 的样式是运行时注入到 document.head —— 三者都够不到 shadow root 里面。
  // 代价是本组件的样式不再隔离，会落到 document.head 影响整页。`
  return `import { defineComponentMeta } from '${RUNTIME}/types'

export default defineComponentMeta({
  tag: '${tag}',${shadowNote}
  shadow: ${shadow},
  props: {
    label: { type: 'string', default: '${spec.name}' },
  },
  events: ['select'],
})
`
}

function styleTemplate(spec: ComponentSpec, usesTailwind: boolean): string {
  const tailwind = usesTailwind
    ? // 显式 @source 指到组件自己：不让 Tailwind 去猜扫描范围，构建更可预期
      `@import "tailwindcss";
@source "./Component.${spec.framework === 'vue' ? 'vue' : 'tsx'}";

`
    : ''
  return `${tailwind}:host {
  display: inline-block;
}
`
}

function defineTemplate(): string {
  return `import { register } from './index'

register()
`
}
```

Component 模板：**按 (框架, UI 库) 组合拆成四个自包含的模板函数**，不做字符串拼装。Pinia 不在模板里出现 —— UI 库 × Pinia 的组合会让分支爆炸，而 `store.ts` 与 `index.ts` 的插件安装照常生成，开发者在自己的组件里 `useXxxStore()` 即可（生成后的提示里会说明）。

```ts
function componentTemplate(spec: ComponentSpec, uiLabel?: string): string {
  const id = toIdentifier(spec.name)
  if (spec.framework === 'vue') {
    if (uiLabel === 'Element Plus') return elementPlusComponent(spec)
    if (uiLabel === 'Ant Design Vue') return antDesignVueComponent(spec)
    return plainVueComponent(spec)
  }
  if (uiLabel === 'Ant Design (React)') return antdComponent(spec, id)
  return plainReactComponent(spec, id)
}

function plainVueComponent(spec: ComponentSpec): string {
  return `<script setup lang="ts">
import { useEmit } from '${RUNTIME}/vue'

const props = defineProps<{ label?: string }>()

const emit = useEmit()

function handleClick(): void {
  emit('select', { source: '${spec.name}', label: props.label ?? '${spec.name}' })
}
</script>

<template>
  <button class="ew-root" type="button" @click="handleClick">
    {{ props.label ?? '${spec.name}' }}
  </button>
</template>
`
}

function elementPlusComponent(spec: ComponentSpec): string {
  return `<script setup lang="ts">
// 按需 import —— <script setup> 里 import 进来的组件自动可用，模板写 <ElButton> 或 <el-button> 都行
import { ElButton } from 'element-plus'
import { useEmit } from '${RUNTIME}/vue'

const props = defineProps<{ label?: string }>()

const emit = useEmit()

function handleClick(): void {
  emit('select', { source: '${spec.name}', label: props.label ?? '${spec.name}' })
}
</script>

<template>
  <ElButton type="primary" @click="handleClick">{{ props.label ?? '${spec.name}' }}</ElButton>
</template>
`
}

function antDesignVueComponent(spec: ComponentSpec): string {
  return `<script setup lang="ts">
import { Button } from 'ant-design-vue'
import { useEmit } from '${RUNTIME}/vue'

const props = defineProps<{ label?: string }>()

const emit = useEmit()

function handleClick(): void {
  emit('select', { source: '${spec.name}', label: props.label ?? '${spec.name}' })
}
</script>

<template>
  <Button type="primary" @click="handleClick">{{ props.label ?? '${spec.name}' }}</Button>
</template>
`
}

function plainReactComponent(spec: ComponentSpec, id: string): string {
  return `import { useEmit } from '${RUNTIME}/react'

export interface ${id}Props {
  label?: string
}

export default function ${id}({ label = '${spec.name}' }: ${id}Props) {
  const emit = useEmit()

  return (
    <button
      type="button"
      className="ew-root"
      onClick={() => emit('select', { source: '${spec.name}', label })}
    >
      {label}
    </button>
  )
}
`
}

function antdComponent(spec: ComponentSpec, id: string): string {
  return `import { Button } from 'antd'
import { useEmit } from '${RUNTIME}/react'

export interface ${id}Props {
  label?: string
}

export default function ${id}({ label = '${spec.name}' }: ${id}Props) {
  const emit = useEmit()

  return (
    <Button
      type="primary"
      onClick={() => emit('select', { source: '${spec.name}', label })}
    >
      {label}
    </Button>
  )
}
`
}
```

`uiAddon?.label` 就是这里的 `uiLabel`：`'Element Plus'` / `'Ant Design Vue'` / `'Ant Design (React)'`。

`index.ts` 模板：

```ts
function indexTemplate(spec: ComponentSpec, id: string, uiAddon: AddonDef | undefined): string {
  const adapter = spec.framework === 'vue' ? 'vueAdapter' : 'reactAdapter'
  const pluginImport = spec.addons.includes('pinia') ? "import { createPinia } from 'pinia'\n" : ''
  const adapterArgs = spec.addons.includes('pinia')
    ? `() => Component, { plugins: () => [createPinia()] }`
    : '() => Component'
  const libImport = uiAddon ? `import libCss from '${uiAddon.cssEntry}?inline'\n` : ''
  const cssArg = uiAddon ? 'libCss + \'\\n\' + css' : 'css'

  return `import { createElementClass } from '${RUNTIME}/element'
import { registerElement } from '${RUNTIME}/registry'
import { ${adapter} } from '${RUNTIME}/${spec.framework === 'vue' ? 'vue' : 'react'}'
${pluginImport}import Component from './Component${spec.framework === 'vue' ? '.vue' : ''}'
import meta from './meta'
${libImport}import css from './style.css?inline'

export { meta }
export const ${id}Element = createElementClass(meta, ${adapter}(${adapterArgs}), ${cssArg})
export function register(): void {
  registerElement(meta.tag, ${id}Element)
}
`
}
```

`AddonDef` 因此需要一个 `cssEntry?: string`：`element-plus` → `'element-plus/dist/index.css'`，`ant-design-vue` → `'ant-design-vue/dist/reset.css'`，`antd` → `'antd/dist/reset.css'`。

`storeTemplate`：

```ts
function storeTemplate(spec: ComponentSpec): string {
  const id = toIdentifier(spec.name)
  return `import { defineStore } from 'pinia'

/**
 * 每个 <${'ew-' + spec.name}> 元素实例各有一份 pinia（index.ts 里按实例 createPinia），
 * 所以同页放两个元素，状态互不影响。
 */
export const use${id}Store = defineStore('${spec.name}', {
  state: () => ({ count: 0 }),
  actions: {
    increment(): void {
      this.count += 1
    },
  },
})
`
}
```

`apiTemplate`：

```ts
function apiTemplate(): string {
  return `import axios, { type AxiosInstance } from 'axios'

/**
 * 组件内共用的 axios 实例。拦截器是这层存在的理由：
 * 鉴权头、traceId、统一错误提示都往这里加，组件里只管发请求。
 */
export const http: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 15_000,
})

http.interceptors.request.use((config) => {
  // 例：config.headers.set('Authorization', \`Bearer \${token}\`)
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // 例：统一 toast、401 跳登录
    return Promise.reject(error)
  },
)
`
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm exec vitest run tests/scripts/new-component.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/new-component.ts tests/scripts/new-component.test.ts
git commit -m "feat(scripts): new:component 生成模板与配套设施"
```

---

## Task 4 · CLI 交互层

**Files:**
- Modify: `scripts/new-component.ts`
- Modify: `package.json`

- [ ] **Step 1: 装依赖**

```bash
pnpm add -D @clack/prompts
```

- [ ] **Step 2: 加 script**

`package.json` 的 `scripts` 里，`new:workspace` 下面加一行：

```json
"new:component": "tsx scripts/new-component.ts",
```

- [ ] **Step 3: 写 CLI**

追加到 `scripts/new-component.ts` 末尾：

```ts
async function main(): Promise<void> {
  const { cancel, group, intro, multiselect, outro, select, text } = await import('@clack/prompts')

  intro('新建组件')

  const workspaces = readdirSync(join(root, 'src/workspaces')).filter((id) =>
    statSync(join(root, 'src/workspaces', id)).isDirectory(),
  )
  if (workspaces.length === 0) {
    throw new Error('[new:component] 还没有任何工作空间，先跑 pnpm run new:workspace <name>')
  }

  const answers = await group(
    {
      workspace: () =>
        select({
          message: '放在哪个工作空间？',
          options: workspaces.map((id) => ({ value: id, label: id })),
        }),
      framework: () =>
        select({
          message: '用哪个框架写？',
          options: [
            { value: 'vue' as const, label: 'Vue 3' },
            { value: 'react' as const, label: 'React' },
          ],
        }),
      name: ({ results }) =>
        text({
          message: '组件名（小写字母、数字、连字符）',
          placeholder: 'my-card',
          validate: (value) => {
            if (!value) return '不能为空'
            if (!NAME_RE.test(value)) return '只允许小写字母、数字与连字符，且以字母开头'
            try {
              assertGloballyUnique(root, value)
            } catch (error) {
              return error instanceof Error ? error.message : String(error)
            }
            void results
            return undefined
          },
        }),
      addons: ({ results }) =>
        multiselect({
          message: '要配套什么？（空格多选，回车确认）',
          required: false,
          options: Object.entries(ADDONS)
            .filter(([, def]) => def.frameworks.includes(results.framework as Framework))
            .map(([key, def]) => ({
              value: key,
              label: def.label,
              hint: def.shadow === false ? '会关掉 shadow DOM' : undefined,
            })),
        }),
    },
    {
      onCancel: () => {
        cancel('已取消')
        process.exit(0)
      },
    },
  )

  const spec: ComponentSpec = {
    workspace: String(answers.workspace),
    framework: answers.framework as Framework,
    name: String(answers.name),
    addons: (answers.addons ?? []) as string[],
  }

  const result = createComponent(root, spec)

  console.log(`\n[new:component] 已创建 src/workspaces/${spec.workspace}/components/${spec.name}/`)

  // -D 与普通依赖必须分两次跑：一个 pnpm add 写不了两个 section
  if (result.dependencies.length > 0) {
    run('pnpm', ['add', ...result.dependencies])
  }
  if (result.devDependencies.length > 0) {
    run('pnpm', ['add', '-D', ...result.devDependencies])
  }

  outro('完成。重启 dev（pnpm run dev）—— 页面清单与侧边栏在启动时就定好了')
}

function run(command: string, args: string[]): void {
  const status = spawnSync(command, args, { cwd: root, stdio: 'inherit' }).status
  if (status !== 0) {
    throw new Error(`[new:component] ${command} ${args.join(' ')} 失败，请手动安装`)
  }
}

// 只有被当作脚本直接执行时才跑 CLI。被测试 import 时 process.argv[1] 是 vitest 的可执行文件。
// 比较解析后的文件路径而不是 import.meta.url 字符串：tsx 下后者可能带 query。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
```

文件顶部的 import 追加 `spawnSync`：`import { spawnSync } from 'node:child_process'`（ESM，不要 `require`）。

- [ ] **Step 4: 类型检查**

Run: `pnpm run typecheck`
Expected: 通过。`group` 的 `results` 取值可能需要显式断言（`@clack/prompts` 的类型对分组结果的推断是 `unknown` 偏保守），断言成 `Framework` 即可。

- [ ] **Step 5: 手动跑一次**

Run: `pnpm run new:component`
选一个**临时**空间与组件名走完流程，确认提示、生成、`pnpm add` 都正常。跑完把生成的目录删掉。

- [ ] **Step 6: 提交**

```bash
git add scripts/new-component.ts package.json pnpm-lock.yaml
git commit -m "feat(scripts): new:component 交互式 CLI"
```

---

## Task 5 · Tailwind 构建管道接线

**Files:**
- Modify: `scripts/build.ts`
- Modify: `docs/.vitepress/config.mts`
- Modify: `package.json`

- [ ] **Step 1: 装依赖**

```bash
pnpm add -D tailwindcss @tailwindcss/vite
```

（`new:component` 选 Tailwind 时也会装，这里先装是因为构建与文档站**无条件**注册这个插件 —— 少了它，文档站渲染任何 Tailwind 组件都会在 `?inline` 那步报错。）

- [ ] **Step 2: 构建注册插件**

`scripts/build.ts` 顶部：

```ts
import tailwind from '@tailwindcss/vite'
```

`sharedPlugins()` 改成：

```ts
// Tailwind 插件对不含 @import "tailwindcss" 的 CSS 是直通，普通组件不受影响
const sharedPlugins = () => [vue(), react(), tailwind()]
```

- [ ] **Step 3: 文档站注册插件**

`docs/.vitepress/config.mts` 顶部：

```ts
import tailwind from '@tailwindcss/vite'
```

`vite.plugins` 改成：

```ts
plugins: [wcModePlugin(resolve(rootDir, 'src/workspaces')), react(), tailwind()],
```

- [ ] **Step 4: 验证**

Run: `pnpm run typecheck && pnpm run build && pnpm run docs:build`
Expected: 三条全绿。

- [ ] **Step 5: 提交**

```bash
git add scripts/build.ts docs/.vitepress/config.mts package.json pnpm-lock.yaml
git commit -m "feat(build): 注册 @tailwindcss/vite"
```

---

## Task 6 · 端到端验收

- [ ] **Step 1: 造一个临时空间与五种组合**

```bash
pnpm run new:workspace tmp-e2e
```

用 `createComponent` 直接生成（比走 CLI 快且可重复），五种组合各一个：

| 工作空间 | 组件名 | 框架 | 配套设施 |
| --- | --- | --- | --- |
| tmp-e2e | probe-plain-vue | vue | — |
| tmp-e2e | probe-pinia | vue | pinia |
| tmp-e2e | probe-ep | vue | element-plus, axios |
| tmp-e2e | probe-tw-vue | vue | tailwind |
| tmp-e2e | probe-antd | react | antd, axios |
| tmp-e2e | probe-tw-react | react | tailwind |

- [ ] **Step 2: 装依赖**

```bash
pnpm add element-plus axios pinia antd
```

- [ ] **Step 3: 构建并确认产物形态**

Run: `pnpm run build`
Expected: 发现 8 个组件（原有 2 + 探针 6）；**`dist/cdn/` 下没有 `.css` 文件** —— 这是 D2 的关键回归断言，CSS 必须是 JS 里的字符串。

Run: `ls dist/cdn/`
Expected: 只有 `.js`。

- [ ] **Step 4: 文档站构建**

Run: `pnpm run docs:build`
Expected: 通过。

- [ ] **Step 5: 清理**

```bash
rm -rf src/workspaces/tmp-e2e
git checkout package.json   # 或手动把探针带来的 exports 键删掉
pnpm run build              # 重建 exports，回到两组件状态
```

- [ ] **Step 6: 全量验证**

Run: `pnpm run verify`
Expected: typecheck / test / build / docs:build / e2e 全绿。

- [ ] **Step 7: 提交或汇报**

若有改动需落盘则提交；否则只汇报分支状态。

---

## 验收清单

- [ ] `pnpm run new:component` 能走完「空间 → 框架 → 组件名 → 多选」四步
- [ ] Vue 的菜单里没有 `antd`；React 的菜单里没有 `pinia` / `element-plus` / `ant-design-vue`
- [ ] 重名（含跨空间）在输入组件名那一刻就被拦下，不落任何文件
- [ ] 选 UI 库时 `meta.ts` 是 `shadow: false`，`index.ts` 内联了库 CSS
- [ ] 选 Tailwind 时 `style.css` 顶部有 `@import "tailwindcss"` 与显式 `@source`
- [ ] 选 Pinia 时 `index.ts` 传的是 `plugins: () => [createPinia()]`（工厂）
- [ ] `dist/cdn/` 下始终没有 `.css` 产物
- [ ] `pnpm run verify` 全绿
