# ctc-web-components 文档站（VitePress）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把一期手写的 `playground/` 换成 VitePress 文档站 —— 每个组件一个 markdown 页，手写散文 + 内嵌实时交互面板，导航与侧边栏由 `src/components/` 目录结构自动派生。

**Architecture:** `docs/` 直接作为 VitePress 站点根，内部设计文档由 `srcExclude` 隔在站点之外。站点侧的组件枚举收敛到 `docs/.vitepress/components.ts`（Node 侧扫描，供 sidebar 用）；浏览器侧可渲染的组件模块仍由 `import.meta.glob` 取——两者职责不同，各自只做自己能做的事。一期的运行时与组件源码（`src/`）一行不改，文档站只是它的消费者。

**Tech Stack:** VitePress 1.6.4（内部绑 Vite 5）、Vue 3.5、React 19（经 `@vitejs/plugin-react@4.7`）、TypeScript 严格模式、pnpm。

**Spec:** `docs/superpowers/specs/2026-09-22-ctc-docs-site-design.md`

**Scope:** 只做文档站。工作空间概念不在本计划内（spec 第 13 节只预留接缝）。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `docs/.vitepress/config.mts` | 站点配置：nav / sidebar / srcExclude / `@src` 别名 / `vue.isCustomElement` / wc-mode 插件 |
| `docs/.vitepress/components.ts` | Node 侧扫描 `src/components/`，导出 `listComponents()`——站点侧唯一数据源 |
| `docs/.vitepress/plugins/wc-mode.ts` | 从 playground 原样搬来，逻辑不变 |
| `docs/.vitepress/theme/index.ts` | 扩展默认主题 + 引入 tokens.css/custom.css + 全局注册两个面板组件 |
| `docs/.vitepress/theme/custom.css` | 把 `--ctc-*` 映射到 VitePress 的 `--vp-c-*` |
| `docs/.vitepress/theme/components/ComponentDemo.vue` | 交互面板：属性表单 + 双模式预览 + 事件日志 |
| `docs/.vitepress/theme/components/ComponentOverview.vue` | 兜底总览页正文：枚举所有组件各渲染一块面板 |
| `docs/.vitepress/theme/components/VueMount.vue` | 从 playground 搬来，改 `@src` 别名 |
| `docs/.vitepress/theme/components/ReactMount.vue` | 同上 |
| `docs/.vitepress/theme/components/source-style.ts` | 同上，glob 基路径改 `@src` |
| `docs/.vitepress/env.d.ts` | `vitepress/client` 类型引用（模板里用全局组件 `<ClientOnly>` 需要） |
| `docs/index.md` | 首页（hero + features） |
| `docs/guide/{index,authoring,theming,build}.md` | 四页手写指南 |
| `docs/components/{index,hello-vue,hello-react}.md` | 组件总览 + 两个手写组件页 |
| `tests/docs/components.test.ts` | `listComponents()` 单测 |

**删除**：`playground/`、`vite.playground.config.ts`。

---

## Task 1: 装 VitePress，站点骨架跑通

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `tsconfig.json`
- Create: `docs/index.md`
- Create: `docs/.vitepress/config.mts`

本任务刻意**不写 nav / sidebar / hero actions** —— 它们的指向目标还不存在，写了就是浏览器里的 404。这些条目在页面落地时逐条补：Task 7 加「组件」，Task 8 加「指南」与首页 hero 按钮。

> **实测修正（2026-09-22）**：VitePress 的 dead-link 检查**不覆盖 `themeConfig`（nav / sidebar / hero actions）**，只覆盖 markdown 正文里的链接。所以配上去不会让 `docs:build` 失败，只会在浏览器里静默 404 —— 这比构建报错更难发现。导航条目一律等页面先落地。

- [ ] **Step 1: 安装 VitePress 1.6.4**

```bash
pnpm add -D vitepress@1.6.4
```

预期：`package.json` 的 `devDependencies` 多出 `"vitepress": "^1.6.4"`，`pnpm-lock.yaml` 更新。

注意它会把 `vite@5.4.x` 装进 **vitepress 自己的**依赖树（pnpm 隔离），仓库根的 Vite 7 不受影响。以后构建日志里同时出现两个 Vite 版本号属预期。

- [ ] **Step 2: `.gitignore` 补 VitePress 缓存目录**

在文件末尾追加：

```
docs/.vitepress/cache/
playwright-report/
```

> `playwright-report/` 一期已有一行，若已存在就只加前两行中的 `docs/.vitepress/cache/`。`docs/.vitepress/dist/` 已被现有的 `dist/` 规则覆盖（无前导斜杠的 `dist/` 匹配任意层级）。

- [ ] **Step 3: 写首页 `docs/index.md`**

```md
---
layout: home

hero:
  name: CTC Web Components
  text: 写一个组件，交付一个 Web Component
  tagline: 用 Vue 3 或 React 编写业务组件，构建管线输出统一形态的自定义元素 —— npm 与 CDN 双通道，加组件零配置。

features:
  - title: Vue 或 React 任选
    details: 组件放 Component.vue 或 Component.tsx，构建脚本按文件名自动判别框架，最终产出一致的 <ctc-*> 元素。
  - title: 自包含 Web Component
    details: 运行时内联进单文件产物，一个 <script> 标签即可使用；不依赖宿主框架，不怕样式冲突。
  - title: npm 与 CDN 双通道
    details: ESM 多入口产物给打包器用，IIFE 单文件给 CDN 用，两种形态出自同一份源码。
  - title: meta.ts 驱动零配置
    details: tag、props、events 写在 meta.ts 里；构建入口、package exports、文档站导航全部自动生成。
---
```

- [ ] **Step 4: 写 `docs/.vitepress/config.mts`**

```ts
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'

export const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

export default defineConfig({
  title: 'CTC Web Components',
  description: '用 Vue 3 或 React 写业务组件，构建管线输出统一形态的 Web Component',
  srcExclude: ['superpowers/**'],
  vue: {
    template: {
      compilerOptions: {
        isCustomElement: (tag: string) => tag.startsWith('ctc-'),
      },
    },
  },
  vite: {
    resolve: {
      alias: { '@src': resolve(rootDir, 'src') },
    },
  },
  themeConfig: {
    nav: [],
  },
})
```

三处不能想当然：

