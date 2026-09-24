# 运行时全局配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 CDN / ESM / framework 三种产物一套统一的运行时全局配置，宿主在页面里设置一次 `baseURL` / `timeout` / `headers`，`my-list/api.ts` 的 axios 实例读它。

**Architecture:** 状态落在 `globalThis.__ew_config__` 这一个槽上 —— `@ew/runtime` 被内联进每一份产物，模块级变量在副本之间不通，全局槽是唯一能让它们共读共写的位置。读写面按消费场景分两种，读写同一个槽：ESM / framework 走 `@ew/<空间>/config` 子路径导入，CDN 引 `dist/cdn/config.js` 后调 `window.ewConfig({ … })`。`api.ts` 的优先级是「请求级 > 全局配置 > 组件兜底」。

**Tech Stack:** TypeScript、Vite（lib 模式，iife / es）、Vitest（jsdom）、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-24-ew-runtime-config-design.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `packages/runtime/src/config.ts`（新） | 槽位与 `configure` / `getConfig` / `resetConfig`。零依赖，是这一层唯一的实现 |
| `packages/runtime/src/index.ts` | 桶加三行 re-export（源码侧与测试从桶拿） |
| `packages/runtime/package.json` | 新增 `./config` 子路径 —— 生成的入口必须只带这一份，不能把桶整个拉进 `esm/config.js` |
| `scripts/declarations.ts` | `configDeclarationSource()`：产物里的 `.d.ts`，内联 `EwConfig`，不出现 `@ew/runtime` |
| `scripts/build.ts` | 两个生成入口（`config.ts` / `cdn-config.ts`）、ESM 多一个 entry 与 `config.d.ts`、CDN 多一次根级构建 |
| `scripts/check-artifacts.ts` | 三条守卫：声明清单、exports 规格、CDN 根级残留守卫为 `config.js` 开口子 |
| `packages/workspaces/self-monitor/components/my-list/api.ts` | 三项配置全挪进请求拦截器，请求时读 |
| `tests/runtime/config.test.ts`（新） | 槽的行为 + 子路径 |
| `tests/workspaces/self-monitor-api.test.ts`（新目录） | 假 adapter 断言最终发出的那份 config |
| `tests/scripts/declarations.test.ts` | `configDeclarationSource()` 的断言 |
| `tests/integration/consumer-types.test.ts` | 消费方视角：真跑一次 tsc，`@ew/self-monitor/config` 有类型 |
| `tests/e2e/fixture/config.html`（新）、`tests/e2e/config.spec.ts`（新） | 两份运行时副本共用一个槽的证据 |

**与本 spec 的一处偏离**：spec 写的是「`tests/e2e/fixture/index.html` 引 `/dist/cdn/config.js`」，实现改用**单独一页** `fixture/config.html`。`index.html` 是 CDN 冒烟用的组件注册页，往里面塞一个与组件无关的全局配置会把两件事绑在一起；单独一页还能干净地断言 `typeof window.ewConfig === 'function'`。

**不加的东西**（spec 已定）：空间包的 `package.json` exports 一个字不改（`./*` 已覆盖 `@ew/<空间>/config`）、framework 入口映射不加第三份、`@ew/utils` 与 root `package.json` 都不动。

---

## Task 1: config.ts —— 槽位与三个函数

**Files:**
- Create: `packages/runtime/src/config.ts`
- Modify: `packages/runtime/src/index.ts:16-16`（在 props 与 vue 两段之间插一组 re-export）
- Test: `tests/runtime/config.test.ts`

- [ ] **Step 1: 写会失败的测试**

