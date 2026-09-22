# 调试页（`devtools/`）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pnpm dev` 打开一个独立的单组件调试页（占满视口、容器可拖拽 / 预设尺寸、双模式、事件按 `meta.events` 动态绑定），`pnpm docs:dev` 仍开文档站，两者共用同一份预览机制。

**Architecture:** 新建顶层 `devtools/` 作为独立 Vite 应用；`devtools/shared/` 放文档站与调试页共用的机制层（WC 虚拟模块插件、源码挂载组件、样式补齐、面板状态 composable、组件索引），通过 `@devtools/*` 别名引入。文档站只改 import 与面板接线，外壳与 `--vp-*` 样式不动。

**Tech Stack:** Vite 7 + Vue 3 SFC、`@vitejs/plugin-vue` / `@vitejs/plugin-react` / `@tailwindcss/vite`、Vitest 3 + jsdom、Playwright（系统 Chrome）。

**Spec:** `docs/superpowers/specs/2026-09-22-ew-debug-page-design.md`

---

## 与 spec 的四处偏差（实现层面细化，行为一致）

1. **不单独建 `DebugToolbox.vue`**，顶栏并进 `DebugStage.vue`。模式与尺寸共 5 个 ref 全在「主区」这件事上，拆成两个文件就得全部提到 `App.vue` 再双向绑下去，得不偿失。
2. **拖拽把手跨在容器边缘上**（`right: -4px`，一半在内一半在外），而不是整个贴在容器外侧。外侧在「铺满」时没有空间；跨边同样能压过组件自己的 pointer 处理，且只遮挡 4px。
3. **「铺满」表示成 `fill: boolean`**（另记 `width`），而不是 `width: number | 'fill'`。少一个联合分支，拖动时从实测宽度起步再退出铺满，行为与 spec 一致。
4. **状态归属**：属性值与事件日志归 `App.vue`（主区要渲染、右栏要编辑/展示，必须是同一份）；模式与尺寸归 `DebugStage.vue`（只有它用）。

---

## 文件结构

**新建**

```
devtools/
├── index.html
├── vite.config.ts
├── shared/                      @devtools/*
│   ├── wc-mode.ts               自 docs/.vitepress/plugins/ 迁入
│   ├── source-style.ts          自 docs/.vitepress/theme/components/ 迁入
│   ├── component-index.ts       meta / 源码 / 空间标题的 glob 查询
│   ├── preview-state.ts         usePropControls + useEventLog
│   └── mount/
│       ├── VueMount.vue         迁入
│       └── ReactMount.vue       迁入
└── src/
    ├── main.ts
    ├── App.vue
    ├── ComponentPicker.vue
    ├── DebugStage.vue
    ├── ResizeHandle.vue
    ├── PropPanel.vue
    ├── EventLog.vue
    ├── use-persisted.ts
    └── shell.css
tests/devtools/preview-state.test.ts
tests/e2e/debug-page.spec.ts
```

**修改**：`tsconfig.json`、`docs/.vitepress/config.mts`、`docs/.vitepress/theme/components/ComponentDemo.vue`、`playwright.config.ts`、`package.json`、`README.md`、`docs/guide/index.md`、`docs/guide/authoring.md`、`scripts/new-workspace.ts`、`scripts/new-component.ts`

**删除**：`docs/.vitepress/plugins/`（移空后删目录）

---

## Task 1: 抽出 `devtools/shared/`，文档站改引 `@devtools`

**Files:**
- Create（git mv 迁入）: `devtools/shared/wc-mode.ts`、`devtools/shared/source-style.ts`、`devtools/shared/mount/VueMount.vue`、`devtools/shared/mount/ReactMount.vue`
- Delete: `docs/.vitepress/plugins/wc-mode.ts`、`docs/.vitepress/theme/components/{source-style.ts,VueMount.vue,ReactMount.vue}`、`docs/.vitepress/plugins/`
- Modify: `tsconfig.json`、`docs/.vitepress/config.mts`、`docs/.vitepress/theme/components/ComponentDemo.vue`

- [ ] **Step 1: 建目录并迁移四个文件（保留 git 历史）**

```bash
mkdir -p devtools/shared/mount
git mv docs/.vitepress/plugins/wc-mode.ts devtools/shared/wc-mode.ts
git mv docs/.vitepress/theme/components/source-style.ts devtools/shared/source-style.ts
git mv docs/.vitepress/theme/components/VueMount.vue devtools/shared/mount/VueMount.vue
git mv docs/.vitepress/theme/components/ReactMount.vue devtools/shared/mount/ReactMount.vue
rmdir docs/.vitepress/plugins
```

- [ ] **Step 2: 修两个 mount 组件的相对 import**

`devtools/shared/mount/VueMount.vue` 第 4 行：

```ts
import { componentStyle } from '../source-style'
```

`devtools/shared/mount/ReactMount.vue` 第 6 行，同样的改动：

```ts
import { componentStyle } from '../source-style'
```

两个文件其余内容一字不动（`attachShadow`、注入 `componentStyle(name)`、`EW_EMIT_KEY` / `EwEmitContext.Provider`）。

- [ ] **Step 3: `tsconfig.json` 加路径映射与 include**

`compilerOptions.paths` 改成：

```json
    "paths": { "@src/*": ["./src/*"], "@devtools/*": ["./devtools/shared/*"] },
```

`include` 改成：

```json
  "include": ["*.config.ts", "src", "docs", "tests", "scripts", "packages", "devtools"]
```

> 新顶层目录不加进 `include`，`pnpm run typecheck` 就完全管不到它 —— 这是静默失效，不是报错。

- [ ] **Step 4: `docs/.vitepress/config.mts` 接别名与新 import**

第 6 行改为：

```ts
import { wcModePlugin } from '@devtools/wc-mode'
```

`vite.resolve` 块（第 51-53 行）改为：

```ts
    resolve: {
      alias: {
        '@src': resolve(rootDir, 'src'),
        '@devtools': resolve(rootDir, 'devtools/shared'),
      },
    },
```

`vite.plugins` 那一行不动（它引的是导入进来的 `wcModePlugin`）。

- [ ] **Step 5: `ComponentDemo.vue` 改引新位置**

只改 import，其余（内联 glob、`propsData`/`wcProps`、面板模板、`--vp-*` 样式）本任务一律不动：

```ts
import ReactMount from '@devtools/mount/ReactMount.vue'
import VueMount from '@devtools/mount/VueMount.vue'
```

- [ ] **Step 6: 验证搬迁没坏**

```bash
pnpm run typecheck && pnpm run docs:build
```

Expected: 两条都绿。`docs:build` 是本次搬迁唯一能证明 glob 在文档站 root 之外仍能解析的证据 —— 这也正是 spec 第 10 节列为头号风险的那条。

- [ ] **Step 7: 提交**

```bash
git add -A devtools docs/.vitepress tsconfig.json
git commit -m "refactor(devtools): 预览机制抽到 devtools/shared，文档站改引 @devtools"
```

> 注意 `git add` 只列这三个路径。`package.json` / `pnpm-lock.yaml` / `src/workspaces/self-monitor/` 是在制品，不属于本次改动。

---

## Task 2: `preview-state.ts`（TDD）+ `component-index.ts`，面板改接共享层

**Files:**
- Create: `tests/devtools/preview-state.test.ts`、`devtools/shared/preview-state.ts`、`devtools/shared/component-index.ts`
- Modify: `docs/.vitepress/theme/components/ComponentDemo.vue`

