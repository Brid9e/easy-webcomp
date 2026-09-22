# easy-webcomp 包化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `src/runtime/` 拆成 pnpm workspace 包 `@ew/runtime` 与 `@ew/utils`，组件里 `../../../../runtime/vue` 一律换成 `@ew/runtime`。交付契约（tag、`exports` 键、CDN 单文件、产物体积）一个字节都不动。

**Architecture:** 两个**源码包**（`exports` 直接指向 `.ts`，无 dist、无子构建）。`@ew/runtime` 新增手写具名 re-export 的桶文件，仍被 Vite 内联进每个组件产物 —— 所以「Vue 产物不含 React」从结构性事实降级为一条依赖 tree-shaking 的性质，需要专门的产物守卫钉住。

**Tech Stack:** pnpm 11 workspace、Vite 7 lib mode、Vitest 3 + jsdom、vue-tsc、tsx、VitePress 1.6。

**Spec:** `docs/superpowers/specs/2026-09-22-ew-packages-design.md`

---

## 基线（重构前实测，供第 5、6 个任务比对）

| 标记 | `hello-vue.js` | `hello-react.js` | `ew-all.js` |
|---|---|---|---|
| `react-dom` | 0 | 1 | 1 |
| `__v_isRef` | 1 | 0 | 1 |

| 文件 | 大小 |
|---|---|
| `dist/cdn/hello-vue.js` | 68,580 B |
| `dist/cdn/hello-react.js` | 225,817 B |
| `dist/cdn/ew-all.js` | 292,760 B |

---

## 任务分解理由

`src/runtime` 里有两组东西各自可独立成立，拆开做：`naming.ts` 与 DOM/框架无关（三个消费方全是构建期代码），其余全是浏览器代码。所以 **Task 1 先建 `@ew/utils` 并搬走 naming**，让 runtime 包在 Task 3 里一次性整体搬完 —— 不搞「两个包各搬一半」的中间态。

`useEmit` 的改名（Task 2）**排在包化之前**：改完还是相对路径，改动面最小，红了也一眼能看出是改名引起的。若放到 Task 3 里，改名与搬包两件事同时失败，没法二分。

**Task 3 故意先让测试全红再逐批改回绿**：移动本身没有可测的行为变化，红的范围**就是**迁移面清单 —— 全红是一次免费的完整性检查，能证明没漏掉任何消费者。

---

## Task 1: `@ew/utils` 包

**Files:**
- Create: `tests/utils/naming.test.ts`
- Create: `packages/utils/package.json`
- Create: `packages/utils/src/naming.ts`
- Create: `packages/utils/src/index.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `scripts/build.ts:17`
- Modify: `scripts/new-component.ts:6`
- Modify: `docs/.vitepress/plugins/wc-mode.ts:4`
- Delete: `src/runtime/naming.ts`

- [ ] **Step 1: 写失败测试**

创建 `tests/utils/naming.test.ts`。这条测试的**真实目的是证明 `@ew/utils` 能被解析** —— 用例本身是顺带的。

```ts
import { describe, expect, it } from 'vitest'
import { toIdentifier } from '@ew/utils'