创建 `tests/runtime/config.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { configure, getConfig, resetConfig, type EwConfig } from '@ew/runtime'

beforeEach(() => {
  resetConfig()
})

describe('configure / getConfig', () => {
  it('没配过时是空的', () => {
    expect(getConfig()).toEqual({})
  })

  it('顶层浅合并，后调的键压过前调的同名键', () => {
    configure({ baseURL: '/a' })
    configure({ timeout: 3_000 })
    expect(getConfig()).toEqual({ baseURL: '/a', timeout: 3_000 })
  })

  it('headers 整体替换，而不是逐键合并', () => {
    configure({ headers: { a: '1', b: '2' } })
    configure({ headers: { b: '9' } })
    expect(getConfig().headers).toEqual({ b: '9' })
  })

  it('undefined 的键不参与合并', () => {
    configure({ baseURL: '/a' })
    // 类型上就传不进来（exactOptionalPropertyTypes 下可选键只能是缺席），
    // 这里绕过类型测的是运行时那条 if —— CDN 侧没有类型挡着，写的是裸 JS。
    configure({ baseURL: undefined } as unknown as EwConfig)
    expect(getConfig().baseURL).toBe('/a')
  })
})

describe('getConfig 返的是副本', () => {
  it('改返回值不动存储，headers 也是', () => {
    configure({ baseURL: '/a', headers: { a: '1' } })
    const got = getConfig()
    got.baseURL = '/changed'
    got.headers!.a = 'changed'
    expect(getConfig()).toEqual({ baseURL: '/a', headers: { a: '1' } })
  })
})

describe('全局槽', () => {
  it('直接读写 globalThis.__ew_config__ 能被 getConfig 看见', () => {
    // 「多副本共享」在单测里唯一能表达的形式：另一个副本写的就是这个槽
    ;(globalThis as unknown as { __ew_config__?: unknown }).__ew_config__ = { baseURL: '/from-other' }
    expect(getConfig().baseURL).toBe('/from-other')
  })

  it('resetConfig 之后又回到空的', () => {
    configure({ baseURL: '/a' })
    resetConfig()
    expect(getConfig()).toEqual({})
  })
})
```

- [ ] **Step 2: 跑测试确认它红**

Run: `pnpm exec vitest run tests/runtime/config.test.ts`
Expected: FAIL —— `configure is not a function`（或 `@ew/runtime` 没有这些导出）。

- [ ] **Step 3: 实现**

创建 `packages/runtime/src/config.ts`：

```ts
/**
 * 运行时全局配置：槽位与读写。
 *
 * **状态落在 globalThis 上，不是模块级变量。** @ew/runtime 被内联进每一份产物 ——
 * CDN 的单组件、CDN 的空间入口、ESM、framework 各含一份 —— 一个页面里同时引 CDN 的
 * my-list 与 ESM 的 demo，就是两份互不相识的运行时。模块级变量在这些副本之间不通，
 * 全局槽是唯一能让它们共读共写的位置。
 *
 * 槽名用字符串而不是 Symbol：devtools 里要看得见，排查时能直接敲出来。
 */

export interface EwConfig {
  baseURL?: string
  timeout?: number
  headers?: Record<string, string>
}

/** 与 globalThis 取交集：直接断言成一个光秃秃的形状，TS 会嫌两边不重叠 */
type EwConfigGlobal = typeof globalThis & { __ew_config__?: EwConfig }

function store(): EwConfig {
  const g = globalThis as EwConfigGlobal
  return (g.__ew_config__ ??= {})
}

/**
 * 顶层浅合并，返回合并后的快照。晚调也生效 —— 消费方是请求时读的。
 *
 * 逐个键写而不是遍历 patch 的键：`next[key] = patch[key]` 在 key 是联合类型时过不了
 * 类型检查（写入要求值同时满足三个键的值类型）。三行也更直白。
 *
 * `undefined` 的键不参与合并，所以没法用 `configure({ baseURL: undefined })` 清掉一项；
 * 要清就 `resetConfig()` 重来。
 */
export function configure(patch: EwConfig): EwConfig {
  const next = store()
  if (patch.baseURL !== undefined) next.baseURL = patch.baseURL
  if (patch.timeout !== undefined) next.timeout = patch.timeout
  if (patch.headers !== undefined) next.headers = patch.headers
  return getConfig()
}

/**
 * 返回副本，改它不影响存储。headers 是这里唯一的容器，所以要单独再拷一层 ——
 * 少了它，`getConfig().headers['x'] = 'y'` 会直接写进存储。
 */
export function getConfig(): EwConfig {
  const next = store()
  return next.headers === undefined
    ? { ...next }
    : { ...next, headers: { ...next.headers } }
}

/** 仅供测试使用，清空全局配置，照 resetRegistry / resetStyleCache 的先例 */
export function resetConfig(): void {
  delete (globalThis as EwConfigGlobal).__ew_config__
}
```

- [ ] **Step 4: 挂到桶上**