- [ ] **Step 1: 写失败的测试**

新建 `tests/devtools/preview-state.test.ts`：

```ts
import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { ComponentMeta } from '@ew/runtime'
import { useEventLog, usePropControls } from '../../devtools/shared/preview-state'

describe('usePropControls', () => {
  it('首帧 model 就是声明里的默认值', () => {
    const meta = ref<ComponentMeta | undefined>({
      tag: 'ew-demo',
      props: {
        name: { type: 'string', default: 'World' },
        count: { type: 'number', default: 3 },
        autoLoad: { type: 'boolean', default: false },
      },
    })

    const { model } = usePropControls(meta)

    expect(model.value).toEqual({ name: 'World', count: 3, autoLoad: false })
  })

  it('值是已定型的：boolean 真布尔、number 走 Number()、string 原样', () => {
    const meta = ref<ComponentMeta | undefined>({
      tag: 'ew-demo',
      props: {
        name: { type: 'string', default: 'World' },
        count: { type: 'number', default: 0 },
        autoLoad: { type: 'boolean', default: false },
      },
    })

    const { values, booleanValues, model } = usePropControls(meta)
    values.name = 'Hi'
    values.count = '7'
    booleanValues.autoLoad = true

    // 走 property 通道，传字符串会原样落进组件（count 变成 '7'）：
    // 这条断言就是那个坑的守门人
    expect(model.value).toEqual({ name: 'Hi', count: 7, autoLoad: true })
  })

  it('number 输入框清空时回落 0，而不是 NaN', () => {
    const meta = ref<ComponentMeta | undefined>({
      tag: 'ew-demo',
      props: { count: { type: 'number', default: 3 } },
    })

    const { values, model } = usePropControls(meta)
    values.count = ''

    expect(model.value).toEqual({ count: 0 })
  })

  it('组件切走再切回来，用户改过的值不被默认值覆盖', async () => {
    const meta = ref<ComponentMeta | undefined>({
      tag: 'ew-a',
      props: { name: { type: 'string', default: 'World' } },
    })
    const { values, model } = usePropControls(meta)
    values.name = 'Mine'

    meta.value = { tag: 'ew-b', props: { other: { type: 'string', default: 'x' } } }
    await nextTick()
    meta.value = { tag: 'ew-a', props: { name: { type: 'string', default: 'World' } } }
    await nextTick()

    expect(model.value).toEqual({ name: 'Mine' })
  })
})

describe('useEventLog', () => {
  it('wcHandlers 按 meta.events 生成 ew- 前缀的键', () => {
    const names = ref<string[] | undefined>(['select', 'change'])
    const { wcHandlers } = useEventLog(names)

    expect(Object.keys(wcHandlers.value)).toEqual(['ew-select', 'ew-change'])
  })

  it('handler 从 CustomEvent 取 detail 记进日志，事件名不带前缀', () => {
    const names = ref<string[] | undefined>(['select'])
    const { entries, wcHandlers } = useEventLog(names)

    wcHandlers.value['ew-select']!(new CustomEvent('ew-select', { detail: { id: 1 } }))

    expect(entries.value).toHaveLength(1)
    expect(entries.value[0]).toMatchObject({ name: 'select', detail: { id: 1 } })
  })

  it('meta.events 缺失时没有 handler，也不报错', () => {
    const names = ref<string[] | undefined>(undefined)
    const { wcHandlers } = useEventLog(names)

    expect(wcHandlers.value).toEqual({})
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test -- preview-state
```

Expected: FAIL —— `Failed to resolve import "../../devtools/shared/preview-state"`。

- [ ] **Step 3: 实现 `devtools/shared/preview-state.ts`**

```ts
import { computed, reactive, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ComponentMeta, PropDefinition } from '@ew/runtime'

export interface EventEntry {
  name: string
  detail: unknown
  at: string
}

export interface PropControls {
  propDefs: ComputedRef<Array<[string, PropDefinition]>>
  values: Record<string, string>
  booleanValues: Record<string, boolean>
  model: ComputedRef<Record<string, unknown>>
}

/**
 * 属性面板的状态机。主区（渲染）与右栏（编辑）共用同一份，所以放在这里而不是各自持有。
 *
 * 只接受 meta 作为入参、不 import component-index —— 后者带 import.meta.glob，
 * 会把这条逻辑拖出可单测的范围。
 */
export function usePropControls(meta: Ref<ComponentMeta | undefined>): PropControls {
  const propDefs = computed(() => Object.entries(meta.value?.props ?? {}))

  const values = reactive<Record<string, string>>({})
  const booleanValues = reactive<Record<string, boolean>>({})

  // 已存在就不覆盖：切换组件再切回来时，用户改过的值要留着
  function initValue(name: string, type: string, fallback: unknown): void {
    if (type === 'boolean') {
      if (!(name in booleanValues)) booleanValues[name] = Boolean(fallback)
      return
    }
    if (!(name in values)) values[name] = fallback === undefined ? '' : String(fallback)
  }

  watch(
    propDefs,
    (defs) => {
      for (const [name, def] of defs) initValue(name, def.type, def.default)
    },
    { immediate: true },
  )

  // Vue 给自定义元素打 v-bind 时，只要该 key 在元素上是已定义的属性，就走 property 通道而不是
  // attribute 通道 —— 而桥接层给每个声明过的 prop 都装了 accessor。所以这里必须传**已定型**的值：
  // 传字符串会原样落进组件（`count` 变成 `'7'`，Vue 报 prop 类型警告），传 `''` 表示布尔为真更是
  // 直接失效（Vue 的 Boolean prop 转换把 `''` 一律当 false）。
  //
  // 源码模式与 WC 模式用的是同一份值：Vue / React 组件收到的 props 与 WC 收到的 property 在此没有差别。
  const model = computed<Record<string, unknown>>(() => {
    const result: Record<string, unknown> = {}
    for (const [name, def] of propDefs.value) {
      if (def.type === 'boolean') result[name] = booleanValues[name]
      else if (def.type === 'number') result[name] = Number(values[name] || 0)
      else result[name] = values[name]
    }
    return result
  })

  return { propDefs, values, booleanValues, model }
}

export interface EventLog {
  entries: Ref<EventEntry[]>
  log: (name: string, detail: unknown) => void
  wcHandlers: ComputedRef<Record<string, (e: Event) => void>>
}

/** 事件日志。`wcHandlers` 是 WC 模式要的 `v-on` 映射 —— 事件名得自己拼 `ew-` 前缀。 */
export function useEventLog(eventNames: Ref<string[] | undefined>): EventLog {
  const entries = ref<EventEntry[]>([])

  function log(name: string, detail: unknown): void {
    entries.value.unshift({ name, detail, at: new Date().toLocaleTimeString() })
    entries.value = entries.value.slice(0, 20)
  }

  // 源码模式不用它：VueMount / ReactMount 把全部事件都交给同一个 onEvent 回调，与事件名无关。
  // WC 模式必须在宿主元素上逐个绑 —— 不绑就没有监听者，这就是原来只写死 @ew-select 时
  // meta.events 里其他事件收不到的原因。
  const wcHandlers = computed<Record<string, (e: Event) => void>>(() =>
    Object.fromEntries(
      (eventNames.value ?? []).map((name) => [
        `ew-${name}`,
        (e: Event) => log(name, (e as CustomEvent).detail),
      ]),
    ),
  )

  return { entries, log, wcHandlers }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm run test -- preview-state
```