- **用 VitePress 自带的 `vue` 配置项，不要往 `vite.plugins` 里塞 `vue()`。** VitePress 内部已经挂了一个 `@vitejs/plugin-vue`，再加一个实例会让 `.vue` 文件被转换两次。
- **`srcExclude: ['superpowers/**']`** 是唯一挡住内部设计文档的东西，漏了它们会被当页面发布。
- **`rootDir` 从 `import.meta.url` 推**（`docs/.vitepress/` 上翻两级），不要用 `process.cwd()`。

`isCustomElement` 目前没有直接消费者（`<ctc-*>` 只出现在 WC 模式的动态 `:is` 里，不走组件解析），但它是 spec 第 11 节点名必须带过来的配置，留着做保险。

- [ ] **Step 5: `tsconfig.json` 加 `docs` 与 `@src` 路径映射**

把 `include` 改成：

```json
"include": ["*.config.ts", "src", "docs", "playground", "tests", "scripts"]
```

在 `compilerOptions` 里 `"types"` 之前加：

```json
"paths": { "@src/*": ["./src/*"] },
```

`paths` 是给 `vue-tsc` 用的 —— Vite 靠 `config.mts` 的 alias 解析 `@src`，TypeScript 不认，没有 `paths` 就会报「找不到模块 `@src/runtime/vue`」。

- [ ] **Step 6: `package.json` 加 docs 脚本并扩编 `verify`**

`scripts` 改成：

```json
"scripts": {
  "dev": "vite --config vite.playground.config.ts",
  "docs:dev": "vitepress dev docs",
  "docs:build": "vitepress build docs",
  "docs:preview": "vitepress preview docs",
  "build": "tsx scripts/build.ts",
  "build:esm": "tsx scripts/build.ts --only=esm",
  "build:cdn": "tsx scripts/build.ts --only=cdn",
  "typecheck": "vue-tsc --noEmit -p tsconfig.json",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "verify": "pnpm run typecheck && pnpm run test && pnpm run build && pnpm run docs:build && pnpm run test:e2e"
}
```

`dev` 暂时仍指向 playground，Task 9 换成 `vitepress dev docs`。`docs:build` 排在 `build` 之后、`test:e2e` 之前 —— 它慢，但它是 SSR 问题的唯一防线。

- [ ] **Step 7: 构建**

```bash
pnpm run docs:build
```

预期：以 `build complete` 收尾，产出 `docs/.vitepress/dist/index.html`。

- [ ] **Step 8: 验证内部文档没有泄漏进产物**

```bash
find docs/.vitepress/dist -path '*superpowers*'
```

预期：**无任何输出**。有输出说明 `srcExclude` 失效。

- [ ] **Step 9: 类型检查**

```bash
pnpm run typecheck
```

预期：无输出（通过）。此时 `docs` 已在 `include` 里，`config.mts` 也在检查范围内。

- [ ] **Step 10: 提交**

```bash
git add package.json pnpm-lock.yaml .gitignore tsconfig.json docs/index.md docs/.vitepress
git commit -m "docs: 搭起 VitePress 站点骨架"
```

---

## Task 2: `components.ts` —— 站点侧唯一数据源

**Files:**
- Create: `docs/.vitepress/components.ts`
- Create: `tests/docs/components.test.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: 先写会失败的测试**

创建 `tests/docs/components.test.ts`：

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listComponents } from '../../docs/.vitepress/components'

let root: string

function makeComponent(name: string, files: string[]): void {
  mkdirSync(join(root, 'components', name), { recursive: true })
  for (const file of files) writeFileSync(join(root, 'components', name, file), '')
}

const scan = () => listComponents(join(root, 'components'), join(root, 'docs/components'))

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'ctc-docs-'))
  mkdirSync(join(root, 'docs/components'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('listComponents', () => {
  it('识别框架并按目录名排序', () => {
    makeComponent('b-react', ['Component.tsx'])
    makeComponent('a-vue', ['Component.vue'])
    expect(scan()).toEqual([
      { name: 'a-vue', framework: 'vue', documented: false },
      { name: 'b-react', framework: 'react', documented: false },
    ])
  })

  it('docs/components/<name>.md 存在时 documented 为 true', () => {
    makeComponent('a-vue', ['Component.vue'])
    writeFileSync(join(root, 'docs/components/a-vue.md'), '')
    expect(scan()[0]?.documented).toBe(true)
  })

  it('Component.vue 与 Component.tsx 同时存在时抛错', () => {
    makeComponent('both', ['Component.vue', 'Component.tsx'])
    expect(scan).toThrow(/必须且只能有一个/)
  })

  it('两者都不存在时抛错', () => {
    makeComponent('neither', [])
    expect(scan).toThrow(/必须且只能有一个/)
  })

  it('忽略非目录条目', () => {
    writeFileSync(join(root, 'components/README.md'), '')
    makeComponent('a-vue', ['Component.vue'])
    expect(scan().map((c) => c.name)).toEqual(['a-vue'])
  })
})
```

- [ ] **Step 2: 让 vitest 认识新目录**

`vitest.config.ts` 的 `include` 改成：

```ts
include: ['tests/**/*.test.{ts,tsx}'],
```

e2e 用例是 `tests/e2e/*.spec.ts`（`.spec` 而非 `.test`），不会被误收。

- [ ] **Step 3: 跑测试，确认失败**

```bash
pnpm exec vitest run tests/docs/components.test.ts
```

预期：FAIL —— `Failed to resolve import "../../docs/.vitepress/components"`。

- [ ] **Step 4: 写 `docs/.vitepress/components.ts`**

```ts
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export interface ComponentInfo {
  name: string
  framework: 'vue' | 'react'
  documented: boolean
}

export function listComponents(
  componentsDir = join(rootDir, 'src/components'),
  docsDir = join(rootDir, 'docs/components'),
): ComponentInfo[] {
  return readdirSync(componentsDir)
    .filter((name) => statSync(join(componentsDir, name)).isDirectory())
    .map((name): ComponentInfo => {
      const dir = join(componentsDir, name)
      const hasVue = existsSync(join(dir, 'Component.vue'))
      const hasReact = existsSync(join(dir, 'Component.tsx'))
      if (hasVue === hasReact) {
        throw new Error(
          `[docs] ${name} 必须且只能有一个 Component.vue 或 Component.tsx（当前 vue=${hasVue} react=${hasReact}）`,
        )
      }
      return {
        name,
        framework: hasVue ? 'vue' : 'react',
        documented: existsSync(join(docsDir, `${name}.md`)),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
```

两个目录参数都可覆盖，是为了让单测能指向临时目录。判定规则与 `scripts/build.ts` 一致，但**两边各扫各的** —— 构建脚本不 import 这个文件，文档站删掉时构建必须照常工作。