`packages/runtime/src/index.ts`，在 `export { defineComponentMeta } from './types.ts'`（第 16 行）之后、`export type { … } from './types.ts'` 那段类型导出之后插入：

```ts
export { configure, getConfig, resetConfig } from './config.ts'
export type { EwConfig } from './config.ts'
```

（位置在 `export type { … } from './types.ts'` 与 `export { vueAdapter, … }` 之间即可。）

- [ ] **Step 5: 跑测试确认它绿**

Run: `pnpm exec vitest run tests/runtime/config.test.ts`
Expected: PASS，8 条全过。

- [ ] **Step 6: 提交**

```bash
git add packages/runtime/src/config.ts packages/runtime/src/index.ts tests/runtime/config.test.ts
git commit -m "feat(runtime): 全局配置的槽位与 configure / getConfig / resetConfig"
```

---

## Task 2: `@ew/runtime/config` 子路径

**Files:**
- Modify: `packages/runtime/package.json:8-13`
- Test: `tests/runtime/config.test.ts`（追加一组）

**为什么要这一步**：生成的 `esm/config.js` 与 `dist/cdn/config.js` 都要从 `@ew/runtime/config` 导入。若从桶导入，Rollup 会把 element / style / registry 与 vue、react 两个适配器一并拉进 CDN 那个 IIFE —— 那个文件本该只有几百字节。

- [ ] **Step 1: 追加会失败的测试**

在 `tests/runtime/config.test.ts` 末尾追加：

```ts
describe('@ew/runtime/config 子路径', () => {
  it('与桶是同一份实现，写的是同一个槽', async () => {
    const subpath = await import('@ew/runtime/config')
    subpath.configure({ baseURL: '/via-subpath' })
    expect(getConfig().baseURL).toBe('/via-subpath')
  })
})
```

- [ ] **Step 2: 跑测试确认它红**

Run: `pnpm exec vitest run tests/runtime/config.test.ts`
Expected: FAIL —— 解析不到 `@ew/runtime/config`（`Failed to resolve import`）。

- [ ] **Step 3: 加 exports 子路径**

`packages/runtime/package.json` 的 `exports` 改成：

```json
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./config": {
      "types": "./src/config.ts",
      "default": "./src/config.ts"
    }
  },
```

- [ ] **Step 4: 跑测试确认它绿**

Run: `pnpm exec vitest run tests/runtime/config.test.ts`
Expected: PASS，9 条全过。

- [ ] **Step 5: 提交**

```bash
git add packages/runtime/package.json tests/runtime/config.test.ts
git commit -m "feat(runtime): 加 @ew/runtime/config 子路径，生成的入口只带这一份"
```

---

## Task 3: `configDeclarationSource()`

**Files:**
- Modify: `scripts/declarations.ts`（末尾追加一个函数）
- Test: `tests/scripts/declarations.test.ts`（追加一组 describe）

**为什么不从源码图生成**：产物里的声明**一个字都不能引 `@ew/runtime`** —— 那个包 private、不发，消费方解析不到。与其他声明一样，形状就地内联。

- [ ] **Step 1: 写会失败的测试**

在 `tests/scripts/declarations.test.ts` 顶部把 `configDeclarationSource` 加进那个 import，然后追加：

```ts
describe('configDeclarationSource', () => {
  it('就地内联 EwConfig，两个函数的签名与运行时一致', () => {
    const dts = configDeclarationSource()
    expect(dts).toContain('export interface EwConfig {')
    expect(dts).toContain('baseURL?: string')
    expect(dts).toContain('timeout?: number')
    expect(dts).toContain('headers?: Record<string, string>')
    expect(dts).toContain('export declare function configure(patch: EwConfig): EwConfig')
    expect(dts).toContain('export declare function getConfig(): EwConfig')
  })

  it('不引 @ew/runtime —— 那个包 private、不发，消费方解析不到', () => {
    expect(configDeclarationSource()).not.toContain('@ew/runtime')
  })
})
```

- [ ] **Step 2: 跑测试确认它红**

Run: `pnpm exec vitest run tests/scripts/declarations.test.ts`
Expected: FAIL —— `configDeclarationSource` 不是函数。

- [ ] **Step 3: 实现**

`scripts/declarations.ts` 末尾追加：