Expected: PASS，7 个用例。

- [ ] **Step 5: 实现 `devtools/shared/component-index.ts`**

```ts
import type { ComponentMeta } from '@ew/runtime'

export interface ComponentEntry {
  name: string
  workspace: string
  framework: 'vue' | 'react'
  meta: ComponentMeta | undefined
  source: unknown
}

export interface WorkspaceGroup {
  id: string
  title: string
  items: ComponentEntry[]
}

// glob 生成的 key 形状（别名前缀 / 绝对路径 / 相对路径）是实现细节，只取倒数第几段目录名 ——
// `workspaces/<空间>/…` 这一段的相对位置不变，两种 key 形状下标一致。
const metaModules = import.meta.glob('@src/workspaces/*/components/*/meta.ts', {
  eager: true,
}) as Record<string, { default: ComponentMeta }>

const sourceModules = import.meta.glob('@src/workspaces/*/components/*/Component.{vue,tsx}', {
  eager: true,
}) as Record<string, { default: unknown }>

const workspaceModules = import.meta.glob('@src/workspaces/*/workspace.ts', {
  eager: true,
}) as Record<string, { default: { title?: string } }>

function segments(path: string): string[] {
  return path.split('/')
}

// 以**源码文件**为准枚举组件，而不是 meta.ts —— 组件是否存在的判据是 Component.vue / Component.tsx
// （构建期与文档站都是这么判的）。缺 meta.ts 的组件不该从列表里消失，只是一时没有 tag 与属性。
export const components: ComponentEntry[] = Object.entries(sourceModules)
  .map(([path, mod]) => {
    const parts = segments(path)
    const name = parts.at(-2) ?? ''
    const metaPath = Object.keys(metaModules).find((p) => segments(p).at(-2) === name)
    return {
      name,
      workspace: parts.at(-4) ?? '',
      framework: path.endsWith('.vue') ? 'vue' : 'react',
      meta: metaPath ? metaModules[metaPath]?.default : undefined,
      source: mod.default,
    } satisfies ComponentEntry
  })
  .sort((a, b) => a.name.localeCompare(b.name))

export function componentByName(name: string): ComponentEntry | undefined {
  return components.find((c) => c.name === name)
}

const workspaceTitles = new Map(
  Object.entries(workspaceModules).map(([path, mod]) => [
    segments(path).at(-2) ?? '',
    mod.default?.title ?? segments(path).at(-2) ?? '',
  ]),
)

export function groupByWorkspace(): WorkspaceGroup[] {
  const groups = new Map<string, WorkspaceGroup>()

  for (const entry of components) {
    const group = groups.get(entry.workspace) ?? {
      id: entry.workspace,
      title: workspaceTitles.get(entry.workspace) ?? entry.workspace,
      items: [],
    }
    group.items.push(entry)
    groups.set(entry.workspace, group)
  }

  return [...groups.values()]
}
```

- [ ] **Step 6: `ComponentDemo.vue` 改接共享层**

整个 `<script setup>` 换成下面这段（模板与样式只动后面点名的几处）：

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { componentByName } from '@devtools/component-index'
import { useEventLog, usePropControls } from '@devtools/preview-state'
import ReactMount from '@devtools/mount/ReactMount.vue'
import VueMount from '@devtools/mount/VueMount.vue'

const props = defineProps<{ name: string }>()

const entry = computed(() => componentByName(props.name))
const meta = computed(() => entry.value?.meta)
const framework = computed(() => entry.value?.framework ?? 'react')
const sourceComponent = computed(() => entry.value?.source)
const tag = computed(() => meta.value?.tag ?? '')

const { propDefs, values, booleanValues, model } = usePropControls(meta)
const { entries: events, log, wcHandlers } = useEventLog(computed(() => meta.value?.events))

// 文档站的读者是组件消费者，他们实际拿到的是 WC
const mode = ref<'source' | 'wc'>('wc')

async function enableWc(): Promise<void> {
  const modules = (await import('virtual:ew-wc-index')) as {
    default: Record<string, { Element: CustomElementConstructor }>
  }
  const mod = modules.default[props.name]
  if (!mod || !tag.value) return
  if (!customElements.get(tag.value)) customElements.define(tag.value, mod.Element)
}

watch(mode, (next) => {
  if (next === 'wc') void enableWc()
})

// 必须挂在 onMounted，不能用 watch 的 immediate —— <ClientOnly> 挡的是它 slot 里的内容，
// 本组件的 setup 在 SSR 期照样执行，immediate 会在 Node 里 import 到顶层就 `extends HTMLElement`
// 的运行时模块，直接 `HTMLElement is not defined` 炸掉构建。
onMounted(() => {
  if (mode.value === 'wc') void enableWc()
})
</script>
```

模板里改三处：

1. `:props-data="propsData"` → `:props-data="model"`（`VueMount` 与 `ReactMount` 各一处）
2. `:on-event="handleEvent"` → `:on-event="log"`（同上两处）
3. `<component :is="tag" v-else v-bind="wcProps" @ew-select="handleEvent('select', ($event as CustomEvent).detail)" />` 改为：

```html
          <component :is="tag" v-else v-bind="model" v-on="wcHandlers" />
```

`<style scoped>` 一字不动。

- [ ] **Step 7: 验证**

```bash
pnpm run typecheck && pnpm run test && pnpm run docs:build
```

Expected: 三条全绿。`test` 的总数比改动前多 7 个用例、多 1 个文件。

- [ ] **Step 8: 提交**

```bash
git add devtools/shared/preview-state.ts devtools/shared/component-index.ts tests/devtools docs/.vitepress/theme/components/ComponentDemo.vue
git commit -m "refactor(devtools): 面板状态与组件索引抽成共享层，事件改按 meta.events 绑定"
```

---

## Task 3: 调试页应用骨架

**Files:**
- Create: `devtools/index.html`、`devtools/vite.config.ts`、`devtools/src/main.ts`、`devtools/src/shell.css`、`devtools/src/App.vue`
- Modify: `package.json`、`docs/.vitepress/config.mts`

- [ ] **Step 1: `devtools/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>easy-webcomp 调试页</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: `devtools/vite.config.ts`**

```ts
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { wcModePlugin } from './shared/wc-mode'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const workspacesDir = resolve(root, 'src/workspaces')

export default defineConfig({
  resolve: {
    alias: {
      '@src': resolve(root, 'src'),
      '@devtools': resolve(root, 'devtools/shared'),
    },
  },
  // 与 docs/.vitepress/config.mts、scripts/build.ts 是同一份约定：组件里的 `@use '<空间>/styles'` 靠它解析。
  // 两个键都写 —— 根构建跑 Vite 7（现代 Sass API 认 loadPaths），VitePress 内嵌 Vite 5（旧 API 只认
  // includePaths），旧 API 收到 loadPaths 会当没看见。少写一条，那类管线的 .scss 就构建失败。
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: [workspacesDir],
        includePaths: [workspacesDir],
      },
    },
  },
  plugins: [
    // 少了它，Vue 会把 <ew-*> 当未知组件报警告，devtools 面板里的组件反而渲染不出来
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag: string) => tag.startsWith('ew-'),
        },
      },
    }),
    react(),
    tailwind(),
    wcModePlugin(workspacesDir),
  ],
  // strictPort：5173 被占时 `vitepress dev` 会静默顺延到 5174/5175，探默认端口就打到别人的旧服务上。
  // 调试页要的是「启动即报错」，不是「悄悄换个端口」。
  server: { port: 5273, strictPort: true },
})
```