- [ ] **Step 5: 跑测试，确认通过**

```bash
pnpm run test
```

预期：6 个文件 46 个用例全通过（一期 41 + 本任务 5）。

- [ ] **Step 6: 提交**

```bash
git add docs/.vitepress/components.ts tests/docs/components.test.ts vitest.config.ts
git commit -m "docs: 文档站组件扫描模块与单测"
```

---

## Task 3: 迁移 wc-mode 插件

**Files:**
- Create (move): `docs/.vitepress/plugins/wc-mode.ts`
- Modify: `docs/.vitepress/config.mts`

- [ ] **Step 1: 移动文件**

```bash
mkdir -p docs/.vitepress/plugins && git mv playground/plugins/wc-mode.ts docs/.vitepress/plugins/wc-mode.ts
```

**文件内容一字不改。** 它内部生成的是绝对路径 import（一期已如此），虚拟模块 id 仍是 `virtual:ctc-wc/<name>` 与 `virtual:ctc-wc-index`。工作空间落地时 id 才会变成 `virtual:ctc-wc/<ws>/<name>`。

- [ ] **Step 2: 挂进 config.mts**

在 `docs/.vitepress/config.mts` 顶部加：

```ts
import { wcModePlugin } from './plugins/wc-mode'
```

并把 `vite` 段改成：

```ts
  vite: {
    resolve: {
      alias: { '@src': resolve(rootDir, 'src') },
    },
    plugins: [wcModePlugin(resolve(rootDir, 'src/components'))],
  },
```

这里**不加** `react()` —— 本任务里还没有任何模块 import `.tsx`，等 Task 4 迁移 renderer 时再加，能干净地定位问题。

插件搬走后 `vite.playground.config.ts` 的导入路径失效，把它的 `'./playground/plugins/wc-mode'` 临时改成 `'./docs/.vitepress/plugins/wc-mode'` —— playground 要到 Task 9 才删，这期间它得继续能 typecheck。这个临时耦合随 Task 9 一起消失。

- [ ] **Step 2b: 修 playground 配置的导入路径**

`vite.playground.config.ts`：

```ts
import { wcModePlugin } from './docs/.vitepress/plugins/wc-mode'
```

- [ ] **Step 3: 验证构建与类型**

```bash
pnpm run typecheck && pnpm run docs:build
```

预期：两者都通过。插件此时还没有消费者（`resolveId` / `load` 不会被调用），构建产物与 Task 1 一致。

- [ ] **Step 4: 提交**

```bash
git add docs/.vitepress/plugins docs/.vitepress/config.mts
git commit -m "docs: wc-mode 插件迁入文档站"
```

---

## Task 4: 迁移 renderer、主题骨架，验证 React 在 VitePress 内可跑

这一步同时干掉 spec 第 14 节的风险 1：`@vitejs/plugin-react@4.7.0` 能不能在 VitePress 内部的 Vite 5 里工作。

**Files:**
- Create (move): `docs/.vitepress/theme/components/{VueMount.vue,ReactMount.vue,source-style.ts}`
- Create: `docs/.vitepress/theme/index.ts`
- Create: `docs/.vitepress/theme/custom.css`
- Create: `docs/.vitepress/env.d.ts`
- Create: `docs/probe.md`（临时，本任务内删除）
- Modify: `docs/.vitepress/config.mts`

- [ ] **Step 1: 移动三个 renderer**

```bash
mkdir -p docs/.vitepress/theme/components && git mv playground/renderers/VueMount.vue playground/renderers/ReactMount.vue playground/renderers/source-style.ts docs/.vitepress/theme/components/
```

- [ ] **Step 2: `VueMount.vue` 改运行时导入路径**

把 `import { CTC_EMIT_KEY } from '../../src/runtime/vue'` 改成：

```ts
import { CTC_EMIT_KEY } from '@src/runtime/vue'
```

- [ ] **Step 3: `ReactMount.vue` 改运行时导入路径**

把 `import { CtcEmitContext } from '../../src/runtime/react'` 改成：

```ts
import { CtcEmitContext } from '@src/runtime/react'
```

- [ ] **Step 4: `source-style.ts` 改成按目录名查表**

整个文件替换为：

```ts
const styleModules = import.meta.glob('@src/components/*/style.css', {
  eager: true,
  query: '?inline',
  import: 'default',
}) as Record<string, string>

/**
 * 源码模式下组件也不带样式 —— 组件把 CSS 交给 index.ts 以 ?inline 传给桥接层，
 * 直接渲染组件源码不会加载它。这里补上，否则两种模式外观差得太多，对照就失去意义。
 */
export function componentStyle(name: string): string {
  const hit = Object.entries(styleModules).find(
    ([path]) => path.split('/').at(-2) === name,
  )
  return hit?.[1] ?? ''
}
```

**不要用 `` styleModules[`@src/components/${name}/style.css`] `` 这种直接索引。** `import.meta.glob` 生成的 key 形状（是否带别名前缀）是实现细节，按目录名扫一遍是唯一稳的写法。

- [ ] **Step 5: 写 `docs/.vitepress/theme/index.ts`**

```ts
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import '@src/tokens/tokens.css'
import './custom.css'

export default {
  extends: DefaultTheme,
} satisfies Theme
```

`tokens.css` 必须在这里引入 —— 站点自己的 UI 也用 `var(--ctc-*)`，不引入的话侧边栏、正文的颜色全空。

- [ ] **Step 6: 写 `docs/.vitepress/theme/custom.css`**

```css
:root {
  --vp-c-brand-1: var(--ctc-color-primary);
  --vp-c-brand-2: var(--ctc-color-primary);
  --vp-c-brand-3: var(--ctc-color-primary);
  --vp-font-family-base: var(--ctc-font-family);
}
```

方向是 `--ctc-*` → `--vp-c-*`，不是反过来：token 是一等公民（消费方也要用），VitePress 的变量是文档站私有的皮肤。

- [ ] **Step 7: 写 `docs/.vitepress/env.d.ts`**

```ts
/// <reference types="vitepress/client" />
```

这行让 `vue-tsc` 知道 VitePress 注册的全局组件（`ClientOnly`、`Content`、`VP*`）在模板里可用 —— Task 5 的 `ComponentDemo.vue` 模板根部要用 `<ClientOnly>`。

若 `pnpm run typecheck` 仍报「`ClientOnly` 不存在」（说明 `vitepress/client` 没有带全局组件声明），把该文件整体换成显式声明：

