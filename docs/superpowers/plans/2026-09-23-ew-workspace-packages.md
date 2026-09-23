# 按工作空间出包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `dist/` 按工作空间切成 `@ew/demo`、`@ew/self-monitor` 等独立包，各自带一份从产物反推依赖的 `package.json`；根包 `easywebcomp` 收缩成 `tokens.css` + `element-plus.css` + CDN。

**Architecture:** `scripts/build.ts` 的 ESM 与 framework 两个构建从「一次构建出全局目录」改成按空间循环，`outDir` 落到 `dist/<空间>/`；新增纯模块 `scripts/workspace-packages.ts` 负责包名、裸说明符解析与 `package.json` 组装；`scripts/check-artifacts.ts` 的两条契约改成按包校验，并新增第三条「产物里的裸导入必须声明过」。

**Tech Stack:** Vite 7（lib 模式多入口）、Rollup、TypeScript、Vitest、Node 22 ESM。

**Spec:** `docs/superpowers/specs/2026-09-23-ew-workspace-packages-design.md`

---

## 给实施者的三条前提

1. **`package.json` 不提交。** 根 `package.json` 里的 `exports` 由构建重写，而它当前还带着用户未提交的自监控依赖（`axios` / `element-plus` / `pinia`）。两者混在一个 commit 里会纠缠不清。本计划**所有 commit 步骤都不得 `git add package.json` 或 `pnpm-lock.yaml`**。每次 `pnpm run build` 之后 `package.json` 都会显示为已修改，这是预期的，不要试图「还原」它。始终用显式路径 `git add <文件>`，不要用 `git add -A` / `git add .`。

2. **Task 2 会故意让下游变红。** 产物布局一变，`check:artifacts`、集成测试、e2e 都会失败 —— 它们还指着 `dist/framework/` 与 `dist/esm/`。Task 3、4 把它们跟上。Task 2 之后**不要**去修这些失败，那是后面两个任务的事。判断 Task 2 是否成功，看的是它自己的验证步骤。

3. **不要动 `src/workspaces/self-monitor/`。** 它是在制品，里面的 `my-list` 组件是本设计里「一个用了 Element Plus 的空间」这个前提的活样本，只能读不能改。

---

## 文件结构

| 文件 | 职责 | 本次动作 |
|---|---|---|
| `scripts/workspace-packages.ts` | 空间包的纯生成规则：包名、裸说明符解析、`package.json` 组装 | **新建** |
| `tests/scripts/workspace-packages.test.ts` | 上面那三个纯函数的单测 | **新建** |
| `scripts/build.ts` | 编排构建，按空间出 ESM / framework，写空间包与根 exports | 改 |
| `scripts/check-artifacts.ts` | 产物守卫：按包校验隔离与 exports，新增依赖声明契约 | 改 |
| `tests/integration/framework.test.ts` | 构建后集成测试的 dist 路径 | 改（两行 import） |
| `tests/e2e/fixture/framework.html` | e2e fixture 的 dist 路径 | 改（一行 import） |
| `tests/e2e/fixture/index.html`、`tests/e2e/smoke.spec.ts` | CDN 路径 | **不动** |
| `vitest.integration.config.ts`、`playwright.config.ts` | 注释里的路径说法 | 改注释 |
| `README.md`、`docs/guide/build.md`、`docs/guide/framework-usage.md`、`docs/workspaces/demo/*.md` | 路径表与用法 | 改 |

**为什么把生成规则抽成 `scripts/workspace-packages.ts`：** `scripts/build.ts` 顶层就调 `main()`（见该文件最后一行），import 它等于跑一次完整构建，没法单测。仓库已有这个先例 —— `scripts/framework-entries.ts` 就是纯生成器，配 `tests/scripts/framework-entries.test.ts`。照抄这个形状。

---

### Task 1: 抽出空间包的生成规则（纯模块 + 单测）

**Files:**
- Create: `scripts/workspace-packages.ts`
- Test: `tests/scripts/workspace-packages.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `tests/scripts/workspace-packages.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  bareSpecifiersOf,
  packageNameOf,
  workspacePackageJson,
} from '../../scripts/workspace-packages'

describe('packageNameOf', () => {
  it('空间目录名进 @ew scope，与 @ew/runtime、@ew/utils 一致', () => {
    expect(packageNameOf('self-monitor')).toBe('@ew/self-monitor')
  })
})

describe('bareSpecifiersOf', () => {
  it('取包名：scoped 留两段，子路径砍掉', () => {
    const code = `
import { a } from "vue";
import "react-dom/client";
import { b } from "element-plus/es/locale/lang/zh-cn";
import { c } from "@ew/runtime";
`
    expect(bareSpecifiersOf(code)).toEqual(['@ew/runtime', 'element-plus', 'react-dom', 'vue'])
  })

  it('相对路径与绝对路径不是包，丢掉', () => {
    expect(bareSpecifiersOf('import "./style-DMkl47vG.js";\nimport "/abs.js";')).toEqual([])
  })

  it('同一个包出现多次只算一个', () => {
    expect(bareSpecifiersOf('export { a } from "vue";\nimport { b } from "vue";')).toEqual(['vue'])
  })
})