- [ ] **Step 3: `devtools/src/main.ts`**

```ts
import { createApp } from 'vue'
import '@src/tokens/tokens.css'
import App from './App.vue'
import './shell.css'

createApp(App).mount('#app')
```

- [ ] **Step 4: `devtools/src/shell.css`**

```css
* {
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  margin: 0;
}

body {
  font-family: var(--ew-font-family);
  font-size: var(--ew-font-size-md);
  color: var(--ew-color-text);
  /* 外壳底色写死中性灰：tokens.css 里没有「应用底色」这一档 —— 它服务组件，不服务宿主页面。
     这里只需要与舞台的 --ew-color-bg 拉开层次。 */
  background: #f5f6f7;
}

button {
  font: inherit;
  cursor: pointer;
}
```

- [ ] **Step 5: `devtools/src/App.vue`（骨架版）**

```vue
<template>
  <div class="app">
    <p class="boot">easy-webcomp 调试页：骨架已就绪</p>
  </div>
</template>

<style scoped>
.app {
  padding: 24px;
}
.boot {
  color: var(--ew-color-text-secondary);
}
</style>
```

- [ ] **Step 6: `package.json` 的 `dev` 指向调试页**

```json
    "dev": "vite devtools",
    "docs:dev": "vitepress dev docs",
```

`dev` 原来是 `vitepress dev docs`（与 `docs:dev` 同一条），本次拆开。

- [ ] **Step 7: 给文档站 dev 也上 `strictPort`**

`docs/.vitepress/config.mts` 的 `vite` 块里，`resolve` 之前加：

```ts
    // 5173 被占时 vitepress dev 会静默顺延到 5174/5175，探默认端口就打到别人的旧服务上 ——
    // 已经因此把「配置改了没生效」误判过一次。strictPort 把它变成启动即报错。
    server: { port: 5173, strictPort: true },
```

- [ ] **Step 8: 起一次 dev server 确认装得上**

```bash
pnpm dev > /tmp/ew-debug-dev.log 2>&1 &
echo $! > /tmp/ew-debug-dev.pid
until curl -sf http://localhost:5273/ > /dev/null; do sleep 0.5; done
# 端口必须是自己刚起的那个：残留进程占用时 strictPort 会直接报错，
# 但「看起来起来了、其实是别人的服务」只能靠这条确认
lsof -nP -iTCP:5273 -sTCP:LISTEN
curl -s http://localhost:5273/ | head -20
kill "$(cat /tmp/ew-debug-dev.pid)" && rm /tmp/ew-debug-dev.pid
```

Expected: `lsof` 只有本进程一行；curl 输出含 `<div id="app"></div>`。

> 用 PID 文件而不是 `%1`：这些步骤会跨多次 shell 调用执行，作业号不跨会话存活，`kill %1` 会打到别的东西上。后面每个起 server 的步骤都照这个写法收尾。

- [ ] **Step 9: 确认文档站没被 strictPort 带坏**

```bash
pnpm run docs:build
```

Expected: 绿。

- [ ] **Step 10: 提交**

```bash
git add devtools/index.html devtools/vite.config.ts devtools/src/main.ts devtools/src/shell.css devtools/src/App.vue package.json docs/.vitepress/config.mts
git commit -m "feat(devtools): 独立调试页应用骨架，pnpm dev 指向它"
```

> `package.json` 只加了脚本一行？确认 `git diff package.json` 里没有 `axios` / `element-plus` / `pinia` 那三行（那是在制品 `self-monitor` 的依赖）。若有，说明你 `git add` 的路径写错了，回退重来。

---

## Task 4: 左栏组件选择器

**Files:**
- Create: `devtools/src/use-persisted.ts`、`devtools/src/ComponentPicker.vue`
- Modify: `devtools/src/App.vue`

- [ ] **Step 1: `devtools/src/use-persisted.ts`**

```ts
import { shallowRef, watch, type ShallowRef } from 'vue'

const PREFIX = 'ew-debug:'

/**
 * 调试页的选中项 / 尺寸存 localStorage，下次打开回到上次状态。
 * 读不到或解析失败一律回落默认值 —— 调试点坏了不该让页面打不开。
 */
export function usePersisted<T extends string | number | boolean>(
  key: string,
  fallback: T,
): ShallowRef<T> {
  let initial = fallback

  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw !== null) initial = JSON.parse(raw) as T
  } catch {
    initial = fallback
  }

  const value = shallowRef<T>(initial)

  watch(value, (next) => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(next))
    } catch {
      // 隐私模式下 setItem 会抛。存不上就算了，不影响本次调试
    }
  })

  return value
}
```

- [ ] **Step 2: `devtools/src/ComponentPicker.vue`**

```vue
<script setup lang="ts">
import { groupByWorkspace } from '@devtools/component-index'

const selected = defineModel<string>({ required: true })
// glob 是 eager 的、组件清单在启动时就定下了，所以这里算一次即可
const groups = groupByWorkspace()
</script>

<template>
  <nav class="picker">
    <h2>组件</h2>

    <div v-for="group in groups" :key="group.id" class="group">
      <p class="group-title">{{ group.title }}</p>
      <button
        v-for="item in group.items"
        :key="item.name"
        type="button"
        :class="{ active: item.name === selected }"
        @click="selected = item.name"
      >
        <span class="dot" :class="item.framework" />
        {{ item.name }}
      </button>
    </div>

    <p v-if="groups.length === 0" class="empty">没有扫描到组件</p>
  </nav>
</template>

<style scoped>
.picker {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 220px;
  padding: 16px;
  overflow: auto;
  border-right: 1px solid var(--ew-color-border);
  background: var(--ew-color-bg);
}
.picker h2 {
  margin: 0 0 12px;
  font-size: var(--ew-font-size-md);
}
.group-title {
  margin: 12px 0 6px;
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
.picker button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--ew-radius-sm);
  background: none;
  color: inherit;
  text-align: left;
}
.picker button:hover {
  background: color-mix(in srgb, var(--ew-color-primary) 8%, transparent);
}
.picker button.active {
  background: var(--ew-color-primary);
  color: #fff;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ew-color-text-secondary);
}
.dot.vue {
  background: #42b883;
}
.dot.react {
  background: #61dafb;
}
.empty {
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
</style>
```

- [ ] **Step 3: `App.vue` 接上选择状态**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { components } from '@devtools/component-index'
import ComponentPicker from './ComponentPicker.vue'
import { usePersisted } from './use-persisted'

const selected = usePersisted('component', components[0]?.name ?? '')
// 存下来的组件名可能已经被删掉，落回第一个 —— 否则打开就是一片空白
if (!components.some((c) => c.name === selected.value)) selected.value = components[0]?.name ?? ''

const entry = computed(() => components.find((c) => c.name === selected.value))
</script>

<template>
  <div class="app">
    <ComponentPicker v-model="selected" />
    <main class="main">
      <p class="boot">{{ entry ? `${entry.name}（${entry.framework}）` : '左栏选一个组件' }}</p>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100dvh;
}
.main {
  flex: 1;
  min-width: 0;
  padding: 24px;
}
.boot {
  color: var(--ew-color-text-secondary);
}
</style>
```

- [ ] **Step 4: 起 dev 手工确认**

```bash
pnpm dev > /tmp/ew-debug-dev.log 2>&1 &
echo $! > /tmp/ew-debug-dev.pid
until curl -sf http://localhost:5273/ > /dev/null; do sleep 0.5; done
```

浏览器打开 `http://localhost:5273/`：左栏应列出「演示组件 → hello-react / hello-vue」（点颜色区分框架），点击后主区文字跟着变。