```ts
declare module 'vue' {
  export interface GlobalComponents {
    ClientOnly: any
  }
}
```

- [ ] **Step 8: config.mts 挂上 React 插件**

```ts
import react from '@vitejs/plugin-react'
```

并把 `vite` 段改成：

```ts
  vite: {
    resolve: {
      alias: { '@src': resolve(rootDir, 'src') },
    },
    plugins: [wcModePlugin(resolve(rootDir, 'src/components')), react()],
  },
```

- [ ] **Step 9: 写临时探针页 `docs/probe.md`**

```md
<script setup lang="ts">
import ReactMount from './.vitepress/theme/components/ReactMount.vue'
import HelloReact from '@src/components/hello-react/Component.tsx'

const propsData = { name: 'Probe', count: 2, autoLoad: false }
</script>

# probe

<ClientOnly>
  <ReactMount name="hello-react" :component="HelloReact" :props-data="propsData" :on-event="() => {}" />
</ClientOnly>
```

- [ ] **Step 10: 构建，确认 JSX 转换在 VitePress 内跑得通**

```bash
pnpm run docs:build
```

预期：以 `build complete` 收尾。

若失败且错误出在 `@vitejs/plugin-react` 或 JSX 转换上 —— 这就是 spec 第 14 节的风险 1 兑现了。退路按优先级：① 把 `@vitejs/plugin-react` 升到 5.x（`pnpm add -D @vitejs/plugin-react@^5`）后重跑；② 若仍不行，给 VitePress 单独指定插件版本并在此记录。**不要**退回 `playground/`。

- [ ] **Step 11: 起 dev 站，人工确认 React 真的渲染出来**

```bash
pnpm run docs:dev
```

浏览器打开 `http://localhost:5173/probe`。预期：看到一枚 React 按钮，文案 `React 组件：Probe × 2`。这是风险 1 的最终裁判 —— 构建通过只说明能打包，渲染出来才说明 React 运行时被正确加载。

- [ ] **Step 12: 删掉探针页并提交**

```bash
rm docs/probe.md
git add -A docs/.vitepress docs/probe.md
git commit -m "docs: renderer 与主题迁入文档站，验证 React 插件可用"
```

---

## Task 5: 交互面板 `ComponentDemo.vue`

**Files:**
- Create: `docs/.vitepress/theme/components/ComponentDemo.vue`
- Modify: `docs/.vitepress/theme/index.ts`

- [ ] **Step 1: 写 `ComponentDemo.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import ReactMount from './ReactMount.vue'
import VueMount from './VueMount.vue'

interface MetaShape {
  tag: string
  props?: Record<string, { type: string; default?: unknown }>
}

const props = defineProps<{ name: string }>()

const metaModules = import.meta.glob('@src/components/*/meta.ts', { eager: true }) as Record<
  string,
  { default: MetaShape }
>
const sourceModules = import.meta.glob('@src/components/*/Component.{vue,tsx}', {
  eager: true,
}) as Record<string, { default: unknown }>

// glob 生成的 key 形状（绝对路径 / 别名前缀 / 相对路径）是实现细节，只取倒数第二段目录名
function dirName(path: string): string {
  return path.split('/').at(-2) ?? ''
}

const meta = computed<MetaShape | undefined>(
  () => Object.entries(metaModules).find(([path]) => dirName(path) === props.name)?.[1].default,
)

const framework = computed<'vue' | 'react'>(() =>
  Object.keys(sourceModules).some(
    (path) => dirName(path) === props.name && path.endsWith('.vue'),
  )
    ? 'vue'
    : 'react',
)

const sourceComponent = computed<unknown>(
  () =>
    Object.entries(sourceModules).find(
      ([path]) =>
        dirName(path) === props.name &&
        path.endsWith(framework.value === 'vue' ? '.vue' : '.tsx'),
    )?.[1].default,
)

const tag = computed(() => meta.value?.tag ?? '')

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

// Vue 给自定义元素打 v-bind 时，只要该 key 在元素上是已定义的属性，就走 property 通道而不是
// attribute 通道 —— 而桥接层给每个声明过的 prop 都装了 accessor。所以这里必须传**已定型**的值：
// 传字符串会原样落进组件（`count` 变成 `'7'`，Vue 报 prop 类型警告），传 `''` 表示布尔为真更是
// 直接失效（Vue 的 Boolean prop 转换把 `''` 一律当 false）。
const wcProps = computed<Record<string, unknown>>(() => {
  const result: Record<string, unknown> = {}
  for (const [name, def] of propDefs.value) {
    if (def.type === 'boolean') result[name] = booleanValues[name]
    else if (def.type === 'number') result[name] = Number(values[name] || 0)
    else result[name] = values[name]
  }
  return result
})

const events = ref<Array<{ name: string; detail: unknown; at: string }>>([])

function handleEvent(name: string, detail: unknown): void {
  events.value.unshift({ name, detail, at: new Date().toLocaleTimeString() })
  events.value = events.value.slice(0, 20)
}

// 文档站的读者是组件消费者，他们实际拿到的是 WC
const mode = ref<'source' | 'wc'>('wc')

async function enableWc(): Promise<void> {
  const modules = (await import('virtual:ctc-wc-index')) as {
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

<template>
  <ClientOnly>
    <div class="demo">
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
        <div class="panel-head">
          <h3>预览</h3>
          <div class="mode-switch">
            <button type="button" :class="{ active: mode === 'wc' }" @click="mode = 'wc'">
              WC 模式
            </button>
            <button
              type="button"
              :class="{ active: mode === 'source' }"
              @click="mode = 'source'"
            >
              源码模式
            </button>
          </div>
        </div>

        <div :key="mode">
          <template v-if="mode === 'source'">
            <VueMount
              v-if="framework === 'vue'"
              :name="name"
              :component="sourceComponent as never"
              :props-data="propsData"
              :on-event="handleEvent"
            />
            <ReactMount
              v-else
              :name="name"
              :component="sourceComponent as never"
              :props-data="propsData"
              :on-event="handleEvent"
            />
          </template>

          <component
            :is="tag"
            v-else
            v-bind="wcProps"
            @ctc-select="handleEvent('select', ($event as CustomEvent).detail)"
          />
        </div>
      </div>

      <div class="panel">
        <h3>事件日志</h3>
        <p v-if="events.length === 0" class="empty">点击组件试试</p>
        <ul v-else>
          <li v-for="(e, i) in events" :key="i">
            <code>ctc-{{ e.name }}</code> · {{ e.at }} · {{ JSON.stringify(e.detail) }}
          </li>
        </ul>
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
.demo {
  margin: 16px 0;
}
.panel {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--ctc-color-border);
  border-radius: var(--ctc-radius-md);
}
.panel h3 {
  margin: 0 0 12px;
  font-size: var(--ctc-font-size-md);
}
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
  border: 1px solid var(--ctc-color-border);
  background: var(--ctc-color-bg);
  font: inherit;
  font-size: var(--ctc-font-size-sm);
  cursor: pointer;
}
.mode-switch button:first-child {
  border-radius: var(--ctc-radius-sm) 0 0 var(--ctc-radius-sm);
}
.mode-switch button:last-child {
  border-left: none;
  border-radius: 0 var(--ctc-radius-sm) var(--ctc-radius-sm) 0;
}
.mode-switch button.active {
  background: var(--ctc-color-primary);
  border-color: var(--ctc-color-primary);
  color: #fff;
}
.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.field small {
  color: var(--ctc-color-text-secondary);
}
.empty {
  color: var(--ctc-color-text-secondary);
  font-size: var(--ctc-font-size-sm);
}
ul {
  margin: 0;
  padding-left: 18px;
  font-size: var(--ctc-font-size-sm);
}
</style>
```