```ts
/**
 * 配置入口的声明。与 wcDeclarationSource 同理，**不许出现 `@ew/runtime`** ——
 * `EwConfig` 的形状照上面 RUNTIME_TYPES 的做法就地写一份。
 *
 * 只声明 configure / getConfig：生成的入口就导这两个，`resetConfig` 是测试专用的，
 * 不在产物的 API 面上。
 */
export function configDeclarationSource(): string {
  return `export interface EwConfig {
  baseURL?: string
  timeout?: number
  headers?: Record<string, string>
}

export declare function configure(patch: EwConfig): EwConfig
export declare function getConfig(): EwConfig
`
}
```

- [ ] **Step 4: 跑测试确认它绿**

Run: `pnpm exec vitest run tests/scripts/declarations.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/declarations.ts tests/scripts/declarations.test.ts
git commit -m "feat(build): 配置入口的声明生成，类型就地内联"
```

---

## Task 4: 构建接线 —— 两个生成入口、ESM 的 config、CDN 的 config

**Files:**
- Modify: `scripts/build.ts:22-26`（import）、`scripts/build.ts:169-218`（`writeGeneratedEntries`）、`scripts/build.ts:242-283`（`buildEsm`）、`scripts/build.ts:293-352`（`buildCdn`）

- [ ] **Step 1: import 加上新函数**

`scripts/build.ts` 里那段 `from './declarations.ts'` 的 import 改成：

```ts
import {
  barrelDeclarationSource,
  configDeclarationSource,
  frameworkDeclarationSource,
  wcDeclarationSource,
} from './declarations.ts'
```

- [ ] **Step 2: 生成两个入口文件**

`writeGeneratedEntries` 末尾（`framework` 桶那个 for 循环之后、函数收尾之前）追加：

```ts
  // 配置入口。**不分空间** —— 内容逐字相同，按空间生成几个副本纯属多余，
  // 也与「配置是页面级一份」的结论自相矛盾。
  writeFileSync(
    join(generatedDir, 'config.ts'),
    "export { configure, getConfig } from '@ew/runtime/config'\n",
  )
  // CDN 那份只出一个 default：IIFE 的 name 会变成全局名，入口多一个具名导出，
  // Rollup 就改成把整个 exports 对象挂上去，window.ewConfig 便不再是函数。
  writeFileSync(
    join(generatedDir, 'cdn-config.ts'),
    "export { configure as default } from '@ew/runtime/config'\n",
  )
```

- [ ] **Step 3: ESM 多一个 entry 与一份声明**

`buildEsm` 里 entry 那张表改成：

```ts
    const entry: Record<string, string> = {
      index: join(generatedDir, `all-${workspace}.ts`),
      // 每个空间各出一份，只为让 `@ew/<空间>/config` 落在各自的包里（见 spec「三种产物的入口」）
      config: join(generatedDir, 'config.ts'),
    }
```

同一个函数里，组件声明那个 for 循环之后追加：

```ts
    writeFileSync(join(outDir, 'config.d.ts'), configDeclarationSource())
```

- [ ] **Step 4: CDN 多一次根级构建**

`buildCdn` 里，按空间构建那个 for 循环**之后**（函数收尾之前）追加：

```ts
  // 根级配置入口。与空间无关，所以落在 dist/cdn/ 根上 —— checkCdn 的残留守卫为它开了一个口子。
  //
  // 必须排在函数开头那次 rmSync(dist/cdn) 之后：那句清的是整棵 CDN 树，放前面会被自己清掉。
  //
  // emptyOutDir 必须是 false：outDir 是 dist/cdn，而空间目录就在它下面，交给 Vite 清空
  // 会把刚构建好的产物一起抹掉。
  //
  // name 取 ewConfig + 入口只出一个 default：Rollup 于是 emit `var ewConfig = (…)()`，
  // 顶层 var 在 <script> 里就是 window.ewConfig。
  await build({
    root,
    configFile: false,
    define: cdnDefine,
    resolve: { alias: vueAlias },
    css: cssConfig,
    plugins: sharedPlugins(),
    build: {
      target: 'es2020',
      outDir: 'dist/cdn',
      emptyOutDir: false,
      minify: 'esbuild',
      lib: {
        entry: join(generatedDir, 'cdn-config.ts'),
        formats: ['iife'],
        name: 'ewConfig',
        fileName: () => 'config.js',
      },
    },
  })
```