这一步要看渲染结果，**执行者看不到浏览器** —— 起好服务后把地址交给用户确认，不要自行判定通过。确认后收尾：

```bash
kill "$(cat /tmp/ew-debug-dev.pid)" && rm /tmp/ew-debug-dev.pid
```

- [ ] **Step 5: 提交**

```bash
git add devtools/src/use-persisted.ts devtools/src/ComponentPicker.vue devtools/src/App.vue
git commit -m "feat(devtools): 左栏组件选择器，按空间分组"
```

---

## Task 5: 主区舞台（双模式 + resize + 预设 + 读数）

**Files:**
- Create: `devtools/src/ResizeHandle.vue`、`devtools/src/DebugStage.vue`
- Modify: `devtools/src/App.vue`

- [ ] **Step 1: `devtools/src/ResizeHandle.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  direction: 'horizontal' | 'vertical'
  applyDelta: (delta: number) => void
}>()

const dragging = ref(false)
let start = 0

function axis(event: PointerEvent): number {
  return props.direction === 'horizontal' ? event.clientX : event.clientY
}

function onPointerDown(event: PointerEvent): void {
  dragging.value = true
  start = axis(event)
  // 捕获指针：拖出把手甚至拖出窗口，pointermove 仍然回到这里
  ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging.value) return
  const current = axis(event)
  props.applyDelta(current - start)
  start = current
}

function onPointerUp(): void {
  dragging.value = false
}
</script>

<template>
  <div
    class="handle"
    :class="direction"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  />
</template>

<style scoped>
.handle {
  position: absolute;
  /* touch-action: none 少了，触屏上拖拽会变成页面滚动 */
  touch-action: none;
  user-select: none;
}
.handle:hover {
  background: color-mix(in srgb, var(--ew-color-primary) 35%, transparent);
}
/* 跨在边缘上：一半在内一半在外。完全放外侧在「铺满」时没有空间，
   而跨边同样能压过组件自己的 pointer 处理，且只遮挡 4px。 */
.horizontal {
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: ew-resize;
}
.vertical {
  bottom: -4px;
  left: 0;
  width: 100%;
  height: 8px;
  cursor: ns-resize;
}
</style>
```

- [ ] **Step 2: `devtools/src/DebugStage.vue`**

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ComponentEntry } from '@devtools/component-index'
import ReactMount from '@devtools/mount/ReactMount.vue'
import VueMount from '@devtools/mount/VueMount.vue'
import ResizeHandle from './ResizeHandle.vue'
import { usePersisted } from './use-persisted'

const props = defineProps<{
  entry: ComponentEntry | undefined
  model: Record<string, unknown>
  wcHandlers: Record<string, (e: Event) => void>
  onEvent: (name: string, detail: unknown) => void
}>()

const mode = usePersisted<'wc' | 'source'>('mode', 'wc')
const width = usePersisted('width', 375)
const height = usePersisted('height', 480)
const fill = usePersisted('fill', false)
const fillTarget = usePersisted('fillTarget', true)

const MIN_WIDTH = 120
const MIN_HEIGHT = 80
const PRESETS = [375, 768, 1024]

const tag = computed(() => props.entry?.meta?.tag ?? '')
const framework = computed(() => props.entry?.framework ?? 'react')

const body = ref<HTMLElement | null>(null)
const measured = ref({ width: 0, height: 0 })
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!body.value) return
  observer = new ResizeObserver(([record]) => {
    const rect = record!.contentRect
    measured.value = { width: Math.round(rect.width), height: Math.round(rect.height) }
  })
  observer.observe(body.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

const frameStyle = computed(() => ({
  width: fill.value ? '100%' : `${width.value}px`,
  height: `${height.value}px`,
}))

// 组件的 :host 是 inline-block（脚手架生成），不撑满的话它按内容收缩 ——
// 把容器改成 375px 对组件毫无作用，自适应调试就假了。
// 宿主元素上外部文档的普通声明优先于 shadow tree 里的 :host 规则，所以内联样式压得过它。
const targetStyle = computed(() => (props.fillTarget ? { display: 'block', width: '100%' } : {}))

// WC 模式必须复用组件自己的 index.ts（UI 库样式内联、Pinia 按实例装都在里面），
// 所以走 wc-mode 插件的虚拟模块，而不是在这里重造元素
async function enableWc(): Promise<void> {
  const modules = (await import('virtual:ew-wc-index')) as {
    default: Record<string, { Element: CustomElementConstructor }>
  }
  const mod = modules.default[props.entry?.name ?? '']
  if (!mod || !tag.value) return
  // 同 tag 重复 define 会直接抛错；customElements.get 是跨 bundle 场景下唯一有效的防线
  if (!customElements.get(tag.value)) customElements.define(tag.value, mod.Element)
}

watch(
  [() => props.entry?.name, mode],
  () => {
    if (mode.value === 'wc') void enableWc()
  },
  { immediate: true },
)

function resizeWidth(delta: number): void {
  // 「铺满」时状态里的 width 不是真实宽度，先从实测值起步再退出铺满
  const base = fill.value ? measured.value.width : width.value
  fill.value = false
  width.value = Math.max(MIN_WIDTH, base + delta)
}

function resizeHeight(delta: number): void {
  height.value = Math.max(MIN_HEIGHT, height.value + delta)
}

function applyPreset(value: number): void {
  fill.value = false
  width.value = value
}
</script>

<template>
  <section class="stage">
    <header class="stage-head">
      <div class="switch">
        <button type="button" :class="{ active: mode === 'wc' }" @click="mode = 'wc'">
          WC 模式
        </button>
        <button type="button" :class="{ active: mode === 'source' }" @click="mode = 'source'">
          源码模式
        </button>
      </div>

      <div class="switch">
        <button
          v-for="preset in PRESETS"
          :key="preset"
          type="button"
          :class="{ active: !fill && width === preset }"
          @click="applyPreset(preset)"
        >
          {{ preset }}
        </button>
        <button type="button" :class="{ active: fill }" @click="fill = true">铺满</button>
      </div>

      <button type="button" :class="{ active: fillTarget }" @click="fillTarget = !fillTarget">
        组件撑满容器
      </button>

      <p class="readout">{{ measured.width }} × {{ measured.height }}</p>
    </header>

    <div class="stage-area">
      <div class="stage-frame" :style="frameStyle">
        <div ref="body" class="stage-body">
          <p v-if="!entry" class="placeholder">左栏选一个组件</p>

          <component
            v-else-if="mode === 'wc' && tag"
            :is="tag"
            :style="targetStyle"
            v-bind="model"
            v-on="wcHandlers"
          />

          <VueMount
            v-else-if="mode === 'source' && framework === 'vue'"
            :name="entry.name"
            :component="entry.source as never"
            :props-data="model"
            :on-event="onEvent"
          />
          <ReactMount
            v-else-if="mode === 'source'"
            :name="entry.name"
            :component="entry.source as never"
            :props-data="model"
            :on-event="onEvent"
          />
        </div>

        <ResizeHandle direction="horizontal" :apply-delta="resizeWidth" />
        <ResizeHandle direction="vertical" :apply-delta="resizeHeight" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.stage-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ew-color-border);
  background: var(--ew-color-bg);
}
.readout {
  margin: 0 0 0 auto;
  color: var(--ew-color-text-secondary);
  font-variant-numeric: tabular-nums;
}
.stage-area {
  display: flex;
  flex: 1;
  align-items: flex-start;
  justify-content: center;
  padding: 24px;
  overflow: auto;
}
.stage-frame {
  position: relative;
  /* 用 box-shadow 画边框：阴影不占布局，实测宽度才严格等于设定的那个数 */
  box-shadow: 0 0 0 1px var(--ew-color-border);
  border-radius: var(--ew-radius-md);
}
.stage-body {
  width: 100%;
  height: 100%;
  overflow: auto;
  border-radius: var(--ew-radius-md);
  /* 组件配色基于浅色，跟随系统深色会让它深字压深底 —— 与文档站的 .canvas 同一个理由 */
  background: var(--ew-color-bg);
  color: var(--ew-color-text);
}
.placeholder {
  margin: 0;
  padding: 16px;
  color: var(--ew-color-text-secondary);
}
.switch {
  display: flex;
}
.switch button {
  padding: 4px 10px;
  border: 1px solid var(--ew-color-border);
  background: var(--ew-color-bg);
  color: var(--ew-color-text);
  font-size: var(--ew-font-size-sm);
}
.switch button:not(:first-child) {
  border-left: none;
}
.switch button:first-child {
  border-radius: var(--ew-radius-sm) 0 0 var(--ew-radius-sm);
}
.switch button:last-child {
  border-radius: 0 var(--ew-radius-sm) var(--ew-radius-sm) 0;
}
.switch button.active {
  border-color: var(--ew-color-primary);
  background: var(--ew-color-primary);
  color: #fff;
}
.stage-head > button {
  padding: 4px 10px;
  border: 1px solid var(--ew-color-border);
  border-radius: var(--ew-radius-sm);
  background: var(--ew-color-bg);
  color: var(--ew-color-text);
  font-size: var(--ew-font-size-sm);
}
.stage-head > button.active {
  border-color: var(--ew-color-primary);
  color: var(--ew-color-primary);
}
</style>
```

- [ ] **Step 3: `App.vue` 用舞台替掉占位，并接上面板状态**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { components } from '@devtools/component-index'
import { useEventLog, usePropControls } from '@devtools/preview-state'
import ComponentPicker from './ComponentPicker.vue'
import DebugStage from './DebugStage.vue'
import { usePersisted } from './use-persisted'

const selected = usePersisted('component', components[0]?.name ?? '')
// 存下来的组件名可能已经被删掉，落回第一个 —— 否则打开就是一片空白
if (!components.some((c) => c.name === selected.value)) selected.value = components[0]?.name ?? ''

const entry = computed(() => components.find((c) => c.name === selected.value))
const meta = computed(() => entry.value?.meta)

// 属性值与事件日志由 App 持有：主区要渲染它们，右栏要编辑 / 展示它们，必须是同一份
const { model } = usePropControls(meta)
const { log, wcHandlers } = useEventLog(computed(() => meta.value?.events))
</script>

<template>
  <div class="app">
    <ComponentPicker v-model="selected" />
    <DebugStage :entry="entry" :model="model" :wc-handlers="wcHandlers" :on-event="log" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100dvh;
}
</style>
```