与一期的 `ComponentPage.vue` 相比只有四处不同：props 从 `entry` 变成 `name`、删掉 h1/tag 行（那两样由 md 提供）、默认模式改成 `wc`、根部裹 `<ClientOnly>`。属性表单与事件日志的逻辑一字未动。

- [ ] **Step 2: 在主题里全局注册**

`docs/.vitepress/theme/index.ts` 改成：

```ts
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import '@src/tokens/tokens.css'
import ComponentDemo from './components/ComponentDemo.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ComponentDemo', ComponentDemo)
  },
} satisfies Theme
```

注册成全局组件后，md 里直接写 `<ComponentDemo name="hello-vue" />`，不需要 import。

- [ ] **Step 3: 写一个临时页验证面板**

创建 `docs/components/index.md`：

```md
# 组件总览

<ComponentDemo name="hello-vue" />
```

- [ ] **Step 4: 构建**

```bash
pnpm run docs:build
```

预期：`build complete`。

- [ ] **Step 5: 起 dev 站人工验证**

```bash
pnpm run docs:dev
```

打开 `http://localhost:5173/components/`，逐条确认：

1. 面板**默认是 WC 模式**（按钮高亮在「WC 模式」），预览区出现一枚蓝色按钮。
2. 改「name」输入框的内容，预览区文案实时变化。
3. 勾上「autoLoad」，不报错。
4. 点击预览里的按钮，事件日志出现 `ctc-select · <时间> · {"source":"hello-vue","name":"..."}`。
5. 切到「源码模式」，外观与 WC 模式一致，点击同样能派发事件。
6. 刷新页面，控制台**没有** `Failed to resolve component` 警告，也**没有**重复注册 `ctc-hello-vue` 的报错。

- [ ] **Step 6: 提交**

```bash
git add docs/.vitepress/theme/components/ComponentDemo.vue docs/.vitepress/theme/index.ts docs/components/index.md
git commit -m "docs: 交互面板 ComponentDemo"
```

---

## Task 6: 总览页 `ComponentOverview.vue`

**Files:**
- Create: `docs/.vitepress/theme/components/ComponentOverview.vue`
- Modify: `docs/.vitepress/theme/index.ts`
- Modify: `docs/components/index.md`

- [ ] **Step 1: 写 `ComponentOverview.vue`**

```vue
<script setup lang="ts">
import ComponentDemo from './ComponentDemo.vue'

// 用 eager：meta 模块已经被 ComponentDemo 静态引了，这里再走动态 import 只会让 Rollup
// 同时产出两条路径并警告，没有收益
const names = Object.keys(import.meta.glob('@src/components/*/meta.ts', { eager: true }))
  .map((path) => path.split('/').at(-2) ?? '')
  .sort((a, b) => a.localeCompare(b))
</script>

<template>
  <div>
    <p v-if="names.length === 0" class="empty">还没有任何组件。</p>
    <section v-for="name in names" :id="name" :key="name" class="overview-item">
      <h2 class="overview-title">{{ name }}</h2>
      <ComponentDemo :name="name" />
    </section>
  </div>
</template>

<style scoped>
.overview-item {
  margin-bottom: 48px;
}
.overview-title {
  padding-top: 24px;
  margin-top: 24px;
  border-top: 1px solid var(--ctc-color-border);
}
.overview-item:first-child .overview-title {
  padding-top: 0;
  margin-top: 0;
  border-top: none;
}
.empty {
  color: var(--ctc-color-text-secondary);
}
</style>
```

`:id="name"` 是给侧边栏的兜底链接 `#<name>` 用的锚点。

- [ ] **Step 2: 注册到主题**

`docs/.vitepress/theme/index.ts` 改成：

```ts
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import '@src/tokens/tokens.css'
import ComponentDemo from './components/ComponentDemo.vue'
import ComponentOverview from './components/ComponentOverview.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ComponentDemo', ComponentDemo)
    app.component('ComponentOverview', ComponentOverview)
  },
} satisfies Theme
```

- [ ] **Step 3: 用总览组件替换临时内容**

`docs/components/index.md` 整体替换为：

```md
# 组件总览

下面是 `src/components/` 下发现的全部组件。每个组件有独立页面的，见左侧导航；还没有独立页面的，面板就落在这里。

<ComponentOverview />
```

- [ ] **Step 4: 构建并人工验证**

```bash
pnpm run docs:build && pnpm run docs:dev
```

打开 `http://localhost:5173/components/`。预期：页面按目录名顺序列出 `hello-react`、`hello-vue` 两个组件，各带一个可交互面板，标题旁有可锚定的 id（地址栏加 `#hello-vue` 能跳过去）。

- [ ] **Step 5: 提交**

```bash
git add docs/.vitepress/theme/components/ComponentOverview.vue docs/.vitepress/theme/index.ts docs/components/index.md
git commit -m "docs: 组件总览兜底页"
```

---

## Task 7: 组件页与自动侧边栏

**Files:**
- Create: `docs/components/hello-vue.md`
- Create: `docs/components/hello-react.md`
- Modify: `docs/.vitepress/config.mts`

- [ ] **Step 1: 写 `docs/components/hello-vue.md`**