- [ ] **Step 5: 构建并肉眼验收**

Run: `pnpm run build`
Expected: 完成，无报错。

```bash
ls -l dist/cdn/config.js dist/demo/esm/config.js dist/demo/esm/config.d.ts
grep -c "ewConfig" dist/cdn/config.js
grep -n "@ew/runtime" dist/demo/esm/config.js
wc -c dist/cdn/config.js dist/demo/esm/config.js dist/demo/esm/config.d.ts
```

Expected:
- 三个文件都在；
- `ewConfig` 在 `dist/cdn/config.js` 里至少出现 1 次；
- `grep -n "@ew/runtime" dist/demo/esm/config.js` **没有输出**（自包含，没有裸说明符 —— e2e 那页靠这条）；
- `dist/cdn/config.js` 只有几百字节（桶没被拉进来）。

- [ ] **Step 6: 确认 CDN 配置入口真被挂成函数**

Run:

```bash
node -e "
const src = require('node:fs').readFileSync('dist/cdn/config.js','utf8')
console.log(src.trim().slice(0, 80))
console.log('has global name:', /var ewConfig\s*=/.test(src))
"
```

Expected: 打印的开头形如 `var ewConfig=(()=>{…})();`，且 `has global name: true`。

- [ ] **Step 7: 提交**

```bash
git add scripts/build.ts
git commit -m "feat(build): 三种产物各出一份配置入口，CDN 的挂在 window.ewConfig"
```

---

## Task 5: 三条守卫

**Files:**
- Modify: `scripts/check-artifacts.ts:261-267`（声明清单）、`scripts/check-artifacts.ts:344-353`（根包规格）、`scripts/check-artifacts.ts:361-371`（空间规格）、`scripts/check-artifacts.ts:395-401`（CDN 残留守卫）

**背景**：`checkCdn` 开头那条残留守卫现在的判据是「`dist/cdn` 下只许有目录」，而 Task 4 往根上放了 `config.js` —— **不放行，`check:artifacts` 必红**。

- [ ] **Step 1: 声明清单加上 config.d.ts**

`checkDeclarations` 里 `expected` 那张表改成：