- [ ] **Step 4: 起 dev 手工确认**

```bash
pnpm dev > /tmp/ew-debug-dev.log 2>&1 &
echo $! > /tmp/ew-debug-dev.pid
until curl -sf http://localhost:5273/ > /dev/null; do sleep 0.5; done
```

把 `http://localhost:5273/` 交给用户，请他逐条确认（执行者看不到浏览器，不要自行判定通过）：

1. 默认 WC 模式，组件渲染出来（`hello-react` 是首个，点 `hello-vue` 切过去）。
2. 点 `375` / `768` / `1024`，容器宽度跟着变，右上读数等于预设值。
3. 拖右侧把手能连续改宽，拖底部把手能改高，读数跟着走；拖到很小时停在 120 × 80。
4. 点「铺满」容器撑满可用宽度；此时拖右把手，从当前实测宽度接着变（不跳回 375）。
5. 关掉「组件撑满容器」，组件按内容收缩；打开则撑满。
6. 切「源码模式」外观与 WC 模式一致（说明 `componentStyle` 补齐仍生效）。

确认后收尾：

```bash
kill "$(cat /tmp/ew-debug-dev.pid)" && rm /tmp/ew-debug-dev.pid
```

- [ ] **Step 5: 提交**

```bash
git add devtools/src/ResizeHandle.vue devtools/src/DebugStage.vue devtools/src/App.vue
git commit -m "feat(devtools): 主区舞台，双模式 + 拖拽/预设尺寸 + 实测读数"
```

---

## Task 6: 右栏属性面板与事件日志

**Files:**
- Create: `devtools/src/PropPanel.vue`、`devtools/src/EventLog.vue`
- Modify: `devtools/src/App.vue`

- [ ] **Step 1: `devtools/src/PropPanel.vue`**

```vue
<script setup lang="ts">
import type { PropDefinition } from '@ew/runtime'

defineProps<{
  propDefs: Array<[string, PropDefinition]>
  values: Record<string, string>
  booleanValues: Record<string, boolean>
}>()
</script>

<template>
  <section class="panel">
    <h2>属性</h2>

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
  </section>
</template>

<style scoped>
.panel h2 {
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
  margin: 0;
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
</style>
```

- [ ] **Step 2: `devtools/src/EventLog.vue`**

```vue
<script setup lang="ts">
import type { EventEntry } from '@devtools/preview-state'

defineProps<{ entries: EventEntry[] }>()
</script>

<template>
  <section class="panel">
    <h2>事件日志</h2>

    <p v-if="entries.length === 0" class="empty">操作组件试试</p>
    <ul v-else>
      <li v-for="(entry, i) in entries" :key="i">
        <code>ew-{{ entry.name }}</code> · {{ entry.at }} · {{ JSON.stringify(entry.detail) }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.panel h2 {
  margin: 0 0 12px;
  font-size: var(--ew-font-size-md);
}
ul {
  margin: 0;
  padding-left: 18px;
  font-size: var(--ew-font-size-sm);
}
.empty {
  margin: 0;
  color: var(--ew-color-text-secondary);
  font-size: var(--ew-font-size-sm);
}
</style>
```

- [ ] **Step 3: `App.vue` 加上右栏**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { components } from '@devtools/component-index'
import { useEventLog, usePropControls } from '@devtools/preview-state'
import ComponentPicker from './ComponentPicker.vue'
import DebugStage from './DebugStage.vue'
import EventLog from './EventLog.vue'
import PropPanel from './PropPanel.vue'
import { usePersisted } from './use-persisted'

const selected = usePersisted('component', components[0]?.name ?? '')
// 存下来的组件名可能已经被删掉，落回第一个 —— 否则打开就是一片空白
if (!components.some((c) => c.name === selected.value)) selected.value = components[0]?.name ?? ''

const entry = computed(() => components.find((c) => c.name === selected.value))
const meta = computed(() => entry.value?.meta)

// 属性值与事件日志由 App 持有：主区要渲染它们，右栏要编辑 / 展示它们，必须是同一份
const { propDefs, values, booleanValues, model } = usePropControls(meta)
const { entries: events, log, wcHandlers } = useEventLog(computed(() => meta.value?.events))
</script>