describe('toIdentifier（经 @ew/utils 包解析）', () => {
  it('连字符与下划线都按词边界切成大驼峰', () => {
    expect(toIdentifier('hello-vue')).toBe('HelloVue')
    expect(toIdentifier('hello_react')).toBe('HelloReact')
  })

  it('单词名首字母大写', () => {
    expect(toIdentifier('card')).toBe('Card')
  })

  it('数字开头的片段不炸', () => {
    expect(toIdentifier('chart-2d')).toBe('Chart2d')
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm exec vitest run tests/utils/naming.test.ts`
Expected: FAIL —— `Failed to resolve import "@ew/utils"`。这是预期的：包还不存在。

- [ ] **Step 3: 建包清单**

Run: `mkdir -p packages/utils/src`

创建 `packages/utils/package.json`：

```json
{
  "name": "@ew/utils",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

`types` 条件**必须排在 `default` 前面** —— TS 按顺序取第一个命中的条件。

- [ ] **Step 4: 搬 naming.ts**

`git mv src/runtime/naming.ts packages/utils/src/naming.ts`（目录先 `mkdir -p packages/utils/src`）。

文件内容一字不改：顶部那段「三处消费者必须完全一致」的注释里写的是 `scripts/build.ts` / `scripts/new-component.ts` / `docs/.vitepress/plugins/wc-mode.ts`，搬完之后依旧准确。

- [ ] **Step 5: 建桶**

创建 `packages/utils/src/index.ts`：

```ts
export { toIdentifier } from './naming'
```

- [ ] **Step 6: 建 workspace**

`pnpm-workspace.yaml` 改成（**`allowBuilds` 两条必须原样保留**，漏掉 core-js 那条会让 `pnpm install` 退出 1，进而让所有 `pnpm run *` 挂掉）：

```yaml
packages:
  - 'packages/*'

# core-js 的 install 脚本只是打印捐赠提示，跳过它没有任何代价；
# esbuild 必须放行，它要下载对应平台的二进制
allowBuilds:
  core-js: false
  esbuild: true
```

- [ ] **Step 7: 根包声明依赖**

`package.json` 的 `devDependencies` 里，按字母序插在 `@clack/prompts` 与 `@playwright/test` 之间：

```json
    "@ew/utils": "workspace:*",
```

是 `devDependencies` 而不是 `dependencies`：它只在构建期被 `scripts/` 与 `docs/` 插件使用，不进运行时代码。

- [ ] **Step 8: 装依赖建链接**

Run: `pnpm install`
Expected: 成功，且 `packages/utils` 被识别为 workspace 项目。`pnpm-lock.yaml` 会新增 importers 与 link 条目。

- [ ] **Step 9: 跑测试，确认转绿**

Run: `pnpm exec vitest run tests/utils/naming.test.ts`
Expected: PASS，3 passed。

- [ ] **Step 10: 三个消费方改包名**

`scripts/build.ts:17`：

```ts
import { toIdentifier } from '../src/runtime/naming'
```
→
```ts
import { toIdentifier } from '@ew/utils'
```

`scripts/new-component.ts:6`：同一处改动（同样的旧串）。

`docs/.vitepress/plugins/wc-mode.ts:4`：

```ts
import { toIdentifier } from '../../../src/runtime/naming'
```
→
```ts
import { toIdentifier } from '@ew/utils'
```

- [ ] **Step 11: 删掉旧位置**

`src/runtime/naming.ts` 已在 Step 4 被 `git mv` 走，此步确认目录里只剩 7 个文件：

Run: `ls src/runtime/`
Expected: `element.ts  props.ts  react.ts  registry.ts  style.ts  types.ts  vue.ts`

- [ ] **Step 12: 全量验证**

Run: `pnpm run typecheck && pnpm run test && pnpm run build && pnpm run docs:build`
Expected: 全绿。`docs:build` 是关键一条 —— 它同时验证了 VitePress 的 Vite 与 Node 两侧都能解析 `@ew/utils`。

- [ ] **Step 13: 提交**

```bash
git add packages/utils tests/utils pnpm-workspace.yaml pnpm-lock.yaml package.json \
  scripts/build.ts scripts/new-component.ts docs/.vitepress/plugins/wc-mode.ts
git commit -m "refactor(packages): 建 @ew/utils 包，naming 自 runtime 迁出"
```

---

## Task 2: `useEmit` 拆名 + `EmitFn` 收进 `types.ts`

**Files:**
- Modify: `src/runtime/types.ts`
- Modify: `src/runtime/vue.ts`
- Modify: `src/runtime/react.ts`
- Modify: `src/workspaces/demo/components/hello-vue/Component.vue`
- Modify: `src/workspaces/demo/components/hello-react/Component.tsx`
- Modify: `scripts/new-component.ts`
- Test: `tests/runtime/vue-adapter.test.ts`, `tests/runtime/react-adapter.test.tsx`

理由：`useEmit` 在两边实现不同（`inject` vs `useContext`），桶里无法共存，必须拆名。而 `EmitFn` 在两边**定义逐字相同**，是同一个类型写了两遍，收进 `types.ts` 一份即可，不需要改名。

- [ ] **Step 1: 测试先改用新名字**

`tests/runtime/vue-adapter.test.ts` 改 3 处：

第 6 行：
```ts
import { useEmit, vueAdapter } from '../../src/runtime/vue'
```
→
```ts
import { useVueEmit, vueAdapter } from '../../src/runtime/vue'
```

第 17 行 `const emit = useEmit()` → `const emit = useVueEmit()`

第 76 行测试名 `it('useEmit 派发出冒泡到 window 的 CustomEvent', ...)` → `it('useVueEmit 派发出冒泡到 window 的 CustomEvent', ...)`

`tests/runtime/react-adapter.test.tsx` 改 3 处：

第 5 行：
```ts
import { reactAdapter, useEmit } from '../../src/runtime/react'
```
→
```ts
import { reactAdapter, useReactEmit } from '../../src/runtime/react'
```

第 23 行 `const emit = useEmit()` → `const emit = useReactEmit()`

第 95 行测试名里的 `useEmit` → `useReactEmit`

- [ ] **Step 2: 跑测试，确认失败**

Run: `pnpm exec vitest run tests/runtime`
Expected: FAIL —— `useVueEmit` / `useReactEmit` 不是 `src/runtime/vue.ts` / `react.ts` 的导出。

- [ ] **Step 3: `EmitFn` 收进 `types.ts`**

`src/runtime/types.ts` 顶部加一行（放在 `PropType` 之前，它是本文件最基础的类型）：

```ts
export type EmitFn = (name: string, detail?: unknown) => void
```

并把 `ElementAdapter.mount` 的 `emit` 形参从内联展开换成它 —— 这是同一形状的第三遍书写：

```ts
export interface ElementAdapter {
  mount(
    host: HTMLElement | ShadowRoot,
    props: Record<string, unknown>,
    emit: EmitFn,
  ): unknown
  update(instance: unknown, props: Record<string, unknown>): void
  unmount(instance: unknown): void
}
```

- [ ] **Step 4: `vue.ts` 换名字**

`src/runtime/vue.ts`：

第 14 行删除 `export type EmitFn = (name: string, detail?: unknown) => void`，改为从 types 引入。文件顶部的 import 改成：

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
import type { ElementAdapter, EmitFn } from './types'
```

第 58 行 `export function useEmit(): EmitFn {` → `export function useVueEmit(): EmitFn {`

第 61 行的告警文案同步：

```ts
    console.warn('[ew] useVueEmit() 在 EW_EMIT_KEY 未注入的上下文中被调用，事件不会被派发。')
```

- [ ] **Step 5: `react.ts` 换名字**

`src/runtime/react.ts`：

顶部：

```ts
import { createContext, createElement, useContext, type Context } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ElementAdapter, EmitFn } from './types'
```

第 5 行删除本地 `export type EmitFn = ...`。

第 40 行 `export function useEmit(): EmitFn {` → `export function useReactEmit(): EmitFn {`

- [ ] **Step 6: 两个 demo 组件**

`src/workspaces/demo/components/hello-vue/Component.vue`：

第 3 行 → `import { useVueEmit } from '../../../../runtime/vue'`；第 11 行 → `const emit = useVueEmit()`

`src/workspaces/demo/components/hello-react/Component.tsx`：

第 1 行 → `import { useReactEmit } from '../../../../runtime/react'`；第 10 行 → `const emit = useReactEmit()`

- [ ] **Step 7: 脚手架模板**

`scripts/new-component.ts` —— 三处 Vue 模板（`plainVueComponent` / `elementPlusComponent` / `antDesignVueComponent`）与两处 React 模板（`plainReactComponent` / `antdComponent`）。

Vue 侧两处 `replace_all`：

1. `import { useEmit } from '${RUNTIME}/vue'` → `import { useVueEmit } from '${RUNTIME}/vue'`（3 处）
2. 匹配带上下一行以保证只命中 Vue 模板（React 模板后面跟的是 `return (`）：
   ```
   const emit = useEmit()

   function handleClick(): void {
   ```
   →
   ```
   const emit = useVueEmit()

   function handleClick(): void {
   ```
   （3 处）

React 侧两处 `replace_all`：

3. `import { useEmit } from '${RUNTIME}/react'` → `import { useReactEmit } from '${RUNTIME}/react'`（2 处）
4. ```
     const emit = useEmit()

     return (
   ```
   →
   ```
     const emit = useReactEmit()

     return (
   ```
   （2 处）

改完 Run: `grep -c "useEmit" scripts/new-component.ts`
Expected: `0`

- [ ] **Step 8: 跑测试，确认转绿**

Run: `pnpm run typecheck && pnpm run test`
Expected: 全绿。

- [ ] **Step 9: 提交**

```bash
git add src/runtime/types.ts src/runtime/vue.ts src/runtime/react.ts \
  src/workspaces/demo/components scripts/new-component.ts tests/runtime
git commit -m "refactor(runtime): useEmit 拆为 useVueEmit/useReactEmit，EmitFn 收进 types"
```

---

## Task 3: `@ew/runtime` 包

**Files:**
- Create: `packages/runtime/package.json`
- Create: `packages/runtime/src/index.ts`
- Move: `src/runtime/*.ts` → `packages/runtime/src/`
- Modify: `package.json`（devDependencies）
- Modify: `tsconfig.json`（include）
- Modify: `scripts/new-component.ts`（`RUNTIME` 常量与模板）
- Modify: `tests/scripts/new-component.test.ts:57-60`
- Modify: `tests/runtime/*`（6 个文件）
- Modify: `src/workspaces/demo/components/hello-{vue,react}/`（6 个文件）

- [ ] **Step 1: 移动模块**

```bash
mkdir -p packages/runtime/src
git mv src/runtime/element.ts src/runtime/props.ts src/runtime/react.ts \
  src/runtime/registry.ts src/runtime/style.ts src/runtime/types.ts src/runtime/vue.ts \
  packages/runtime/src/
rmdir src/runtime
```

模块之间的相对 import（`'./types'`、`'./props'`、`'./style'`）**不需要改** —— 它们一起搬的。

- [ ] **Step 2: 跑测试，确认全红**

Run: `pnpm run test`
Expected: `tests/runtime/*` 全部 FAIL，报找不到 `../../src/runtime/...`。

**这正是本任务想要的信号**：红的范围就是迁移面清单。若有测试文件没红，说明它本来就没 import runtime，那也该在清单外 —— 对照下表核一遍有没有漏网。

- [ ] **Step 3: 建包清单**

创建 `packages/runtime/package.json`：

```json
{
  "name": "@ew/runtime",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
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
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vue": "^3.5.0"
  }
}
```

`sideEffects: false` 是**功能性**的：桶同时 re-export `vueAdapter` 与 `reactAdapter`，Rollup 必须能摇掉用不到的那一支。peer 标记 optional 是因为一个 Vue 组件不该被要求装 react；devDependencies 范围与根完全一致，pnpm 会解析到同一 store 条目，不会装出第二份 Vue。

- [ ] **Step 4: 建桶**

创建 `packages/runtime/src/index.ts`：

```ts
/**
 * 包对外的全部 API 面。手写具名 re-export 而不是 `export *`：这个文件就是公开契约，
 * 写出来比通配可控；将来在模块里新增导出也不会意外变成公开 API。
 *
 * 测试专用的 resetRegistry / resetStyleCache / applyStyles 一并导出 —— 它们是纯函数，
 * 不用时会被摇掉，为它们单开一个子路径不划算。
 */
export { createElementClass } from './element'
export { registerElement, resetRegistry } from './registry'
export { applyStyles, resetStyleCache } from './style'
export { attrNameFor, coerceAttr, isAttributeChannel } from './props'
export { defineComponentMeta } from './types'
export type {
  ComponentMeta,
  ElementAdapter,
  EmitFn,
  EwElementConstructor,
  PropDefinition,
  PropType,
} from './types'

export { vueAdapter, useVueEmit, EW_EMIT_KEY } from './vue'
export type { VueAdapterOptions } from './vue'

export { reactAdapter, useReactEmit, EwEmitContext } from './react'
```

- [ ] **Step 5: 根包声明依赖**

`package.json` 的 `devDependencies`，按字母序插在 `@ew/utils` 之后：

```json
    "@ew/runtime": "workspace:*",
```

- [ ] **Step 6: 装依赖**

Run: `pnpm install`
Expected: 成功；`packages/runtime/node_modules` 里出现 `vue`、`react`、`react-dom` 的符号链接。

- [ ] **Step 7: tsconfig 纳入 packages**

`tsconfig.json` 的 `include`：

```json
  "include": ["*.config.ts", "src", "docs", "tests", "scripts"]
```
→
```json
  "include": ["*.config.ts", "src", "docs", "tests", "scripts", "packages"]
```

`paths` 里的 `@src/*` **保留** —— `docs` 主题仍在用它 glob `@src/workspaces/**` 与引 `@src/tokens/tokens.css`。

- [ ] **Step 8: 迁移 6 个测试文件**

`tests/runtime/element.test.ts` 第 2–5 行 → 

```ts
import {
  createElementClass,
  resetRegistry,
  resetStyleCache,
  type ComponentMeta,
  type ElementAdapter,
} from '@ew/runtime'
```

`tests/runtime/props.test.ts` 第 2 行 →

```ts
import { attrNameFor, coerceAttr, isAttributeChannel } from '@ew/runtime'
```

`tests/runtime/react-adapter.test.tsx` 第 4–7 行 →

```ts
import {
  createElementClass,
  reactAdapter,
  resetRegistry,
  resetStyleCache,
  useReactEmit,
} from '@ew/runtime'
```

`tests/runtime/registry.test.ts` 第 2–3 行 →

```ts
import { registerElement, resetRegistry, type EwElementConstructor } from '@ew/runtime'
```

`tests/runtime/style.test.ts` 第 2 行 →

```ts
import { applyStyles, resetStyleCache } from '@ew/runtime'
```

`tests/runtime/vue-adapter.test.ts` 第 3–6 行 →

```ts
import {
  createElementClass,
  resetRegistry,
  resetStyleCache,
  useVueEmit,
  vueAdapter,
} from '@ew/runtime'
```

- [ ] **Step 9: 跑测试**

Run: `pnpm run test`
Expected: 全绿。若报 `Failed to resolve import "@ew/runtime"`，说明 Step 6 的链接没建上，回去查 `pnpm install` 的输出。

- [ ] **Step 10: 迁移两个 demo 组件**

`src/workspaces/demo/components/hello-vue/index.ts` 第 1–3 行 →

```ts
import { createElementClass, registerElement, vueAdapter } from '@ew/runtime'
```

`src/workspaces/demo/components/hello-react/index.ts` 第 1–3 行 →

```ts
import { createElementClass, reactAdapter, registerElement } from '@ew/runtime'
```

`src/workspaces/demo/components/hello-vue/meta.ts:1` 与 `hello-react/meta.ts:1` →

```ts
import { defineComponentMeta } from '@ew/runtime'
```

`hello-vue/Component.vue:3` →

```ts
import { useVueEmit } from '@ew/runtime'
```

`hello-react/Component.tsx:1` →

```ts
import { useReactEmit } from '@ew/runtime'
```

- [ ] **Step 11: 脚手架改用包名**

`scripts/new-component.ts` 第 213–214 行 —— 常量与它的注释一起换掉（注释说的「四个 .. 回到 src/」已经作废）：

```ts
/** 组件目录在 src/workspaces/<ws>/components/<name>/，四个 .. 回到 src/ */
const RUNTIME = '../../../../runtime'
```
→
```ts
/** 运行时是具名 workspace 包，与组件目录深度解耦 */
const RUNTIME_PKG = '@ew/runtime'
```

`metaTemplate` 里：

```ts
import { defineComponentMeta } from '${RUNTIME}/types'
```
→
```ts
import { defineComponentMeta } from '${RUNTIME_PKG}'
```

`indexTemplate` 里三条 import 合成一条（桶是唯一入口，不能写成 `@ew/runtime/element`）：

```ts
  return `import { createElementClass } from '${RUNTIME}/element'
import { registerElement } from '${RUNTIME}/registry'
import { ${adapter} } from '${RUNTIME}/${isVue ? 'vue' : 'react'}'
${piniaImport}import Component from './Component${isVue ? '.vue' : ''}'
```
→
```ts
  return `import { createElementClass, registerElement, ${adapter} } from '${RUNTIME_PKG}'
${piniaImport}import Component from './Component${isVue ? '.vue' : ''}'
```

五个组件模板里的 `${RUNTIME}/vue` 与 `${RUNTIME}/react` 全部 → `${RUNTIME_PKG}`（Task 2 已经改过名字，这里只动路径）。

改完 Run: `grep -n "RUNTIME}" scripts/new-component.ts`
Expected: 无输出（`RUNTIME_PKG}` 里不含 `RUNTIME}`，所以这条能区分开）

- [ ] **Step 12: 更新脚手架测试期望**

`tests/scripts/new-component.test.ts` 第 57–60 行 —— 断言从「四个 `..`」改为「具名包 + 正确的适配器名」，测试名同步：

```ts
  it('运行时用具名包引入，不用相对路径', () => {
    createComponent(root, spec())
    expect(read('my-card', 'index.ts')).toContain(
      "import { createElementClass, registerElement, vueAdapter } from '@ew/runtime'",
    )
    expect(read('my-card', 'Component.vue')).toContain(
      "import { useVueEmit } from '@ew/runtime'",
    )
  })
```

- [ ] **Step 13: 全量验证**

Run: `pnpm run typecheck && pnpm run test && pnpm run build`
Expected: 全绿。

Run: `ls -l dist/cdn/`
Expected: 三个文件，体积与基线表**同量级**（±5%）。明显变大说明桶没被摇干净或 Vue 装了两份 —— 去 Task 5 把守卫装上再查。

- [ ] **Step 14: 提交**

```bash
git add packages/runtime src/workspaces/demo/components scripts/new-component.ts \
  tests/runtime tests/scripts/new-component.test.ts package.json pnpm-lock.yaml tsconfig.json
git commit -m "refactor(packages): 建 @ew/runtime 包与桶，组件改用包名引入"
```

---

## Task 4: 文档站与指南

**Files:**
- Modify: `docs/.vitepress/theme/components/VueMount.vue:3`
- Modify: `docs/.vitepress/theme/components/ReactMount.vue:5`
- Modify: `docs/guide/authoring.md:39,60-62`

- [ ] **Step 1: 文档主题**

`docs/.vitepress/theme/components/VueMount.vue:3`：

```ts
import { EW_EMIT_KEY } from '@src/runtime/vue'
```
→
```ts
import { EW_EMIT_KEY } from '@ew/runtime'
```

`docs/.vitepress/theme/components/ReactMount.vue:5`：

```ts
import { EwEmitContext } from '@src/runtime/react'
```
→
```ts
import { EwEmitContext } from '@ew/runtime'
```

- [ ] **Step 2: 指南的 meta.ts 示例**

`docs/guide/authoring.md:39`：

```ts
import { defineComponentMeta } from '../../../../runtime/types'
```
→
```ts
import { defineComponentMeta } from '@ew/runtime'
```

- [ ] **Step 3: 指南的事件示例**

`docs/guide/authoring.md` 第 60–62 行：

```ts
import { useEmit } from '../../../../runtime/vue'   // React 组件改为 '../../../../runtime/react'

const emit = useEmit()
```
→
```ts
import { useVueEmit } from '@ew/runtime'   // React 组件改为 useReactEmit

const emit = useVueEmit()
```

- [ ] **Step 4: 核对与模板逐字一致**

Run: `pnpm exec vitest run tests/scripts/new-component.test.ts`
Expected: PASS。这条保证 `authoring.md` 的示例与脚手架生成物是同一份写法 —— 上面两条改动的措辞就是照着模板的最终形态抄的。

- [ ] **Step 5: 构建文档站**

Run: `pnpm run docs:build`
Expected: 成功，无 `Failed to resolve` 警告。

- [ ] **Step 6: 提交**

```bash
git add docs/.vitepress/theme docs/guide/authoring.md
git commit -m "docs: 文档站与指南改用 @ew/runtime"
```

---

## Task 5: 产物隔离守卫

**Files:**
- Create: `scripts/check-artifacts.ts`
- Modify: `package.json`（scripts）

- [ ] **Step 1: 写守卫**

创建 `scripts/check-artifacts.ts`：

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cdnDir = join(root, 'dist/cdn')

/**
 * 桶文件把「Vue 产物里不含 React」从一个结构性事实降级成一条依赖 tree-shaking 的性质。
 * 摇不干净的症状是静默的：产物从 68KB 涨到 290KB，没有任何测试会红。这里把它钉住。
 *
 * 「自家标记恰好 1 次」同时还覆盖了「同一个框架被装了两份」—— 两份就会数到 2。
 */
const MARKER = { vue: '__v_isRef', react: 'react-dom' } as const

type Framework = keyof typeof MARKER

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/** 框架取自组件源码目录，而不是文件名约定 —— 与构建脚本同一处事实来源 */
function frameworkOf(name: string): Framework | null {
  const workspacesDir = join(root, 'src/workspaces')
  for (const ws of readdirSync(workspacesDir)) {
    const dir = join(workspacesDir, ws, 'components', name)
    if (!existsSync(dir)) continue
    if (existsSync(join(dir, 'Component.vue'))) return 'vue'
    if (existsSync(join(dir, 'Component.tsx'))) return 'react'
  }
  return null
}

function main(): void {
  const failures: string[] = []

  for (const file of readdirSync(cdnDir).filter((f) => f.endsWith('.js'))) {
    const name = file.slice(0, -3)
    const code = readFileSync(join(cdnDir, file), 'utf8')

    // ew-all 是聚合产物，本来就该两个框架都在
    if (name === 'ew-all') {
      for (const [fw, marker] of Object.entries(MARKER)) {
        if (count(code, marker) < 1) {
          failures.push(`ew-all.js 里找不到 ${fw} 的标记 ${marker}，两个框架应当都在`)
        }
      }
      continue
    }

    const mine = frameworkOf(name)
    if (!mine) {
      failures.push(`找不到组件 "${name}" 的源码目录，无法判断框架`)
      continue
    }

    for (const [fw, marker] of Object.entries(MARKER) as Array<[Framework, string]>) {
      const hits = count(code, marker)
      if (fw === mine && hits !== 1) {
        failures.push(`${file} 里 ${fw} 标记 ${marker} 出现 ${hits} 次，应为 1 次（0 = 自己的框架没打进去，>1 = 装了两份）`)
      }
      if (fw !== mine && hits !== 0) {
        failures.push(`${file} 是 ${mine} 组件，却含 ${fw} 标记 ${marker} ${hits} 次 —— 桶没被摇干净`)
      }
    }
  }

  if (failures.length > 0) {
    console.error('[check:artifacts] 产物隔离被破坏：')
    for (const line of failures) console.error(`  - ${line}`)
    process.exit(1)
  }

  console.log('[check:artifacts] 产物隔离正常')
}

main()
```

只查 `dist/cdn/`：`dist/esm/` 是共享 chunk 结构，单组件入口只有 157 字节的 re-export 桩，在那儿查隔离没有意义。

- [ ] **Step 2: 挂进脚本**

`package.json` 的 `scripts`，插在三个 build 之后：

```json
    "check:artifacts": "tsx scripts/check-artifacts.ts",
```

并把 `verify` 改成：

```json
    "verify": "pnpm run typecheck && pnpm run test && pnpm run build && pnpm run check:artifacts && pnpm run docs:build && pnpm run test:e2e"
```

- [ ] **Step 3: 跑一次，确认通过**

Run: `pnpm run check:artifacts`
Expected: `[check:artifacts] 产物隔离正常`

- [ ] **Step 4: 证明它真的会红**

一个永远绿的守卫等于没有守卫。临时把 `scripts/check-artifacts.ts` 里 `MARKER` 的 vue 项改成 `react-dom`：

```ts
const MARKER = { vue: 'react-dom', react: 'react-dom' } as const
```

Run: `pnpm run check:artifacts`
Expected: 退出码 1，且报告里点名 `hello-vue.js`。

改回 `{ vue: '__v_isRef', react: 'react-dom' }`，再跑一次确认恢复绿色。

- [ ] **Step 5: 提交**

```bash
git add scripts/check-artifacts.ts package.json
git commit -m "test(build): 产物隔离守卫，钉住桶文件的 tree-shaking"
```

---

## Task 6: 全量验收与清扫

**Files:** 无（只读检查，发现问题再改）

- [ ] **Step 1: 全链路**

Run: `pnpm run verify`
Expected: 全绿，且输出里能看到 `[check:artifacts] 产物隔离正常`。

- [ ] **Step 2: 残留检查**

Run: `grep -rn "\.\./\.\./\.\./\.\./runtime\|src/runtime" src scripts docs/.vitepress tests`
Expected: **无输出**。

`docs/superpowers/**` 下的历史 spec/plan 里还有大量 `../../../../runtime` 与 `useEmit` 字样 —— 那些是**历史记录，不修改**。

`src/workspaces/self-monitor/` 是使用者的在制品，**全程不动**；若它自身引用了 `src/runtime`，报告出来但不代改。

- [ ] **Step 3: 目录核对**

Run: `ls src/ && ls packages/`
Expected: `src/` 下是 `env.d.ts  .generated  tokens  workspaces`，没有 `runtime`；`packages/` 下是 `runtime  utils`。

- [ ] **Step 4: 产物体积比对**

Run: `pnpm run build` 后 `ls -l dist/cdn/`

对照基线表：`hello-vue.js` 68,580 B、`hello-react.js` 225,817 B、`ew-all.js` 292,760 B。

Expected: 三个都在 ±5% 以内。包化不改变产物内容，明显偏离说明有东西被多打进去了。

- [ ] **Step 5: 交付契约未变**

`exports` 每次 build 都会被重写，所以这条检查是「重写后与提交里的一致」：

Run: `pnpm run build && git diff --exit-code package.json`
Expected: 退出码 0、无输出。说明 tag / `exports` 键 / CDN 文件名契约一个字节没变。

（这条也顺带证明了 `pnpm run build` 的可重复性：连跑两次产物元数据完全一致。）

- [ ] **Step 6: 报告**

向使用者汇报：
1. 两个包的落点与最终 import 形态
2. `useEmit` 已拆名（这是唯一的 API 改名，理由与替代方案见 spec 第 6 节）
3. `check:artifacts` 已进 `verify`，以及它防的是哪种静默退化
4. 三个产物体积与基线对照
5. `pnpm run new:component` 是交互式的，非 TTY 环境跑不了 —— 请使用者手动跑一次确认提示手感（选完会 `pnpm add` 真实依赖，那是使用者的环境，不该由我代跑）

---

## 收尾

全部任务完成后使用 `superpowers:finishing-a-development-branch`。

**本仓库的既有约定**：不 push、不加远程、不合并 —— 使用者自行处理线上（外层是 SVN 工作副本，新项目用本地 git）。只报告分支状态。