```md
# hello-vue

用 Vue 3 写的示例组件。点击按钮会派发一次 `ctc-select` 事件。

<ComponentDemo name="hello-vue" />

## 用法

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/hello-vue.js"></script>

<ctc-hello-vue name="World" count="3"></ctc-hello-vue>
```

npm ESM：

```ts
import 'ctc-web-components/hello-vue/define'
```

## 属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `name` | `string` | `World` | 显示在按钮文案里的名字 |
| `count` | `number` | `0` | 显示在按钮文案里的计数 |
| `auto-load` | `boolean` | `false` | 布尔属性，出现即真 |

## 事件

| 事件 | `detail` |
|---|---|
| `ctc-select` | `{ source: 'hello-vue', name: string }` |

事件带 `composed: true`，能穿透 shadow root 冒泡到 `window`。

## 说明

组件源码在 `src/components/hello-vue/Component.vue`，使用的框架不影响最终交付形态 —— 它同样产出一个 `<ctc-hello-vue>` 自定义元素。
```

- [ ] **Step 2: 写 `docs/components/hello-react.md`**

内容为上一页的 React 版本：标题 `# hello-react`、面板 `<ComponentDemo name="hello-react" />`、CDN 片段里的 tag 改 `ctc-hello-react`、事件 `detail` 的 `source` 改 `'hello-react'`、说明段改为指向 `src/components/hello-react/Component.tsx` 并补一句「React 项目里传对象属性必须走 property 通道，React ≤18 会把对象属性序列化」。

- [ ] **Step 3: config.mts 加组件导航与侧边栏**

在 `docs/.vitepress/config.mts` 里，`export default defineConfig({` 之前加：

```ts
function buildComponentSidebar() {
  return listComponents().map((c) => ({
    text: c.name,
    link: c.documented ? `/components/${c.name}` : `/components/#${c.name}`,
  }))
}
```

顶部加导入：

```ts
import { listComponents } from './components'
```

`themeConfig` 改成：

```ts
  themeConfig: {
    nav: [{ text: '组件', link: '/components/' }],
    sidebar: {
      '/components/': [{ text: '组件', items: buildComponentSidebar() }],
    },
  },
```

写了 md 的组件指向自己的页面，没写的兜底指向总览页的锚点 —— 这样加组件的人不写文档，组件也不会从导航里消失，散文可以渐进补。

- [ ] **Step 4: 验证链接指向正确**

```bash
pnpm run docs:build
```

预期：`build complete`。注意 `build complete` **不代表侧边栏链接是对的** —— dead-link 检查不覆盖 `themeConfig`，链接对不对要在下一步用浏览器确认。

- [ ] **Step 5: 人工验证导航**

```bash
pnpm run docs:dev
```

预期：顶栏出现「组件」；进入 `http://localhost:5173/components/hello-vue` 能看到散文 + 面板；侧边栏里两个组件都可点，且当前项高亮。

- [ ] **Step 6: 提交**

```bash
git add docs/components docs/.vitepress/config.mts
git commit -m "docs: 组件页与自动侧边栏"
```

---

## Task 8: 指南四页与「指南」导航

**Files:**
- Create: `docs/guide/index.md`
- Create: `docs/guide/authoring.md`
- Create: `docs/guide/theming.md`
- Create: `docs/guide/build.md`
- Modify: `docs/.vitepress/config.mts`

四页内容由一期 `README.md` 改写而来。

- [ ] **Step 1: 写 `docs/guide/index.md`**

````md
# 快速开始

用 Vue 3 或 React 编写业务组件，构建管线输出统一形态的 Web Component。支持 npm ESM 引入与 CDN 单文件引入。

组件写哪个框架由你决定：Vue 组件放 `Component.vue`，React 组件放 `Component.tsx`。构建脚本按文件名自动判别，两者最终产出一致的 `<ctc-*>` 自定义元素。

## 安装

```bash
pnpm install
```

## 本地开发

```bash
pnpm run docs:dev   # 文档站：http://localhost:5173
```

每个组件页上的交互面板都有两种模式：

- **WC 模式**（默认）—— 走真实的 `createElementClass` 路径，验证属性传递、事件冒泡、Shadow 隔离。这是消费方实际拿到的东西。
- **源码模式** —— 组件源码直接挂载，用于组件作者调试，可获得原生 HMR 与框架 devtools。

两种模式下属性面板与事件日志都由 `meta.ts` 驱动，不用手写。

## 从这里继续

- [新增一个组件](/guide/authoring)
- [主题与 token](/guide/theming)
- [构建与产物](/guide/build)
````

- [ ] **Step 2: 写 `docs/guide/authoring.md`**

````md
# 新增一个组件

在 `src/components/` 下新建目录，放入五个文件即可，**不需要修改任何构建配置或路由**：

```
src/components/<组件名>/
├── Component.vue     # 或 Component.tsx，二者只能有一个
├── meta.ts           # 组件契约：tag、props、events
├── style.css         # 唯一样式来源，禁止用 <style> 块
├── index.ts          # 入口：导出构造器与 register()
└── define.ts         # 副作用入口，CDN 产物用
```

## meta.ts

```ts
import { defineComponentMeta } from '../../runtime/types'

export default defineComponentMeta({
  tag: 'ctc-hello-vue',
  shadow: true,
  props: {
    name: { type: 'string', default: 'World' },
    count: { type: 'number', default: 0 },
    autoLoad: { type: 'boolean', attr: 'auto-load', default: false },
  },
  events: ['select'],
})
```

`props` 的 `type` 目前支持 `string` / `number` / `boolean`，交互面板按它渲染 text / number / checkbox 三种控件。布尔属性的 attribute 名用 `attr` 显式指定。

## 派发事件

```ts
import { useEmit } from '../../runtime/vue'   // React 组件改为 '../../runtime/react'

const emit = useEmit()
emit('select', { id: 1 })                      // → 派发 ctc-select 事件
```

事件名必须出现在 `meta.ts` 的 `events` 数组里，否则开发态会打印警告。事件一律以 `ctc-` 为前缀、`composed: true`，能穿透 shadow root。

## 加完之后

不用改导航。构建脚本扫目录生成入口与 `package.json` 的 `exports`；文档站的侧边栏同样扫目录 —— 组件会立刻出现在左侧导航里，链接指向总览页上的那块面板。想给它一页散文，就新建 `docs/components/<组件名>.md`，侧边栏会自动指过去。
````

- [ ] **Step 3: 写 `docs/guide/theming.md`**

````md
# 主题与 token

所有设计 token 定义在 `src/tokens/tokens.css`，前缀 `--ctc-`。