<template>
  <div class="app">
    <ComponentPicker v-model="selected" />
    <DebugStage :entry="entry" :model="model" :wc-handlers="wcHandlers" :on-event="log" />
    <aside class="side">
      <PropPanel :prop-defs="propDefs" :values="values" :boolean-values="booleanValues" />
      <EventLog :entries="events" />
    </aside>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100dvh;
}
.side {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 16px;
  width: 280px;
  padding: 16px;
  overflow: auto;
  border-left: 1px solid var(--ew-color-border);
  background: var(--ew-color-bg);
}
</style>
```

- [ ] **Step 4: 起 dev 手工确认**

```bash
pnpm dev > /tmp/ew-debug-dev.log 2>&1 &
echo $! > /tmp/ew-debug-dev.pid
until curl -sf http://localhost:5273/ > /dev/null; do sleep 0.5; done
```

把 `http://localhost:5273/` 交给用户确认：

1. 右栏按 `meta.ts` 的 `props` 渲染出三种控件（`hello-vue` 应是 name 文本框、count 数字框、autoLoad 复选框）。
2. 改 name，组件上的文字跟着变；改 count 同理。
3. WC 模式下点组件的按钮，事件日志出现 `ew-select` 与 detail（这是动态绑定生效的直接证据 —— 之前写死的就是这一个，换成别的组件就收不到了）。
4. 切到 `hello-react`，属性面板换成它的 `props`，事件日志保留历史记录。

确认后收尾：

```bash
kill "$(cat /tmp/ew-debug-dev.pid)" && rm /tmp/ew-debug-dev.pid
```

- [ ] **Step 5: 提交**

```bash
git add devtools/src/PropPanel.vue devtools/src/EventLog.vue devtools/src/App.vue
git commit -m "feat(devtools): 右栏属性面板与事件日志"
```

---

## Task 7: 调试页 e2e 冒烟

**Files:**
- Create: `tests/e2e/debug-page.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: `playwright.config.ts` 的 `webServer` 改成数组**

```ts
  webServer: [
    {
      command: 'node tests/e2e/server.mjs',
      url: 'http://localhost:4173/tests/e2e/fixture/index.html',
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
    },
    {
      // 调试页单独占 5274：不与开发者开着的 pnpm dev（5273）打架，verify 因此不必先关 dev。
      // reuseExistingServer 必须为 false —— 复用任何残留进程都会把「假红」重新引进来，
      // 而 strictPort 会把「端口被占」变成起服务时的硬报错，不会退化成静默换端口。
      command: 'pnpm exec vite devtools --port 5274 --strictPort',
      url: 'http://localhost:5274/',
      reuseExistingServer: false,
      stdout: 'ignore',
    },
  ],
```

- [ ] **Step 2: 写冒烟用例**

新建 `tests/e2e/debug-page.spec.ts`：

```ts
import { expect, test } from '@playwright/test'

// 调试页 dev server 在 5274（见 playwright.config.ts），与全局 baseURL（4173 的静态服务器）
// 不同源，所以这里写绝对地址。
const DEBUG_URL = 'http://localhost:5274/'