```ts
    const expected = [
      'esm/index.d.ts',
      // 空间包没有 config 的 exports 键（靠 `./*` 覆盖），而 `./*` 那条 types 含 `*`、
      // 会被下面那个 exports 循环跳过 —— 这份清单是 config.d.ts 唯一的守卫。
      'esm/config.d.ts',
      ...mine.map((c) => `esm/${c.name}.d.ts`),
      ...(['vue', 'react'] as const)
        .filter((framework) => mine.some((c) => c.inFramework && c.framework === framework))
        .map((framework) => `framework/${framework}.d.ts`),
    ]
```

- [ ] **Step 2: exports 规格两处**

`checkExports` 里根包那份 spec 清单加上 CDN 配置入口：

```ts
    [
      `${PKG}/tokens.css`,
      `${PKG}/element-plus.css`,
      `${PKG}/cdn/config`,
      ...components.map((c) => `${PKG}/cdn/${c.workspace}/${c.name}`),
      ...[...new Set(components.map((c) => c.workspace))].map((w) => `${PKG}/cdn/${w}/index`),
    ],
```

空间规格那份加上 config：

```ts
    const specs = [
      `@ew/${workspace}`,
      `@ew/${workspace}/config`,
      ...mine.flatMap((c) => [`@ew/${workspace}/${c.name}`, `@ew/${workspace}/${c.name}/define`]),
```

（其余不动。）

- [ ] **Step 3: 残留守卫放行并必查 config.js**

`checkCdn` 开头那两行改成：

```ts
  // 残留守卫：跨空间的 ew-all 与被平铺到 dist/cdn 根下的文件都不该存在了。
  // 例外只有一个：根级配置入口 —— 它与空间无关，本来就该落在这里。
  for (const entry of readdirSync(cdnDir)) {
    if (entry === 'config.js') continue
    if (!statSync(join(cdnDir, entry)).isDirectory()) {
      failures.push(`dist/cdn/${entry} 不该存在 —— CDN 产物一律落在 dist/cdn/<空间>/ 下`)
    }
  }
  // 放行的那一个得真在：只有上面那条的话，漏构建会被静默放过
  if (!existsSync(join(cdnDir, 'config.js'))) {
    failures.push('缺少 CDN 配置入口 dist/cdn/config.js')
  }
```

- [ ] **Step 4: 守卫全绿**

Run: `pnpm run check:artifacts`
Expected: 无输出（脚本没有任何失败时静默通过）。

- [ ] **Step 5: 证明「少了它守卫会说话」**

把产物临时挪开，确认守卫真的报出来，再挪回来：

```bash
mv dist/cdn/config.js /tmp/ew-config.js && pnpm run check:artifacts; mv /tmp/ew-config.js dist/cdn/config.js
```

Expected: 输出里出现 `缺少 CDN 配置入口 dist/cdn/config.js`（脚本以非 0 退出）。

万一 `/tmp/ew-config.js` 已经存在，用别的临时名；挪回来之后 `ls dist/cdn/config.js` 确认文件在。

- [ ] **Step 6: 提交**

```bash
git add scripts/check-artifacts.ts
git commit -m "feat(check): 守卫认下三种产物的配置入口"
```

---

## Task 6: api.ts 接线

**Files:**
- Modify: `packages/workspaces/self-monitor/components/my-list/api.ts:1-24`
- Test: `tests/workspaces/self-monitor-api.test.ts`（新目录 + 新文件）

**为什么要动 `axios.create()`**：三项都不写进 `create()`，兜底挪进拦截器。写在那儿的话，拦截器读到的 `baseURL` 永远非空，「调用方设了」与「实例默认」分不开，全局配置也就永远轮不到。

- [ ] **Step 1: 写会失败的测试**

创建 `tests/workspaces/self-monitor-api.test.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { configure, resetConfig } from '@ew/runtime/config'
import { http } from '../../packages/workspaces/self-monitor/components/my-list/api'

/**
 * 假 adapter 截住**最终真正发出**的那份 config —— 拦截器跑完之后的样子。
 * 这里不 import axios 的类型：axios 只是 self-monitor 那个包的依赖，没装在仓库根上，
 * 从这里 import 解析不到，所以就地描一个够用的形状。
 */
interface SentConfig {
  baseURL?: string | undefined
  timeout?: number | undefined
  headers: { get(name: string): unknown }
}

let sent: SentConfig | undefined

beforeEach(() => {
  resetConfig()
  sent = undefined
  http.defaults.adapter = async (config) => {
    sent = config
    return { data: null, status: 200, statusText: 'OK', headers: {}, config }
  }
})

describe('my-list http 的配置优先级（请求级 > 全局配置 > 组件兜底）', () => {
  it('没有全局配置时落回 /api 与 15 秒', async () => {
    await http.get('/x')
    expect(sent!.baseURL).toBe('/api')
    expect(sent!.timeout).toBe(15_000)
  })

  it('全局配置压过组件兜底', async () => {
    configure({ baseURL: 'https://api.example.com', timeout: 3_000 })
    await http.get('/x')
    expect(sent!.baseURL).toBe('https://api.example.com')
    expect(sent!.timeout).toBe(3_000)
  })

  it('请求级压过全局配置', async () => {
    configure({ baseURL: 'https://api.example.com', timeout: 3_000 })
    await http.get('/x', { baseURL: '/request', timeout: 1_000 })
    expect(sent!.baseURL).toBe('/request')
    expect(sent!.timeout).toBe(1_000)
  })

  it('请求级 timeout: 0 当作「没设」—— axios 里它意味着不限时', async () => {
    configure({ timeout: 3_000 })
    await http.get('/x', { timeout: 0 })
    expect(sent!.timeout).toBe(3_000)
  })

  it('全局 headers 只补请求上没有的键', async () => {
    configure({ headers: { 'x-tenant': 'a', 'x-trace': 'global' } })
    await http.get('/x', { headers: { 'x-trace': 'request' } })
    expect(sent!.headers.get('x-tenant')).toBe('a')
    expect(sent!.headers.get('x-trace')).toBe('request')
  })

  it('晚调 configure 也生效 —— 拦截器是请求时读的', async () => {
    await http.get('/x')
    expect(sent!.baseURL).toBe('/api')
    configure({ baseURL: 'https://late.example.com' })
    await http.get('/x')
    expect(sent!.baseURL).toBe('https://late.example.com')
  })
})
```

- [ ] **Step 2: 跑测试确认它红**

Run: `pnpm exec vitest run tests/workspaces/self-monitor-api.test.ts`
Expected: 至少 4 条 FAIL —— 现在 `create()` 里写死了 `/api` 与 15 秒，全局配置轮不到；headers 那条也补不上。

- [ ] **Step 3: 改 api.ts**

`packages/workspaces/self-monitor/components/my-list/api.ts` 顶部那段改成：

```ts
import axios, { type AxiosInstance } from 'axios'
import { getConfig } from '@ew/runtime/config'