## 换肤

覆盖任意 `--ctc-*` 变量即可，无需 `::part()`：

```css
:root {
  --ctc-color-primary: #ff4d4f;
}
```

组件内部一律用 `var(--ctc-color-primary, 兜底值)` 取用。**不要在 `:host` 上写变量默认值** —— 它的优先级高于宿主继承来的值，会让换肤静默失效。这是最容易踩的坑：写了不报错，只是换肤不起作用。

## 降级到 light DOM

默认每个组件挂 shadow root。给元素加 `disable-shadow` 属性即降级到 light DOM，样式改为注入 `document.head`（相同 CSS 只注入一次）：

```html
<ctc-hello-vue name="World" disable-shadow></ctc-hello-vue>
```

降级后宿主页面的样式可以直接作用到组件内部，代价是失去了 Shadow 隔离。
````

- [ ] **Step 4: 写 `docs/guide/build.md`**

````md
# 构建与产物

```bash
pnpm run build      # ESM + CDN 全部产物
pnpm run build:esm  # 只出 ESM
pnpm run build:cdn  # 只出 CDN
```

| 路径 | 用途 |
|---|---|
| `dist/esm/*.js` | npm ESM 引入，无副作用，需显式调 `register()` |
| `dist/esm/*/define.js` | npm ESM 引入，import 即注册 |
| `dist/cdn/<组件>.js` | CDN 单文件，运行时内联，import 即注册 |
| `dist/cdn/ctc-all.js` | CDN 全量单文件 |

ESM 一次多入口构建、允许代码分割（消费方是打包器，整目录解析）；IIFE 每个组件单独构建一次 —— Rollup 的 IIFE 格式不支持多入口，这是唯一能产出「单文件可拷走」的方式。

构建结束会打印每个产物的 gzip 体积。`package.json` 的 `exports` 字段由构建脚本扫描组件目录自动生成，加组件后重新构建即自动多出对应子路径，不用手改。

## 引入方式

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/hello-vue.js"></script>

<ctc-hello-vue name="World" count="3"></ctc-hello-vue>
```

ESM：

```ts
import 'ctc-web-components/hello-vue/define'

document.body.innerHTML = '<ctc-hello-vue name="World"></ctc-hello-vue>'
```

React 项目里传对象属性：

```tsx
const ref = useRef<HTMLElement>(null)
useEffect(() => {
  if (ref.current) (ref.current as any).payload = { id: 1 }
}, [])
return <ctc-hello-vue ref={ref} name="World" />
```

React ≤18 会把对象属性序列化，必须走 property 通道；`<ctc-hello-vue>` 需要在自己的 `d.ts` 里补充 JSX 类型声明。

## 体积基线

最近一次构建（gzip）——后续构建应与这张表对比，某个产物突然变大说明引入了未察觉的大依赖：

| 产物 | gzip |
|---|---|
| `dist/cdn/hello-vue.js` | 26.8 KB |
| `dist/cdn/hello-react.js` | 69.3 KB |
| `dist/cdn/ctc-all.js` | 95.2 KB |

ESM 产物体积随打包器而定，不在基线对比范围内。
````

- [ ] **Step 5: config.mts 加指南导航，并把首页 hero 按钮补回来**

Task 1 因为目标页不存在而省掉了 hero 的 `actions`，现在 `docs/guide/index.md` 与 `docs/components/index.md` 都在了，补回 `docs/index.md` 的 frontmatter：

```yaml
hero:
  name: CTC Web Components
  text: 写一个组件，交付一个 Web Component
  tagline: 用 Vue 3 或 React 编写业务组件，构建管线输出统一形态的自定义元素 —— npm 与 CDN 双通道，加组件零配置。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/
    - theme: alt
      text: 组件总览
      link: /components/
```

`themeConfig` 改成：

```ts
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/' },
      { text: '组件', link: '/components/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '快速开始', link: '/guide/' },
            { text: '新增一个组件', link: '/guide/authoring' },
            { text: '主题与 token', link: '/guide/theming' },
            { text: '构建与产物', link: '/guide/build' },
          ],
        },
      ],
      '/components/': [{ text: '组件', items: buildComponentSidebar() }],
    },
  },
```

- [ ] **Step 6: 构建**

```bash
pnpm run docs:build
```

预期：`build complete`。dead-link 检查覆盖的是**指南正文里的相对链接**（`/guide/authoring` 这些），不覆盖 nav / sidebar / hero —— 按钮和导航条目要用浏览器确认。

- [ ] **Step 7: 人工确认导航与首页按钮**

```bash
pnpm run docs:dev
```

预期：首页两个 hero 按钮分别跳到指南首页与组件总览；顶栏「指南」「组件」都在；指南四页在左侧边栏里可点。

- [ ] **Step 8: 提交**

```bash
git add docs/index.md docs/guide docs/.vitepress/config.mts
git commit -m "docs: 指南四页与导航"
```

---

## Task 9: 拆除 playground，收尾脚本

**Files:**
- Delete: `playground/`、`vite.playground.config.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `README.md`

- [ ] **Step 1: 确认没有残留引用**

```bash
grep -rn "playground" --include='*.ts' --include='*.tsx' --include='*.vue' --include='*.json' --include='*.mts' . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=docs/superpowers
```

预期：只剩 `package.json` 的 `dev` 脚本、`vite.playground.config.ts` 自身、`tsconfig.json` 的 `include`。若还有别处（例如某个测试引用了 playground 的路径），一并处理掉。

- [ ] **Step 2: 删除**

```bash
git rm -r playground vite.playground.config.ts
```

`playground/renderers/` 与 `plugins/wc-mode.ts` 已经在 Task 3、4 用 `git mv` 搬走，此时目录里剩下的应该只有 `App.vue`、`ComponentPage.vue`、`index.html`、`main.ts` 与空的子目录。

- [ ] **Step 3: `package.json` 的 `dev` 改指文档站**

```json
"dev": "vitepress dev docs",
```

其余不动 —— `verify` 已经是含 `docs:build` 的五段式。

- [ ] **Step 4: `tsconfig.json` 去掉 `playground`**

```json
"include": ["*.config.ts", "src", "docs", "tests", "scripts"]
```

- [ ] **Step 5: 改 `README.md` 的快速开始**

把「快速开始」小节改成：

````md
## 快速开始

```bash
pnpm install
pnpm run dev        # 文档站：http://localhost:5173
```