test('调试页：WC 模式渲染、预设改宽、源码模式可用', async ({ page }) => {
  await page.goto(DEBUG_URL)

  await page.locator('nav.picker button', { hasText: 'hello-vue' }).click()

  // WC 模式：元素已升级，且内容渲染进 shadow root
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector('.stage-body ew-hello-vue')?.shadowRoot?.textContent ?? '',
      ),
    )
    .toContain('Vue 组件：World')

  // 预设 375 后，容器实测宽度就是 375
  await page.getByRole('button', { name: '375', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.round(document.querySelector('.stage-body')!.getBoundingClientRect().width),
      ),
    )
    .toBe(375)

  // 源码模式走的是另一条挂载链路（VueMount + componentStyle 补齐），单独验一次
  await page.getByRole('button', { name: '源码模式' }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => document.querySelector('.stage-body > div')?.shadowRoot?.textContent ?? '',
      ),
    )
    .toContain('Vue 组件：World')
})
```

- [ ] **Step 3: 跑 e2e**

```bash
pnpm run build && pnpm run test:e2e
```

Expected: 9 passed（原 8 条 + 新增 1 条）。`pnpm run build` 是必要的 —— 原有用例读 `dist/cdn/*.js`。

排障：若报 `Failed to load script at http://localhost:4173/dist/cdn/ew-all.js`，先用 `lsof -nP -iTCP:4173 -sTCP:LISTEN` 确认 4173 上是不是自己的静态服务器。`reuseExistingServer` 会静默复用任何占着 4173 的进程，症状看起来像构建坏了，其实不是。

- [ ] **Step 4: 再跑一次，确认可重复**

```bash
pnpm run test:e2e
```

Expected: 仍然 9 passed。这一条是专门验 `reuseExistingServer: false` + `strictPort` 的组合 —— dev server 每次都是新起的，`localStorage` 每次都是空的，用例不能依赖上一次留下的状态。

- [ ] **Step 5: 提交**

```bash
git add playwright.config.ts tests/e2e/debug-page.spec.ts
git commit -m "test(e2e): 调试页冒烟 —— WC 渲染、预设改宽、源码模式"
```

---

## Task 8: 文档跟上（`pnpm dev` 的语义变了）

`dev` 从「文档站」变成「调试页」，README、指南、以及两个脚手架的收尾提示都会指错地方。

**Files:**
- Modify: `README.md`、`docs/guide/index.md`、`docs/guide/authoring.md`、`scripts/new-workspace.ts`、`scripts/new-component.ts`

- [ ] **Step 1: `README.md` 快速开始**

第 9-12 行的代码块改成：

````markdown
```bash
pnpm install
pnpm dev            # 调试页：http://localhost:5273 —— 单组件调试，容器可 resize
pnpm docs:dev       # 文档站：http://localhost:5173
```
````

紧跟其后的段落（「文档站在 `docs/`，由 VitePress 驱动。…」）前面补一段：

```markdown
调试页一次只渲染一个组件，占满视口，容器可以拖拽或按 375 / 768 / 1024 / 铺满 改尺寸，还有实时像素读数——用来观察组件在窄容器下的自适应表现。左栏选组件，右栏改属性、看事件。它也扫 `src/workspaces/`，所以和文档站一样**新增目录后要重启**。
```

- [ ] **Step 2: `README.md` 里两处「重启 dev」指错地方**

第 44 行：

```markdown
目录名即工作空间 id，清单里不重复声明；只允许小写字母、数字与连字符，且以字母开头。**新建后要重启 `docs:dev`** —— 页面清单、侧边栏与 grid 都在启动时就定好了，运行时冒出来的新目录不会被收进去（新增组件同理）。
```

第 93 行（「新增组件目录后要重启 dev」那句）：

```markdown
**新增组件目录后要重启 `docs:dev`**，和工作空间同理：页面清单、侧边栏、grid 的 glob 都是在启动时定下的，运行时新建的目录不会被收进去。改已有组件的文件则不用重启，保存即热更新。
```

- [ ] **Step 3: `README.md` 的验证一节补上用例数**

先拿到真实数字：

```bash
pnpm run test 2>&1 | tail -5
```

`## 验证` 表格里的两处按输出改：`test` 行（现在是「8 个文件 56 个用例」，会变成 9 个文件 63 个用例）、`test:e2e` 行（「8 个用例」→「9 个用例」）。以实际输出为准，不要照抄这里的数字。

- [ ] **Step 4: `docs/guide/index.md` 的「本地开发」**

第 16-18 行改成：

````markdown
## 本地开发

```bash
pnpm dev            # 调试页：http://localhost:5273
pnpm docs:dev       # 文档站：http://localhost:5173
```

**调试页**一次只渲染一个组件，占满视口。容器可以拖拽，也可以按 375 / 768 / 1024 / 铺满 取预设，右上角有实时像素读数——调自适应与移动端场景用它。左栏选组件，右栏改属性、看事件。

文档站的每个组件页上也有一个交互面板，两种模式：
````

其后原有的两种模式说明与「两种模式下属性面板与事件日志都由 `meta.ts` 驱动」那句保持不变。

- [ ] **Step 5: `docs/guide/authoring.md` 的两处「重启 dev」**

第 19 行：

```markdown
目录名就是工作空间 id，清单里不重复声明。**新建后必须重启 `docs:dev`** —— 页面清单、侧边栏与 grid 都在启动时就定好了，运行时冒出来的新目录不会被收进去。
```

第 93 行：

```markdown
**新增组件目录后要重启 `docs:dev`**，和工作空间同理：页面清单、侧边栏、grid 的 glob 都是在启动时定下的，运行时新建的目录不会被收进去。改已有组件的文件则不用重启，保存即热更新。
```

- [ ] **Step 6: 两个脚手架的收尾提示**

`scripts/new-workspace.ts:74`：

```ts
  console.log('    4. 重启 docs:dev（pnpm run docs:dev）—— 页面清单与侧边栏在启动时就定好了')
```

`scripts/new-component.ts:568`：

```ts
  outro('完成。重启 docs:dev（pnpm run docs:dev）—— 页面清单与侧边栏在启动时就定好了')
```

- [ ] **Step 7: 确认没有漏网的旧提法**

```bash
grep -rn "重启 dev\|pnpm run dev" --include='*.md' --include='*.ts' . 2>/dev/null | grep -v node_modules | grep -v docs/superpowers
```

Expected: 无输出（`docs/superpowers/**` 是历史记录，不改，已被排除）。

- [ ] **Step 8: 提交**

```bash
git add README.md docs/guide/index.md docs/guide/authoring.md scripts/new-workspace.ts scripts/new-component.ts
git commit -m "docs: pnpm dev 改为调试页，同步 README、指南与脚手架提示"
```

---

## Task 9: 全量验证与人工确认

- [ ] **Step 1: 全链验证**

```bash
pnpm run verify
```

Expected: 六个阶段依次绿 —— `typecheck` → `test` → `build` → `check:artifacts`（两行「产物隔离正常」「exports 契约正常」）→ `docs:build` → `test:e2e`（9 个）。

本次没有改构建管线与组件源码，`build` 末尾打印的 gzip 体积应与既有基线持平（`hello-vue.js` 26.8 KB / `hello-react.js` 69.3 KB / `ew-all.js` 95.2 KB）。

- [ ] **Step 2: 人工确认文档站的交互面板没被重构打断**

`docs:build` 与 `typecheck` 能盖住 SSR 与类型，但盖不住「面板外观/行为变了」。这是 e2e 唯一覆盖不到的地方（e2e 只测 `dist/cdn/*.js` 产物，不测文档站）。

```bash
pnpm docs:dev > /tmp/ew-docs-dev.log 2>&1 &
echo $! > /tmp/ew-docs-dev.pid
until curl -sf http://localhost:5173/ > /dev/null; do sleep 0.5; done
```

请用户打开 `http://localhost:5173/workspaces/demo/hello-vue` 确认：

1. WC 模式与源码模式都渲染出组件，外观一致。
2. 属性面板三种控件都在、改动生效。
3. 点组件能收到事件日志。
4. 布局与改动前一致（`ComponentDemo` 的 `--vp-*` 样式没被碰过）。

确认后收尾：

```bash
kill "$(cat /tmp/ew-docs-dev.pid)" && rm /tmp/ew-docs-dev.pid
```

- [ ] **Step 3: 两个 dev server 能同时开**

```bash
pnpm dev > /tmp/ew-debug-dev.log 2>&1 &
echo $! > /tmp/ew-debug-dev.pid
pnpm docs:dev > /tmp/ew-docs-dev.log 2>&1 &
echo $! > /tmp/ew-docs-dev.pid
until curl -sf http://localhost:5273/ > /dev/null && curl -sf http://localhost:5173/ > /dev/null; do sleep 0.5; done
lsof -nP -iTCP:5273 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
kill "$(cat /tmp/ew-debug-dev.pid)" "$(cat /tmp/ew-docs-dev.pid)"
rm -f /tmp/ew-debug-dev.pid /tmp/ew-docs-dev.pid
```

Expected: 两个端口各只有一个监听者，且都是刚起的进程 —— 两条 `lsof` 的 PID 分别等于两个 pid 文件里的数字。

- [ ] **Step 4: 报告分支状态**

```bash
git log --oneline main..HEAD
git status --short
```

把分支状态报给用户，**不要**代为合并或推送。

---

## Self-Review

**Spec 覆盖**

| spec 章节 | 落在哪个任务 |
|---|---|
| 第 4 节 目录结构 | Task 1（shared）、Task 3-6（src） |
| 5.1 `wc-mode.ts` 原样搬迁 | Task 1 Step 1-2 |
| 5.2 `source-style.ts` 原样搬迁 | Task 1 Step 1 |
| 5.3 `mount/*` 只改相对 import | Task 1 Step 2 |
| 5.4 `component-index.ts` | Task 2 Step 5 |
| 5.5 `preview-state.ts`（含 `model` 合并两份实现、`wcHandlers` 动态事件） | Task 2 Step 1-4 |
| 5.6 文档站侧改动 | Task 1 Step 3-5、Task 2 Step 6 |
| 6.1 布局 | Task 4/5/6 的样式 |
| 6.2 resize（预设/拖拽/读数/撑满开关） | Task 5 |
| 6.3 双模式 | Task 5 Step 2 |
| 6.4 持久化 | Task 4 Step 1、Task 5 Step 2 |
| 7.1 五件套 | Task 3 Step 2 |
| 7.2 端口（5273/5274/5173 strictPort） | Task 3 Step 7、Task 7 Step 1 |
| 7.3 package.json 脚本 | Task 3 Step 6 |
| 7.4 tsconfig | Task 1 Step 3 |
| 7.5 tokens | Task 3 Step 3 |
| 第 9 节 测试与验证 | Task 2 Step 1-4、Task 7、Task 9 |
| 第 10 节 风险 | Task 1 Step 6（glob 在 docs root 外）、Task 9 Step 2（面板回归） |
| 第 11 节 验收 | Task 5 Step 4、Task 6 Step 4、Task 9 |

**命名一致性**：`usePropControls` / `useEventLog` / `componentByName` / `groupByWorkspace` / `ComponentEntry` / `EventEntry` / `WorkspaceGroup` / `usePersisted` / `applyDelta` / `resizeWidth` / `applyPreset` 在写出的代码块之间一致；`model`（不是 `propsData`/`wcProps`）在 Task 2/5/6 三处一致；`@devtools/*` 只映射到 `devtools/shared/*`，`mount/` 与两个 composable 的路径都落在映射内。

**无占位符**：每个改动步骤都给了完整代码；三道命令验证步骤都写了预期输出；未出现「类似 Task N」的引用。