describe('workspacePackageJson', () => {
  const base = {
    workspace: 'demo',
    version: '0.1.0',
    private: true,
    versions: { vue: '^3.5.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
  }

  it('只有该空间真有产物的框架才出 ./vue ./react', () => {
    const pkg = workspacePackageJson({ ...base, frameworks: ['vue'], externals: ['vue'] })
    expect(pkg.name).toBe('@ew/demo')
    expect(pkg.version).toBe('0.1.0')
    expect(pkg.private).toBe(true)
    expect(pkg.type).toBe('module')
    expect(pkg.exports).toEqual({
      '.': './esm/index.js',
      './*': './esm/*.js',
      './vue': './framework/vue.js',
    })
  })

  it('外部依赖一律声明成 optional peer', () => {
    const pkg = workspacePackageJson({
      ...base,
      frameworks: ['vue', 'react'],
      externals: ['react', 'react-dom', 'vue'],
    })
    expect(pkg.peerDependencies).toEqual({
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      vue: '^3.5.0',
    })
    expect(pkg.peerDependenciesMeta).toEqual({
      react: { optional: true },
      'react-dom': { optional: true },
      vue: { optional: true },
    })
  })

  it('没有外部依赖时不写 peer 三兄弟', () => {
    const pkg = workspacePackageJson({ ...base, frameworks: ['vue'], externals: [] })
    expect(pkg).not.toHaveProperty('peerDependencies')
    expect(pkg).not.toHaveProperty('peerDependenciesMeta')
  })

  it('根包没有版本的依赖直接报错，不静默写个空串', () => {
    expect(() =>
      workspacePackageJson({ ...base, frameworks: ['vue'], externals: ['lodash'] }),
    ).toThrow('lodash')
  })
})
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `pnpm run test -- workspace-packages`
Expected: FAIL，`Failed to resolve import "../../scripts/workspace-packages"`。

- [ ] **Step 3: 实现**

创建 `scripts/workspace-packages.ts`：

```ts
/**
 * 空间包（`dist/<空间>/package.json`）的生成规则。
 *
 * 单独成模块而不是写在 build.ts 里：build.ts 顶层就调 main()，import 它等于跑一次完整
 * 构建，没法单测。这里三个函数都是纯的。
 */

export interface WorkspacePackageInput {
  /** 空间目录名，如 self-monitor */
  workspace: string
  /** 继承根包版本，全仓库锁步 */
  version: string
  /** 继承根包。不是 true 时不出这个字段 */
  private?: boolean
  /** 该空间真有框架产物的框架 —— 决定出不出 ./vue / ./react */
  frameworks: ReadonlyArray<'vue' | 'react'>
  /** 从 dist/<空间>/framework/*.js 扫出来的包名，调用方去重后传入 */
  externals: readonly string[]
  /** 版本来源：根包的 peerDependencies ⊕ dependencies */
  versions: Readonly<Record<string, string>>
}

/** 空间目录名 → 包名。与 @ew/runtime、@ew/utils 同一个 scope。 */
export function packageNameOf(workspace: string): string {
  return `@ew/${workspace}`
}

/** `@scope/name/sub` → `@scope/name`；`name/sub` → `name` */
function packageRootOf(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/**
 * 从产物代码里抽出裸说明符的包名，去重排序。
 *
 * 正则与 check-artifacts.ts 的 stripSpecifiers 同源 —— 那边抹掉说明符好数运行时标记，
 * 这边留下说明符好反推依赖。相对路径与绝对路径不是包，丢掉。
 */
export function bareSpecifiersOf(code: string): string[] {
  const found = new Set<string>()
  for (const match of code.matchAll(/\b(?:from|import)\s*["']([^"']+)["']/g)) {
    const specifier = match[1]
    if (specifier.startsWith('.') || specifier.startsWith('/')) continue
    found.add(packageRootOf(specifier))
  }
  return [...found].sort()
}

/**
 * 空间包的 package.json。
 *
 * 依赖声明成 peer 而不是 dependency：frameworkExternals 那张表的存在理由就是「宿主必须
 * 带同一份实例」（见 build.ts 里那段注释）。声明成 dependency 会让包管理器自动装第二份，
 * 正好制造该表要防的事故。一律 optional —— Vue 项目不该因为没装 React 而告警。
 */
export function workspacePackageJson(input: WorkspacePackageInput): Record<string, unknown> {
  const exports: Record<string, string> = {
    '.': './esm/index.js',
    './*': './esm/*.js',
  }
  for (const framework of ['vue', 'react'] as const) {
    if (input.frameworks.includes(framework)) {
      exports[`./${framework}`] = `./framework/${framework}.js`
    }
  }

  const peerDependencies: Record<string, string> = {}
  for (const name of input.externals) {
    const version = input.versions[name]
    if (version === undefined) {
      throw new Error(
        `[build] ${packageNameOf(input.workspace)} 的产物引了 "${name}"，` +
          '但根 package.json 的 peerDependencies / dependencies 里没有它的版本',
      )
    }
    peerDependencies[name] = version
  }

  const manifest: Record<string, unknown> = {
    name: packageNameOf(input.workspace),
    version: input.version,
  }
  if (input.private === true) manifest.private = true
  manifest.type = 'module'
  manifest.exports = exports
  if (input.externals.length > 0) {
    manifest.peerDependencies = peerDependencies
    manifest.peerDependenciesMeta = Object.fromEntries(
      input.externals.map((name) => [name, { optional: true }]),
    )
  }

  return manifest
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm run test -- workspace-packages`
Expected: PASS，8 个用例（packageNameOf 1、bareSpecifiersOf 3、workspacePackageJson 4）。

- [ ] **Step 5: 提交**

```bash
git add scripts/workspace-packages.ts tests/scripts/workspace-packages.test.ts
git commit -m "feat(build): 抽出空间包的生成规则，依赖从产物反推"
```

---

### Task 2: 按空间出 ESM 与 framework，写空间包

**Files:**
- Modify: `scripts/build.ts`

> **本任务结束后下游会红，这是设计好的。** `check:artifacts`、`pnpm run check:framework`、`pnpm run test:e2e` 都还指着旧路径，Task 3 / 4 才把它们跟上。

- [ ] **Step 1: 加 import**

`scripts/build.ts:20-26` 现在是：

```ts
import {
  barrelSource,
  reactWrapperSource,
  vueWrapperSource,
  type FrameworkComponent,
} from './framework-entries.ts'
import { findPrefixViolations } from './style-prefix.ts'
```

改成：

```ts
import {
  barrelSource,
  reactWrapperSource,
  vueWrapperSource,
  type FrameworkComponent,
} from './framework-entries.ts'
import { findPrefixViolations } from './style-prefix.ts'
import {
  bareSpecifiersOf,
  packageNameOf,
  workspacePackageJson,
} from './workspace-packages.ts'
```

- [ ] **Step 2: 加一个按空间分组的辅助函数**

在 `discoverComponents` 之后（约 `scripts/build.ts:92`，`checkStylePrefixes` 之前）插入：

```ts
/** 组件/产物列表里出现过的空间名，排序后返回 —— 构建按它循环 */
function workspacesOf(items: ReadonlyArray<{ workspace: string }>): string[] {
  return [...new Set(items.map((item) => item.workspace))].sort()
}
```

- [ ] **Step 3: 生成入口改成按空间出桶**

`writeGeneratedEntries` 整个函数（`scripts/build.ts:157-192`）替换为：

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

  // 每个空间一个桶：空间包的 `.` 入口只拉本空间的组件
  for (const workspace of workspacesOf(components)) {
    const lines = components
      .filter((c) => c.workspace === workspace)
      .map((c) => `export * as ${toIdentifier(c.name)} from '${entryPath(c)}'`)
    writeFileSync(join(generatedDir, `all-${workspace}.ts`), `${lines.join('\n')}\n`)
  }

  // ew-all 仍是跨空间聚合，全局那一份保留
  const defineLines = components.map(
    (c, i) => `import { register as r${i} } from '${entryPath(c)}'`,
  )
  defineLines.push('', components.map((_, i) => `r${i}()`).join('\n'), '')
  writeFileSync(join(generatedDir, 'all-define.ts'), `${defineLines.join('\n')}\n`)

  for (const c of frameworkComponents) {
    const source = c.framework === 'vue' ? vueWrapperSource(c) : reactWrapperSource(c)
    writeFileSync(join(generatedDir, 'framework', `${c.name}.ts`), source)
  }

  // 框架桶也按空间切。该空间没有某个框架的组件就不生成 —— 出一个空桶会让
  // check:artifacts 把它当成「external 没生效」（空模块里没有裸导入）。
  for (const workspace of workspacesOf(frameworkComponents)) {
    for (const framework of ['vue', 'react'] as const) {
      const mine = frameworkComponents.filter(
        (c) => c.workspace === workspace && c.framework === framework,
      )
      if (mine.length === 0) continue
      writeFileSync(
        join(generatedDir, 'framework', `index-${workspace}-${framework}.ts`),
        barrelSource(mine, framework),
      )
    }
  }
}
```

- [ ] **Step 4: `buildEsm` 按空间循环**

`buildEsm`（`scripts/build.ts:216-243`）整体替换为：

```ts
async function buildEsm(components: ComponentInfo[]): Promise<void> {
  for (const workspace of workspacesOf(components)) {
    const entry: Record<string, string> = {
      index: join(generatedDir, `all-${workspace}.ts`),
    }
    for (const c of components.filter((c) => c.workspace === workspace)) {
      entry[c.name] = join(c.dir, 'index.ts')
      entry[`${c.name}/define`] = join(c.dir, 'define.ts')
    }

    await build({
      root,
      configFile: false,
      resolve: { alias: vueAlias },
      css: cssConfig,
      plugins: sharedPlugins(),
      build: {
        target: 'es2020',
        outDir: `dist/${workspace}/esm`,
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
}
```

- [ ] **Step 5: `element-plus.css` 挪到 `dist/` 根**

`writeElementPlusCss` 里那一行（`scripts/build.ts:330-333`）：

```ts
  writeFileSync(
    join(root, 'dist/framework/element-plus.css'),
    `${charset}@layer ew {\n${body}\n}\n`,
  )
```

改成：

```ts
  writeFileSync(join(root, 'dist/element-plus.css'), `${charset}@layer ew {\n${body}\n}\n`)
```

并把该函数上方注释里「组件库样式单独出一个入口」那段保留不动，只在末尾补一句：

```ts
 * 落在 dist 根而不是某个空间下：它是 Element Plus 的**全量**样式，与空间无关。
 * 放进某个空间是错位（第二个空间用 EP 时要么复制两份、要么另抽包），留根包则
 * 消费方多引一行 easy-webcomp/element-plus.css。
 */
```

- [ ] **Step 6: `buildFramework` 按空间循环**

`buildFramework`（`scripts/build.ts:336-363`）整体替换为：

```ts
async function buildFramework(
  components: ComponentInfo[],
  frameworkComponents: FrameworkComponent[],
): Promise<void> {
  for (const workspace of workspacesOf(components)) {
    const entry: Record<string, string> = {}
    for (const framework of ['vue', 'react'] as const) {
      const mine = frameworkComponents.filter(
        (c) => c.workspace === workspace && c.framework === framework,
      )
      if (mine.length === 0) continue
      entry[framework] = join(generatedDir, 'framework', `index-${workspace}-${framework}.ts`)
    }
    // 整个空间都用 Tailwind（只出 WC）时没有框架入口，跳过
    if (Object.keys(entry).length === 0) continue

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
        outDir: `dist/${workspace}/framework`,
        emptyOutDir: true,
        minify: 'esbuild',
        rollupOptions: { external: isFrameworkExternal },
        lib: {
          entry,
          formats: ['es'],
          fileName: (_format, entryName) => `${entryName}.js`,
        },
      },
    })
  }

  writeElementPlusCss()
}
```

- [ ] **Step 7: `writeExportsField` 拆成两个函数**

`writeExportsField`（`scripts/build.ts:365-394`，含它上方那段长注释）整体替换为：

```ts
/**
 * 根包的 exports 收缩成三条：ESM 与 framework 都按空间搬走了，根上只剩 tokens.css、
 * element-plus.css 与 CDN。**不保留聚合的 `./vue` / `./react`** —— 那个桶正是本设计要
 * 消灭的东西（引 HelloVue 会连 element-plus 一起拖进来）。
 *
 * 不需要任何产物就能算出来，所以 --only 下也照跑（与拆分前 writeExportsField 的行为一致）。
 */
function writeRootExports(): void {
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>

  pkg.exports = {
    './tokens.css': './src/tokens/tokens.css',
    './element-plus.css': './dist/element-plus.css',
    './cdn/*': './dist/cdn/*.js',
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

/**
 * 给每个空间写一份 package.json。
 *
 * 依赖从产物反推：`dist/<空间>/framework/*.js` 里那句 `import ... from "element-plus"`
 * 就是证据。不手写依赖表 —— 手写的表迟早与产物漂移，而漂移的症状（消费方解析不到说明符）
 * 要到别人装包时才暴露。
 *
 * 用 pattern 而不是逐条列举组件：枚举的代价是每个组件往 package.json 里塞两行。与根包
 * 那份不同，空间包的 package.json 落在被 gitignore 的 dist/ 下、不入库，所以这条
 * 「避免两人各加一个组件时撞冲突」的理由在这里不成立，但 pattern 让 exports 与组件清单
 * 解耦仍然值得。`*` 能跨 `/`，故 `@ew/<空间>/<组件>/define` 也由 `./*` 覆盖。
 *
 * 已知代价：`./*` 把 esm 目录里那些哈希 chunk（如 index-BZwKHW0M.js）也暴露成了可导入的
 * 子路径。不打算为它收紧 —— 这些文件是构建内部件，消费方没有理由去 import，而收紧要靠
 * 枚举组件，就又回到上面那个冲突问题。
 */
function writeWorkspacePackages(
  components: ComponentInfo[],
  frameworkComponents: FrameworkComponent[],
): void {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    version?: string
    private?: boolean
    peerDependencies?: Record<string, string>
    dependencies?: Record<string, string>
  }
  // 版本来源：peerDependencies 压过 dependencies。element-plus / pinia 只在 dependencies
  // 里有版本，vue / react 两处都有，这条合并让三种情况都能取到。
  const versions = { ...pkg.dependencies, ...pkg.peerDependencies }

  for (const workspace of workspacesOf(components)) {
    const dir = join(root, 'dist', workspace)
    const frameworks = (['vue', 'react'] as const).filter((framework) =>
      frameworkComponents.some((c) => c.workspace === workspace && c.framework === framework),
    )
    const externals = [
      ...new Set(
        frameworks.flatMap((framework) =>
          bareSpecifiersOf(readFileSync(join(dir, 'framework', `${framework}.js`), 'utf8')),
        ),
      ),
    ].sort()

    const manifest = workspacePackageJson({
      workspace,
      version: pkg.version ?? '0.0.0',
      private: pkg.private,
      frameworks,
      externals,
      versions,
    })
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
}
```

`packageNameOf` 在本文件里没被直接调用（`workspacePackageJson` 内部用了它），所以 import 列表里会有未使用项 —— **把它从 import 里删掉**，Step 1 写的那段 import 最终只留两个名字：

```ts
import { bareSpecifiersOf, workspacePackageJson } from './workspace-packages.ts'
```

- [ ] **Step 8: `main()` 接上**

`main()`（`scripts/build.ts:415-453`）里两处：

```ts
  if (!only || only === 'framework') {
    console.log('[build] 构建框架产物...')
    await buildFramework()
  }

  writeExportsField()
  reportSizes()
```

改成：

```ts
  if (!only || only === 'framework') {
    console.log('[build] 构建框架产物...')
    await buildFramework(components, frameworkComponents)
  }

  writeRootExports()
  // 空间包的依赖从 framework 产物反推，要全量构建的产物才成立 —— --only 时跳过，
  // 此时 dist/ 下那些 package.json 保持上一次全量构建写下的内容。
  if (!only) writeWorkspacePackages(components, frameworkComponents)

  reportSizes()
```

- [ ] **Step 9: 跑构建，确认新布局**

Run: `pnpm run build`
Expected: 退出码 0，末尾打印的体积表里出现 `dist/demo/esm/...`、`dist/demo/framework/...`、`dist/self-monitor/esm/...`、`dist/self-monitor/framework/vue.js`、`dist/element-plus.css`。

- [ ] **Step 10: 确认布局与包内容**

Run:

```bash
ls dist && echo "--- demo ---" && cat dist/demo/package.json && echo "--- self-monitor ---" && cat dist/self-monitor/package.json && echo "--- root exports ---" && node -e "console.log(JSON.stringify(require('./package.json').exports,null,2))"
```

Expected：

- `dist/` 下是 `cdn  demo  element-plus.css  self-monitor`，**没有** `esm` 与 `framework` 两个目录。
- `dist/demo/package.json` 的 `peerDependencies` 是 `react` / `react-dom` / `vue`，`exports` 含 `./vue` 与 `./react`。
- `dist/self-monitor/package.json` 的 `peerDependencies` 是 `element-plus` / `pinia` / `vue`，`exports` **不含** `./react`（该空间没有 `.tsx` 组件）。
- 根 `exports` 只剩 `./tokens.css` / `./element-plus.css` / `./cdn/*` 三条。

若 `dist/self-monitor/package.json` 里出现了 `./react`，说明 Step 3 的框架桶过滤没生效，回 Step 3。

- [ ] **Step 11: 确认下游确实红了（不是坏了）**

Run: `pnpm run check:artifacts`
Expected: FAIL，报 `exports 里 easywebcomp/hello-vue 没有匹配的键` 与 `缺少框架产物 dist/framework/vue.js` 之类。这是 Task 3 要修的，**本步到此为止，不要动手修**。

- [ ] **Step 12: 提交**

```bash
git add scripts/build.ts
git commit -m "feat(build): dist 按工作空间出包，element-plus.css 提到根"
```

`package.json` 不提交（见「给实施者的三条前提」第 1 条）。

---

### Task 3: 守卫改成按包校验，新增依赖声明契约

**Files:**
- Modify: `scripts/check-artifacts.ts`

- [ ] **Step 1: 组件发现带上空间与「是否出框架产物」**

`scripts/check-artifacts.ts:31-47` 的 `discoverComponents` 整体替换为：

```ts
interface DiscoveredComponent {
  name: string
  workspace: string
  framework: Framework
  /** 是否出框架产物。Tailwind 组件只出 WC */
  inFramework: boolean
}

/** 组件清单、框架与归属空间都取自源码目录，而不是文件名约定 —— 与构建脚本同一处事实来源 */
function discoverComponents(): DiscoveredComponent[] {
  const workspacesDir = join(root, 'src/workspaces')
  const found: DiscoveredComponent[] = []

  for (const ws of readdirSync(workspacesDir)) {
    const componentsDir = join(workspacesDir, ws, 'components')
    if (!existsSync(componentsDir)) continue

    for (const name of readdirSync(componentsDir)) {
      const dir = join(componentsDir, name)
      let framework: Framework | undefined
      if (existsSync(join(dir, 'Component.vue'))) framework = 'vue'
      else if (existsSync(join(dir, 'Component.tsx'))) framework = 'react'
      if (framework === undefined) continue

      // 与 build.ts 的 loadFrameworkComponents 同一判据：Tailwind 的 preflight 是全局
      // reset，与 light DOM 下「不影响其他组件」天然冲突，这类组件只出 WC。
      const inFramework = !['style.scss', 'style.css']
        .map((f) => join(dir, f))
        .filter((p) => existsSync(p))
        .some((p) => readFileSync(p, 'utf8').includes('@import "tailwindcss"'))

      found.push({ name, workspace: ws, framework, inFramework })
    }
  }

  return found
}
```

- [ ] **Step 2: 加外部依赖清单常量**

在 `const MARKER = ...`（`scripts/check-artifacts.ts:22`）下方插入：

```ts
/**
 * 与 scripts/build.ts 的 frameworkExternals **故意各写一份**。
 *
 * 下游的第三条契约（checkPackages）拿这张表逐个去产物里找裸导入，而 build.ts 那边是
 * 「解析出所有说明符再取包名」—— 两条路径独立，才能互相验。共用一份的话，解析器漏掉
 * 某种形态时两边一起漏，守卫永远绿。
 */
const FRAMEWORK_EXTERNALS = ['vue', 'react', 'react-dom', 'element-plus', 'pinia']
```

- [ ] **Step 3: `checkFramework` 改成按空间**

`checkFramework`（`scripts/check-artifacts.ts:115-148`，含上方那段长注释）整体替换为：

```ts
/**
 * 框架产物的守卫，按空间各查一遍。
 *
 * **运行时检查扫整个目录，不是只扫入口。** external 失效时框架代码落到哪由 Rollup
 * 决定：单入口就落在那个入口里，两个入口都用得上时会被提成共享 chunk。只看 vue.js /
 * react.js 会在后一种情况下漏判。（实测过：往其中一个入口塞一句对手框架的引用，
 * Rollup 会新开一个 chunk 承接，入口文件本身干干净净。）
 *
 * 判据是「剥掉说明符后标记字面量为 0」（见 stripSpecifiers）：external 生效时产物里
 * 恰恰留着一句裸导入，那个形态是健康的，按字面量数会误报。
 *
 * 「该有的必须有、不该有的不许有」两个方向都查：少一个 `framework/vue.js` 说明
 * buildFramework 漏了该空间；多一个 `framework/react.js` 说明框架桶没按空间过滤干净，
 * 而那个空模块会让「裸导入必须在」这条检查失效。
 *
 * **不覆盖的事：** 包装层误引了对面适配器（`@ew/runtime` 的桶两个适配器都导出）只会多出
 * 一句对面的裸导入、外加几 KB 代码，不产生运行时代码，这里拦不住 —— 它是体积问题不是
 * 正确性问题，由 docs/guide/build.md 的体积基线人眼比对。
 */
function checkFramework(components: DiscoveredComponent[], failures: string[]): void {
  for (const workspace of [...new Set(components.map((c) => c.workspace))].sort()) {
    const dir = join(root, 'dist', workspace, 'framework')
    const mine = components.filter((c) => c.workspace === workspace)

    for (const [framework, marker] of [
      ['vue', '__isVue'],
      ['react', 'react-dom'],
    ] as const) {
      const entry = join(dir, `${framework}.js`)
      const expected = mine.some((c) => c.inFramework && c.framework === framework)

      if (!existsSync(entry)) {
        if (expected) failures.push(`缺少框架产物 dist/${workspace}/framework/${framework}.js`)
        continue
      }
      if (!expected) {
        failures.push(
          `dist/${workspace}/framework/${framework}.js 存在，但该空间没有 ${framework} 组件 —— 桶没按空间过滤`,
        )
        continue
      }

      // 裸导入必须在：它是 external 生效的证据
      const code = readFileSync(entry, 'utf8')
      if (!new RegExp(`from\\s*["']${framework}["']`).test(code)) {
        failures.push(
          `dist/${workspace}/framework/${framework}.js 里没有对 ${framework} 的裸导入，external 没生效`,
        )
      }

      // 运行时代码一个文件里都不该有（含共享 chunk）
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
        const hits = count(stripSpecifiers(readFileSync(join(dir, file), 'utf8')), marker)
        if (hits !== 0) {
          failures.push(
            `dist/${workspace}/framework/${file} 里出现 ${marker} ${hits} 次，框架运行时不该被打进产物`,
          )
        }
      }
    }
  }

  if (!existsSync(join(root, 'dist/element-plus.css'))) {
    failures.push('缺少 dist/element-plus.css')
  }
}
```

- [ ] **Step 4: 新增 `checkPackages`**

在 `checkFramework` 之后、`checkExports` 之前插入：

```ts
/**
 * 第三条契约：空间包存在，且框架产物里的裸导入都在它的 package.json 里声明过。
 *
 * build.ts 那里是「解析出所有说明符再取包名」（workspace-packages.ts 的
 * bareSpecifiersOf），这里反过来「拿 FRAMEWORK_EXTERNALS 这张已知的表逐个去产物里找」。
 * 两条路径不共用代码是有意的：共用一份解析器的话，解析器漏掉某种形态（比如仅副作用
 * 导入 `import "x"`）时两边会一起漏，守卫永远绿。
 *
 * 只查「用了没声明」这一个方向。声明了却没用上只是多装一个 peer，不破坏消费方，
 * 不值得为它引入误报风险。
 */
function checkPackages(components: DiscoveredComponent[], failures: string[]): void {
  for (const workspace of [...new Set(components.map((c) => c.workspace))].sort()) {
    const dir = join(root, 'dist', workspace)
    const pkgPath = join(dir, 'package.json')
    if (!existsSync(pkgPath)) {
      failures.push(`缺少空间包 dist/${workspace}/package.json`)
      continue
    }

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      name?: string
      peerDependencies?: Record<string, string>
    }
    const expectedName = `@ew/${workspace}`
    if (pkg.name !== expectedName) {
      failures.push(`dist/${workspace}/package.json 的 name 是 "${pkg.name}"，应为 "${expectedName}"`)
    }

    const frameworkDir = join(dir, 'framework')
    if (!existsSync(frameworkDir)) continue

    const declared = new Set(Object.keys(pkg.peerDependencies ?? {}))
    const files = readdirSync(frameworkDir).filter((f) => f.endsWith('.js'))

    for (const name of FRAMEWORK_EXTERNALS) {
      const pattern = new RegExp(`(?:from|import)\\s*["']${name}(?:/[^"']*)?["']`)
      const used = files.some((file) => pattern.test(readFileSync(join(frameworkDir, file), 'utf8')))
      if (used && !declared.has(name)) {
        failures.push(
          `dist/${workspace}/framework 里引了 "${name}"，但 dist/${workspace}/package.json 没声明`,
        )
      }
    }
  }
}
```

- [ ] **Step 5: `checkExports` 改成按包**

`resolveSpecs`（`scripts/check-artifacts.ts:49-73`，含上方那段长注释）里的 `cwd: root` 改成 `cwd`：

```ts
function resolveSpecs(specs: string[], cwd: string): Record<string, string | null> {
```

函数体里 `spawnSync` 的选项 `cwd: root,` 改成 `cwd,`。上方注释末尾补一句：

```ts
 * `cwd` 决定 self-reference 认哪个包：根包的 exports 在仓库根解析，空间包的
 * exports 要在 `dist/<空间>/` 里解析 —— 不换 cwd 的话 `@ew/demo/vue` 根本找不到。
 */
```

`checkExports`（`scripts/check-artifacts.ts:150-174`，含上方那段长注释）整体替换为：

```ts
/**
 * 第二条契约：每个包的 exports 子路径必须真能解析到文件。
 *
 * 组件子路径由 pattern（`./*`）覆盖而不是逐条列举 —— 好处是 package.json
 * 不再随组件增减而变动，代价是它对「有哪些组件」一无所知，写错一个字符不会有任何测试红，
 * 要等消费方 import 时才炸。所以在这里按源码目录里的组件清单逐个走一遍。
 *
 * 交给真实解析而不是自己按 pattern 拼路径：Node 的精确键优先于 pattern 这条规则自己
 * 实现一遍就容易错。解析只做映射、不 stat 文件，所以结果还要 existsSync 一次。
 *
 * `./vue` / `./react` 只在空间真有该框架组件时才该存在（build.ts 的框架桶按空间过滤），
 * 所以期望清单也得跟着条件生成 —— 无条件要 `@ew/self-monitor/react` 会假红。
 */
function checkExports(components: DiscoveredComponent[], failures: string[]): void {
  // 根包：ESM 与 framework 都按空间搬走了，只剩 tokens.css / element-plus.css / CDN
  verifySpecs(
    [
      `${PKG}/tokens.css`,
      `${PKG}/element-plus.css`,
      ...components.map((c) => `${PKG}/cdn/${c.name}`),
      `${PKG}/cdn/ew-all`,
    ],
    root,
    failures,
  )

  const byWorkspace = new Map<string, DiscoveredComponent[]>()
  for (const c of components) {
    byWorkspace.set(c.workspace, [...(byWorkspace.get(c.workspace) ?? []), c])
  }

  for (const [workspace, mine] of byWorkspace) {
    const specs = [
      `@ew/${workspace}`,
      ...mine.flatMap((c) => [`@ew/${workspace}/${c.name}`, `@ew/${workspace}/${c.name}/define`]),
      ...(['vue', 'react'] as const)
        .filter((framework) => mine.some((c) => c.inFramework && c.framework === framework))
        .map((framework) => `@ew/${workspace}/${framework}`),
    ]
    verifySpecs(specs, join(root, 'dist', workspace), failures)
  }
}

function verifySpecs(specs: string[], cwd: string, failures: string[]): void {
  const resolved = resolveSpecs(specs, cwd)
  for (const spec of specs) {
    const target = resolved[spec]
    if (target === null) {
      failures.push(`exports 里 ${spec} 没有匹配的键`)
    } else if (!existsSync(target)) {
      failures.push(`exports 里 ${spec} 解析到 ${relative(root, target)}，但该文件不存在`)
    }
  }
}
```

- [ ] **Step 6: `main()` 接上新检查**

`main()`（`scripts/check-artifacts.ts:176-227`）里：

```ts
  checkFramework(failures)
  checkExports(components, failures)
```

改成：

```ts
  checkFramework(components, failures)
  checkPackages(components, failures)
  checkExports(components, failures)
```

同时 `main()` 顶部 `const frameworkOf = new Map(components.map((c) => [c.name, c.framework]))` 保持不变 —— CDN 那段用的还是它。

- [ ] **Step 7: 跑守卫，确认全绿**

Run: `pnpm run check:artifacts`
Expected: PASS，打印两行 `[check:artifacts] 产物隔离正常` 与 `[check:artifacts] exports 契约正常`。

若报 `exports 里 @ew/demo/vue 没有匹配的键`，说明 `resolveSpecs` 的 `cwd` 没传进去，回 Step 5。

- [ ] **Step 8: 负向验证 —— 守卫真的会红**

守卫全绿不等于守卫有效。逐条确认它能抓到三类事故。

先备份再逐个破坏，每验一条就还原：

```bash
cp dist/self-monitor/package.json /tmp/sm-pkg.json
node -e "const p=require('./dist/self-monitor/package.json');delete p.peerDependencies['element-plus'];require('fs').writeFileSync('dist/self-monitor/package.json',JSON.stringify(p,null,2))"
pnpm run check:artifacts; echo "exit=$?"
cp /tmp/sm-pkg.json dist/self-monitor/package.json
```

Expected: FAIL，`dist/self-monitor/framework 里引了 "element-plus"，但 dist/self-monitor/package.json 没声明`，`exit=1`。

再验「不该有的框架产物」：

```bash
echo 'export {}' > dist/self-monitor/framework/react.js
pnpm run check:artifacts; echo "exit=$?"
rm dist/self-monitor/framework/react.js
```

Expected: FAIL，`dist/self-monitor/framework/react.js 存在，但该空间没有 react 组件`。

再验「exports 指向不存在的文件」：

```bash
node -e "const p=require('./dist/demo/package.json');p.exports['./vue']='./framework/nope.js';require('fs').writeFileSync('dist/demo/package.json',JSON.stringify(p,null,2))"
pnpm run check:artifacts; echo "exit=$?"
pnpm run build
```

Expected: FAIL，`exports 里 @ew/demo/vue 解析到 dist/demo/framework/nope.js，但该文件不存在`。最后一条 `pnpm run build` 把 `dist/demo/package.json` 重新生成回正确内容。

- [ ] **Step 9: 提交**

```bash
git add scripts/check-artifacts.ts
git commit -m "fix(check:artifacts): 守卫改成按包校验，新增依赖声明契约"
```

---

### Task 4: 集成测试与 e2e 跟上新路径

**Files:**
- Modify: `tests/integration/framework.test.ts:5-6`
- Modify: `tests/e2e/fixture/framework.html:23`
- Modify: `vitest.integration.config.ts:7`
- Modify: `playwright.config.ts:35`

- [ ] **Step 1: 集成测试的 import**

`tests/integration/framework.test.ts:5-6`：

```ts
import { HelloReact } from '../../dist/framework/react.js'
import { HelloVue } from '../../dist/framework/vue.js'
```

改成：

```ts
import { HelloReact } from '../../dist/demo/framework/react.js'
import { HelloVue } from '../../dist/demo/framework/vue.js'
```

- [ ] **Step 2: 跑集成测试**

Run: `pnpm run check:framework`
Expected: PASS，7 个用例。

- [ ] **Step 3: e2e fixture 的 import**

`tests/e2e/fixture/framework.html:23`：

```html
      import { HelloVue } from '/dist/framework/vue.js'
```

改成：

```html
      import { HelloVue } from '/dist/demo/framework/vue.js'
```

- [ ] **Step 4: 两处注释里的路径说法**

`vitest.integration.config.ts:7`：

```ts
 * 这些用例 import 的是 dist/framework/*.js，构建没跑过它们必然失败。所以用独立配置 +
```

改成：

```ts
 * 这些用例 import 的是 dist/<空间>/framework/*.js，构建没跑过它们必然失败。所以用独立配置 +
```

`playwright.config.ts:35`：

```ts
      // root 指向仓库根而不是 devtools：fixture 与 dist/framework 都在仓库根下，而
```

改成：

```ts
      // root 指向仓库根而不是 devtools：fixture 与 dist/ 都在仓库根下，而
```

- [ ] **Step 5: 跑 e2e**

Run: `pnpm run test:e2e`
Expected: PASS，12 个用例。

若报 `Failed to load script at http://localhost:4173/dist/cdn/ew-all.js`，先查 4173 端口是不是被残留进程占着（`lsof -i :4173`）—— `reuseExistingServer` 会静默复用它，症状看起来像构建回归，其实不是。

- [ ] **Step 6: 提交**

```bash
git add tests/integration/framework.test.ts tests/e2e/fixture/framework.html vitest.integration.config.ts playwright.config.ts
git commit -m "test: 集成与 e2e 跟到 dist/<空间> 下的新路径"
```

---

### Task 5: 文档跟上新布局

**Files:**
- Modify: `docs/guide/build.md`
- Modify: `docs/guide/framework-usage.md`
- Modify: `docs/workspaces/demo/hello-vue.md:21`、`docs/workspaces/demo/hello-react.md:21`
- Modify: `README.md`

- [ ] **Step 1: `docs/guide/build.md` 的路径表**

`docs/guide/build.md:10-17` 的表格改成：

```markdown
| 路径 | 用途 |
|---|---|
| `dist/<空间>/esm/*.js` | npm ESM 引入，无副作用，需显式调 `register()` |
| `dist/<空间>/esm/*/define.js` | npm ESM 引入，import 即注册 |
| `dist/cdn/<组件>.js` | CDN 单文件，运行时内联，import 即注册 |
| `dist/cdn/ew-all.js` | CDN 全量单文件 |
| `dist/<空间>/framework/vue.js`、`react.js` | 原生 Vue / React 组件，见下节 |
| `dist/element-plus.css` | 组件库样式，可选引入 |
```

- [ ] **Step 2: `docs/guide/build.md` 补一节产物布局**

在 `docs/guide/build.md:19`（「ESM 一次多入口构建…」那段）**之前**插入：

````markdown
`dist/` 按工作空间分目录，每个目录是一个独立包（`@ew/demo`、`@ew/self-monitor`），各带一份自己的 `package.json`：

```
dist/
├── cdn/                  根包 easywebcomp：URL 寻址 + ew-all 聚合
├── element-plus.css      根包：Element Plus 的全量样式，与空间无关
└── <空间>/
    ├── package.json      name 是 @ew/<空间>，依赖从产物反推
    ├── esm/              Web Component 形态
    └── framework/        Vue / React 原生组件形态
```

**依赖不手写。** 空间包的 `peerDependencies` 由构建扫 `framework/*.js` 里的裸说明符反推 —— 产物里那句 `import ... from "element-plus"` 就是证据。声明成 peer 而不是 dependency，是因为 `element-plus` / `pinia` / `vue` / `react` 一旦出现两份实例，宿主的配置与 hooks 就够不到组件里那一份。

`dist/cdn/` 与 `dist/element-plus.css` 留在根包：CDN 是 URL 寻址的，`ew-all.js` 按定义就是跨空间聚合；EP 样式是全量的，与空间无关。
````

- [ ] **Step 3: `docs/guide/build.md` 的 exports 说明与引入方式**

`docs/guide/build.md:21` 那段：

```markdown
构建结束会打印每个产物的 gzip 体积。`package.json` 的 `exports` 用 pattern 覆盖全部组件（`./*` → `dist/esm/*.js`、`./cdn/*` → `dist/cdn/*.js`），**不随组件增减而变动** —— 加组件只要重新构建，`package.json` 不会因此产生 diff。子路径是否真能解析到文件，由 `pnpm run check:artifacts` 兜底。
```

改成：

```markdown
构建结束会打印每个产物的 gzip 体积。空间包的 `exports` 用 pattern 覆盖本空间全部组件（`./*` → `./esm/*.js`、`./vue` / `./react` → `./framework/*.js`），**不随组件增减而变动** —— 加组件只要重新构建，那些 `package.json` 不会因此产生 diff。子路径是否真能解析到文件、产物里的裸导入是否都在 `peerDependencies` 里声明过，由 `pnpm run check:artifacts` 兜底。
```

`docs/guide/build.md:37` 的 ESM 示例：

```ts
import 'easy-webcomp/hello-vue/define'
```

改成：

```ts
import '@ew/demo/hello-vue/define'
```

- [ ] **Step 4: `docs/guide/build.md` 的框架产物一节**

`docs/guide/build.md:60-74` 改成：

````markdown
```ts
import { MyList } from '@ew/self-monitor/vue'
import 'easy-webcomp/element-plus.css'   // 宿主已经引了 Element Plus 就不用引
```

```tsx
import { MyList } from '@ew/self-monitor/react'
```

- `@ew/<空间>/vue` 只有该空间里 `Component.vue` 写的组件，`@ew/<空间>/react` 只有 `Component.tsx` 写的；某一侧没组件时那个子路径不存在。
- 事件按宿主框架的写法接：Vue 用 `@select`，React 用 `onSelect`。
- 组件样式随模块自动注入，不需要逐个引 css；未用到的组件会被 tree-shaking 摇掉。
- **Vue / React / Element Plus / Pinia 都不打进产物**，用的是宿主自己那份 —— 空间包把它们声明成 optional 的 peer，装了才有约束，没装不告警。
- 组件库样式（Element Plus）单独一个入口，宿主已有就不必引。
- 顶层挂载的那层 div 带 `class="ew-<组件名>-host"`，要对它设宽高就选这个类。
````

- [ ] **Step 5: `docs/guide/framework-usage.md` 的两段示例**

`docs/guide/framework-usage.md:9-11`：

```ts
import { MyList } from 'easy-webcomp/vue'
import 'easy-webcomp/element-plus.css'
import 'easy-webcomp/tokens.css'
```

改成：

```ts
import { MyList } from '@ew/self-monitor/vue'
import 'easy-webcomp/element-plus.css'
import 'easy-webcomp/tokens.css'
```

`:22-24`（React 那段）同理，`easy-webcomp/vue` → `@ew/self-monitor/vue` 对应改成 `easy-webcomp/react` → `@ew/self-monitor/react`。

同文件第 3 行那句「用框架产物比 Web Component 更顺手」保持不动。

- [ ] **Step 6: 组件文档页的 import**

`docs/workspaces/demo/hello-vue.md:21`：

```ts
import 'easy-webcomp/hello-vue/define'
```

改成：

```ts
import '@ew/demo/hello-vue/define'
```

`docs/workspaces/demo/hello-react.md:21` 同理：`easy-webcomp/hello-react/define` → `@ew/demo/hello-react/define`。

- [ ] **Step 7: `README.md`**

`README.md:100-105` 的表格改成：

```markdown
| 路径 | 用途 |
|---|---|
| `dist/<空间>/esm/*.js` | npm ESM 引入，无副作用，需显式调 `register()` |
| `dist/<空间>/esm/*/define.js` | npm ESM 引入，import 即注册 |
| `dist/cdn/<组件>.js` | CDN 单文件，运行时内联，import 即注册 |
| `dist/cdn/ew-all.js` | CDN 全量单文件 |
```

`README.md:109` 那段改成：

```markdown
构建结束会打印每个产物的 gzip 体积。`dist/` 按工作空间分目录，每个目录是一个独立包（`@ew/demo`、`@ew/self-monitor`），各带一份 `package.json`，依赖由构建从产物反推。`exports` 用 pattern 覆盖本空间全部组件，**不随组件增减而变动** —— 加组件只要重新构建，那些 `package.json` 不会因此产生 diff。子路径是否真能解析到文件，由 `pnpm run check:artifacts` 兜底。
```

`README.md:125` 的示例：

```ts
import 'easy-webcomp/hello-vue/define'
```

改成：

```ts
import '@ew/demo/hello-vue/define'
```

- [ ] **Step 8: 确认文档站还能建**

Run: `pnpm run docs:build`
Expected: 退出码 0。

- [ ] **Step 9: 提交**

```bash
git add README.md docs/guide/build.md docs/guide/framework-usage.md docs/workspaces/demo/hello-vue.md docs/workspaces/demo/hello-react.md
git commit -m "docs: 产物路径与用法按空间包改写"
```

---

### Task 6: 全量验证与体积基线重测

**Files:**
- Modify: `docs/guide/build.md`（体积基线表）

- [ ] **Step 1: 全量验证**

Run: `pnpm run verify`
Expected: 退出码 0，六段依次绿 —— `typecheck` → `test`（原有 162 加 Task 1 新增的 8 个，共 170）→ `build` → `check:artifacts`（两行「产物隔离正常」「exports 契约正常」）→ `check:framework`（7 个）→ `docs:build` → `test:e2e`（12 个）。原有的 162 若有出入，以「净增 8 个」为准。

若有失败，按顺序排查：`typecheck` 报 `workspace-packages.ts` 未使用变量 → 回 Task 2 Step 7 删掉多余的 import；`check:artifacts` 报 exports 找不到键 → 回 Task 3 Step 5。

- [ ] **Step 2: 记下新的体积**

Run: `pnpm run build 2>&1 | tail -30`
Expected: 打印所有产物的 gzip 体积。把 `dist/cdn/` 三个文件的数字抄下来。

- [ ] **Step 3: 重写基线表**

`docs/guide/build.md:76-86` 的「体积基线」一节。CDN 三行用 Step 2 抄到的真实数字替换（**不要照抄旧数字**，也不必照抄下面示例里的数字 —— 它只是格式示范）：

```markdown
## 体积基线

最近一次构建（gzip）——后续构建应与这张表对比，某个产物突然变大说明引入了未察觉的大依赖：

| 产物 | gzip |
|---|---|
| `dist/cdn/hello-vue.js` | 26.8 KB |
| `dist/cdn/hello-react.js` | 69.3 KB |
| `dist/cdn/ew-all.js` | 95.2 KB |

CDN 三份仍各自自带整套运行时（单文件可拷走是它的全部意义），体积与拆分前持平，是这次重构最直接的健康信号：数字没动，说明拆的只是目录与包边界。

ESM 与框架产物的体积随打包器与引入方式而定，不在基线对比范围内。但要留意两点：`dist/demo/framework/vue.js` 现在只含 `hello-vue`，`dist/self-monitor/framework/vue.js` 只含 `my-list`（仍引 Element Plus 与 Pinia）；ESM 侧原本全仓库共享的那份 Vue 运行时，现在每个空间包各带一份。
```

- [ ] **Step 4: 确认基线数字与旧表一致**

CDN 体积应当与拆分前**基本持平**（`hello-vue.js` 26.8 KB / `hello-react.js` 69.3 KB / `ew-all.js` 95.2 KB）。若某个 CDN 产物明显变大，说明 Task 2 改 `buildCdn` 时误伤了它 —— 回去确认 `buildCdn` 一行没动。

- [ ] **Step 5: 提交**

```bash
git add docs/guide/build.md
git commit -m "docs: 重测体积基线"
```

---

## 验证

全量：

```bash
pnpm run verify
```

另外两项人工确认：

1. **`git status` 里只有 `package.json` 是预期内的已修改。** 它是构建重写的 exports，按「给实施者的三条前提」第 1 条不提交。除它以外不该有未提交的改动。
2. **`dist/` 下没有残留的 `esm/` 与 `framework/` 顶层目录。** 全量 `build` 会先 `rmSync(dist)`，若它们还在，说明某一步走了 `--only`（`--only` 不清理 dist）。