文档站在 `docs/`，VitePress 驱动。每个组件一页，散文手写、交互面板由 `meta.ts` 驱动；没有单独写页面的组件会出现在[组件总览](/components/)里。
````

并把「验证」小节的四项表格改成五项，插入一行：

```md
| `docs:build` | VitePress 构建文档站，同时是 SSR 问题的唯一防线 |
```

其余章节（新增组件、构建、引入方式、主题、降级、已知约束）保留 —— 它们是文档站的源材料，README 作为仓库门面保留精简版即可。

- [ ] **Step 6: 全量验证**

```bash
pnpm run verify
```

预期：五段依次全绿 —— `typecheck`、`test`（46 个用例）、`build`（8 个产物 + 3 个 chunk）、`docs:build`、`test:e2e`（8 个用例）。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "chore: 拆除 playground，dev 改指文档站"
```

---

## Task 10: 逐条走验收标准

spec 第 12 节的五条验收标准，逐条跑一遍并记录结论。

- [ ] **Step 1: 标准 1 —— `pnpm run verify` 五项全绿**

```bash
pnpm run verify
```

预期：`typecheck && test && build && docs:build && test:e2e` 全部通过，最后 `playwright` 报 8 passed。

- [ ] **Step 2: 标准 2 —— 产物里不含内部文档**

```bash
rm -rf docs/.vitepress/dist && pnpm run docs:build && find docs/.vitepress/dist -path '*superpowers*'
```

预期：`find` 无输出。

- [ ] **Step 3: 标准 3 —— 起站人工确认五件事**

```bash
pnpm run dev
```

打开 `http://localhost:5173`，逐条确认：

- 首页正常渲染，四个 feature 卡片可点，两个按钮分别跳到 `/guide/` 与 `/components/`
- 侧边栏「组件」分组里 `hello-vue`、`hello-react` 都在
- 进入 `hello-vue` 页，散文与交互面板都在
- 面板默认是 **WC 模式**，改属性实时生效，点击派发 `ctc-select` 并出现在事件日志
- 切到源码模式，行为一致

- [ ] **Step 4: 标准 4 —— 源码热更新不刷整页**

保持 `pnpm run dev` 运行，编辑 `src/components/hello-vue/Component.vue`，把 `Vue 组件` 改成 `Vue 组件啊`。

预期：浏览器**不刷新整页**（页面滚动位置不丢），两种模式下文案都更新，控制台无重复注册报错。改回原样。

- [ ] **Step 5: 标准 5 —— 临时组件自动出现在导航**

```bash
mkdir -p src/components/tmp-probe
cp src/components/hello-vue/{Component.vue,meta.ts,style.css,index.ts,define.ts} src/components/tmp-probe/
sed -i '' "s/ctc-hello-vue/ctc-tmp-probe/" src/components/tmp-probe/meta.ts
```

重启 `pnpm run dev`（`src/components/` 的目录结构变了，侧边栏在启动时生成）。

预期：侧边栏多出 `tmp-probe`，点击后落在 `/components/#tmp-probe`，总览页能看到它的面板并可交互。

**不要**给它写 md —— 这一步验的就是没写文档时组件不会消失。

验证完删除：

```bash
rm -rf src/components/tmp-probe
```

- [ ] **Step 6: 收尾提交**

```bash
git status --short
```

预期：工作区干净（临时目录已删）。若有 `package.json` / `tsconfig.json` 的残余改动未提交，补一次：

```bash
git add -A && git commit -m "chore: 文档站验收收尾"
```

- [ ] **Step 7: 更新记忆**

`docs/superpowers/specs/` 与 `docs/superpowers/plans/` 之外，把「文档站已落地」这一状态更新进记忆文件 `project-vitepress-docs-site.md`（状态从「尚未写 spec」改为「已实施，见 plan 文件」），并把「工作空间」标为下一个待办。

---

## 自审记录

**Spec 覆盖**

| spec 章节 | 落在哪个任务 |
|---|---|
| §4 目录结构 | Task 1 / 3 / 4 / 5 / 6 / 7 / 8 |
| §5 组件发现唯一数据源 | Task 2（`components.ts`），§5 末段「`scripts/build.ts` 不改」由 Task 9 Step 1 的 grep 守住 |
| §6.1 首页 | Task 1 Step 3 |
| §6.2 指南四页 | Task 8 |
| §6.3 组件页 + 兜底页 + 侧边栏 | Task 6 / 7 |
| §7 交互面板（默认 WC、ClientOnly、name prop） | Task 5 |
| §8 SSR 约束 | Task 5（ClientOnly）+ Task 1 Step 8 / Task 10 Step 2（`docs:build` 进 verify） |
| §9 主题与 token | Task 4 Step 5 / 6 |
| §10 配置要点 | Task 1 Step 4 / 3 Step 2 / 4 Step 8 |
| §11 迁移关系 | Task 3 / 4 / 9 |
| §12 验证方式 | Task 1 Step 6 / Task 10 |
| §13 工作空间接缝 | 不实现，`components.ts`、`buildComponentSidebar()`、`wc-mode.ts`、`docs/components/*.md` 四处形状即接缝 |
| §14 风险 1（plugin-react） | Task 4 Step 10 / 11，含退路 |
| §14 风险 2（不用 2.0-alpha） | Task 1 Step 1 锁 `1.6.4` |
| §14 风险 3（ClientOnly 空面板） | 接受，不加 `min-height`（spec §8 称可选） |
| §14 风险 5（srcExclude 被误删） | Task 1 Step 8 + Task 10 Step 2 |

**与 spec 的两处有意偏差**

1. spec §5 给的签名是 `listComponents(): ComponentInfo[]`，实现是多两个可覆盖的目录参数（默认值保持零参可用）。理由：单测需要一个临时目录，否则只能往真实 `src/components/` 里塞文件。
2. spec §11 把 `wc-mode.ts` 的迁移列在「与 playground 的迁移关系」表里，本计划把它提前到 Task 3（在 renderer 之前）。理由：`config.mts` 在 Task 1 就建好了，插件挂上去越早，后面出问题越容易定位是哪一半的锅。

**类型一致性**：`ComponentInfo`（`name` / `framework` / `documented`）在 Task 2 定义，Task 7 的 `buildComponentSidebar()` 只读 `name` 与 `documented`；`listComponents` 的两参数签名在 Task 2 定义后未被改动。`ComponentDemo` 的 prop 名 `name` 在 Task 5 定义，Task 6 的 `<ComponentDemo :name="name" />`、Task 7 的 md 用法一致。`componentStyle(name)` 签名不变。