/**
 * 组件内共用的 axios 实例。拦截器是这层存在的理由：鉴权头、traceId、统一错误提示
 * 都往这里加，组件里只管发请求。
 *
 * **三项都不写在这份 create() 里。** 请求级、全局配置、组件兜底是三层，只有把兜底挪进
 * 拦截器才分得清「调用方设了」与「实例默认」—— 写在这儿的话，拦截器读到的 baseURL 永远
 * 非空，全局配置永远轮不到。
 */
export const http: AxiosInstance = axios.create()

// 请求时读而不是创建时读，所以晚调 configure() 也生效，
// 也不要求宿主赶在组件加载之前配置。
http.interceptors.request.use((config) => {
  const ew = getConfig()

  config.baseURL ??= ew.baseURL ?? '/api'
  // 用假值判定而不是 undefined：axios 里 timeout: 0 意味着「不限时」，当作「没设」才对
  if (!config.timeout) config.timeout = ew.timeout ?? 15_000
  for (const [key, value] of Object.entries(ew.headers ?? {})) {
    if (!config.headers.has(key)) config.headers.set(key, value)
  }

  return config
})
```

后面那两段 `http.interceptors.response.use(...)` 与所有 MOCK 内容原样保留，一个字不动。

- [ ] **Step 4: 跑测试确认它绿**

Run: `pnpm exec vitest run tests/workspaces/self-monitor-api.test.ts`
Expected: PASS，6 条全过。

- [ ] **Step 5: 提交**

```bash
git add packages/workspaces/self-monitor/components/my-list/api.ts tests/workspaces/self-monitor-api.test.ts
git commit -m "feat(self-monitor): my-list 的 axios 实例读全局配置，请求级 > 全局 > 兜底"
```

---

## Task 7: 消费方视角的类型检查

**Files:**
- Modify: `tests/integration/consumer-types.test.ts:20-55`（那个 `CONSUMER` 模板）

**为什么放这儿**：这条用例真跑一次 tsc，走的是**真实解析路径**（读空间包的 package.json、按 exports 的 types 条件找声明）。配置入口的声明是手写模板，只有它会红。

- [ ] **Step 1: 给 CONSUMER 加配置的消费**

`tests/integration/consumer-types.test.ts` 里 `CONSUMER` 模板的 import 段加上一行：

```ts
import { configure, getConfig, type EwConfig } from '@ew/self-monitor/config'
```

`export const used = [...]` 之前加上：

```ts
// 配置入口：类型与函数都要拿得到，退化成 any 这条就红
const config: EwConfig = {
  baseURL: 'https://api.example.com',
  timeout: 3_000,
  headers: { 'x-tenant': 'a' },
}
configure(config)
const readBack: EwConfig = getConfig()
```

并把 `readBack` 加进 `used` 数组。

- [ ] **Step 2: 跑（需要先构建）**

Run: `pnpm run build && pnpm run check:framework`
Expected: PASS。

- [ ] **Step 3: 证明它真在测东西**

临时把 `dist/self-monitor/esm/config.d.ts` 挪走，确认这条用例红：

```bash
mv dist/self-monitor/esm/config.d.ts /tmp/ew-config.d.ts && pnpm run check:framework; mv /tmp/ew-config.d.ts dist/self-monitor/esm/config.d.ts
```

Expected: 出现 `Cannot find module '@ew/self-monitor/config'` 一类的 TS2307。挪回来后重跑一次确认又是绿的。

- [ ] **Step 4: 提交**

```bash
git add tests/integration/consumer-types.test.ts
git commit -m "test(integration): 消费方视角盯住配置入口的声明"
```

---

## Task 8: e2e —— 两份副本共用一个槽

**Files:**
- Create: `tests/e2e/fixture/config.html`
- Create: `tests/e2e/config.spec.ts`

**这条钉住的是本设计的核心论断**：CDN 那份（`<script>` 挂的 `window.ewConfig`）写、ESM 那份（另一个副本）读，读到同一个值。

- [ ] **Step 1: 建 fixture 页**

创建 `tests/e2e/fixture/config.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>EW 全局配置</title>
  </head>
  <body>
    <!-- 只引配置入口，不引任何组件：这一页要验的是「两份运行时副本共用一个槽」 -->
    <script src="/dist/cdn/config.js"></script>
  </body>
</html>
```

- [ ] **Step 2: 写用例**

创建 `tests/e2e/config.spec.ts`：

```ts
import { expect, test } from '@playwright/test'

const FIXTURE = '/tests/e2e/fixture/config.html'

/**
 * 一次页面里两份互不相识的运行时副本：CDN 那份（<script> 挂的 window.ewConfig）
 * 与 ESM 那份（动态 import 的 dist/demo/esm/config.js）。@ew/runtime 被内联进每一份产物，
 * 模块级变量在副本之间不通 —— 配置的状态必须落在 globalThis 的同一个槽上，这条就是证据。
 */
test('全局配置：CDN 那份写、ESM 那份读，读到同一个值', async ({ page }) => {
  await page.goto(FIXTURE)

  const wrote = await page.evaluate(() => {
    const ewConfig = (window as unknown as { ewConfig?: unknown }).ewConfig
    if (typeof ewConfig !== 'function') return false
    ;(ewConfig as (patch: unknown) => unknown)({
      baseURL: 'https://api.example.com',
      timeout: 3_000,
    })
    return true
  })
  expect(wrote).toBe(true)

  const read = await page.evaluate(async () => {
    // 说明符写成变量：字符串字面量的动态 import 会被 tsc 当成本地路径去解析，这里要的是
    // 浏览器按 URL 去取 —— 那条路正是消费方的真实处境。
    const url = '/dist/demo/esm/config.js'
    const mod = (await import(url)) as { getConfig: () => unknown }
    return mod.getConfig()
  })

  expect(read).toEqual({ baseURL: 'https://api.example.com', timeout: 3_000 })
})
```

- [ ] **Step 3: 跑**

Run: `pnpm exec playwright test tests/e2e/config.spec.ts`
Expected: 1 passed。

（**不要**用 `pnpm run test:e2e -- tests/e2e/config.spec.ts`：那个脚本是裸 `playwright test`，会把路径参数吃掉、跑成整个 `tests/e2e` 目录。）

- [ ] **Step 4: 提交**

```bash
git add tests/e2e/fixture/config.html tests/e2e/config.spec.ts
git commit -m "test(e2e): CDN 与 ESM 两份运行时副本共用一个配置槽"
```

---

## Task 9: 全量验证

- [ ] **Step 1: 分步跑完五段 + e2e**

```bash
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run check:artifacts
pnpm run check:framework
pnpm exec playwright test
```

Expected: 全部通过。

**不要把 `pnpm run verify` 当门槛** —— 它在 `docs:build` 那段会停在一个既有的 lodash 具名导入问题上（`packages/workspaces/self-monitor/components/my-list/Component.vue:30`），与本次改动无关，用户已明确决定先不动。

- [ ] **Step 2: 肉眼过一遍文档站与调试页**

```bash
pnpm run docs:dev
```

Expected: my-list 页面照常渲染、表格有数据（`fetchMyList` 仍是 mock，没有真请求）。

- [ ] **Step 3: 提交（若有遗留改动）**

```bash
git status --short
```

---

## 自查记录

- **spec 覆盖**：契约 → Task 1；三种产物的入口 → Task 2/4；api.ts 优先级 → Task 6；接线与守卫 → Task 3/4/5；测试 → Task 1/3/6/7/8；破坏性变更（无）→ 不需要任务。
- **与本 spec 的偏离**：e2e 改用独立的 `fixture/config.html`（理由见「文件结构」）。
- **命名一致性**：`configure` / `getConfig` / `resetConfig` / `EwConfig` / `__ew_config__` / `ewConfig` / `configDeclarationSource` 在全文与 spec 里同名同形。
