# easy-webcomp 包化（`@ew/runtime` / `@ew/utils`）设计文档

## 1. 一句话定义

把 `src/runtime/` 拆成 pnpm workspace 包 `packages/runtime`（`@ew/runtime`）与 `packages/utils`（`@ew/utils`），组件里的 `../../../../runtime/vue` 一律换成包名引入：`import { createElementClass, registerElement, vueAdapter } from '@ew/runtime'`。

**这是纯粹的组织形式变更，交付契约一个字节都不动。**

## 2. 背景与动机

组件目录在 `src/workspaces/<ws>/components/<name>/`，到 `src/runtime/` 正好是四个 `..`。这个深度是**结构性**的，不是偶然：只要组件还是「空间 / components / 组件名」三层，相对路径就永远是 `../../../../`。它带来三个具体问题：

1. **组件源码不可移植**。把组件目录挪一层、或将来允许空间嵌套，所有 import 同时失效。
2. **脚手架得靠字符串拼接**。`scripts/new-component.ts` 里有个 `RUNTIME = '../../../../runtime'` 常量，模板把它插进生成代码；改深度要同时改模板、测试期望、以及两个 demo 组件。
3. **`toIdentifier` 的规则散在三个消费方**（构建期、脚手架、文档站插件）。上一轮已经把它收敛到 `src/runtime/naming.ts` 单点定义，但位置仍在浏览器运行时目录里 —— `scripts/build.ts` 这类构建脚本 import 一个含 `extends HTMLElement` 的包，边界是错的。

用户于 2026-09-22 提出改用 pnpm monorepo 的 workspace 包引入。

## 3. 非目标（YAGNI）

- **不 externalize**。`@ew/runtime` 仍被内联进每个组件产物，消费者不需要单独安装它。见第 5 节。
- **不产出 dist**。packages 是源码包，没有自己的 build 步骤。见第 5 节。
- **不搬 `src/workspaces/`**。组件是产物不是依赖；搬它要同步改文档站 glob 深度、构建发现路径、脚手架落盘路径、每个组件的相对路径，收益为零。
- **不动 `src/tokens/`**。`exports['./tokens.css']` 指向 `./src/tokens/tokens.css` 不变。
- **不改 tag、`exports` 键、CDN 文件名、`--ew-*` 变量名**。
- **不给 packages 单独发版**。没有 registry，没有 version 语义，`workspace:*` 即可。
- **不引入 `vite-tsconfig-paths` 或 paths 别名兜底**。四个消费方都走真实包解析；哪一方解析不了，就地修那一方，不加第二套解析规则。
- **不做包级别的测试目录**。`tests/` 仍在仓库根，只改 import 说明符。

## 4. 目录结构与包身份

```
packages/
├── utils/
│   ├── package.json          @ew/utils
│   └── src/
│       ├── naming.ts         toIdentifier（自 src/runtime/naming.ts 迁入）
│       └── index.ts          桶
└── runtime/
    ├── package.json          @ew/runtime
    └── src/
        ├── element.ts        createElementClass
        ├── registry.ts       registerElement / resetRegistry
        ├── style.ts          applyStyles / resetStyleCache
        ├── props.ts          attrNameFor / coerceAttr / isAttributeChannel
        ├── types.ts          defineComponentMeta + 类型
        ├── vue.ts            vueAdapter / useVueEmit / EW_EMIT_KEY
        ├── react.ts          reactAdapter / useReactEmit / EwEmitContext
        └── index.ts          桶（手写具名 re-export）
src/
├── workspaces/               组件（原地不动）
├── tokens/
├── .generated/
└── env.d.ts                  *.vue shim + virtual:ew-wc-index 声明
```

依赖方向：根 `src/workspaces/**` → `@ew/runtime`；`scripts/**` 与 `docs/.vitepress/plugins/**` → `@ew/utils`。
**`@ew/runtime` 不依赖 `@ew/utils`** —— 运行时代码没有用到 `toIdentifier`。两者是兄弟，不是父子。

`pnpm-workspace.yaml` 目前**没有 `packages:` 字段**（所以此刻还不是 workspace），需要新增；`allowBuilds` 原样保留。

## 5. 两个包级决定

### 5.1 打包语义：内联，不 externalize

组件产物必须继续自带 runtime：

- **CDN 的 IIFE 没有模块解析**。`<script src=".../hello-vue.js">` 里没有 import 可言，runtime 只能内联。externalize 对 CDN 完全不可行。
- **现状已经如此**。`react-dom` 是根 `dependencies`，而 `dist/cdn/hello-react.js` 里 `react-dom` 出现 1 次 —— 依赖就是被内联的。`dist/esm/*` 之间共享 chunk，也不 externalize。
- externalize 会给消费者加「装一个包 + 版本对齐」的负担，而这个项目的卖点是「一个 script 标签就能用」。

因此 `@ew/runtime` 在根 `package.json` 里是 **`devDependencies`**：它是构建期依赖，装出来的包不需要它。

### 5.2 包形态：源码包，无 dist

`packages/*/package.json` 形如：

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
  }
}
```

- `exports` 直接指向 `.ts`。tsx、Vite、vue-tsc（`moduleResolution: bundler`）都能直接吃 TS 源码，省掉每包一个构建步骤，也省掉「包必须先 build 才能被 `build:esm` 引用」的顺序耦合。
- `sideEffects: false` 是**功能性**的，不是优化标记：桶文件同时 re-export `vueAdapter` 与 `reactAdapter`，Rollup 必须能摇掉用不到的那一支，否则 Vue 产物会被 react-dom 撑大（见第 10 节守卫）。
- `peerDependencies` 声明 `vue: ^3.5.0`、`react: ^19.0.0`、`react-dom: ^19.0.0`，后两者 `optional`；同时在 `devDependencies` 声明同范围版本供本包自身类型检查。范围与根一致，pnpm 解析到同一 store 条目，不会出现两份 Vue 实例。
- **包内相对 import 一律带 `.ts` 后缀**，tsconfig 开 `allowImportingTsExtensions`。实施 Task 1 时实测发现：Vite 加载配置文件会**外置**裸 import 交给 Node 原生 ESM，而 Node 对相对说明符要求显式扩展名 —— `@ew/utils` 经 `wc-mode.ts` 被这样解析，`'./naming'` 会直接 `Cannot find module`。`@ew/runtime` 今天只被 Vite 处理的代码消费，理论上不带后缀也能跑，但那样这条规则只对一半的包成立，且各模块内部的相对 import 同样会炸 —— 只给桶补后缀是假安全。所以两个包统一。

## 6. `@ew/runtime` 的公开面

桶文件手写具名 re-export（不用 `export *`）：它就是这个包对外的 API 面，写清楚比通配更可控，也避免将来新增导出意外变成公开 API。

**唯一一处改名，是硬约束逼的。** `vue.ts` 与 `react.ts` 都导出 `useEmit`，而这个函数在两边的**实现不同**（`inject` vs `useContext`），没法合并成一件事。ESM 语义下两个同名 `export *` 会让该名字被静默排除 —— 即 `import { useEmit } from '@ew/runtime'` 报「没有这个导出」，而不是报冲突。所以：

| 现在 | 之后 |
|---|---|
| `useEmit`（vue.ts） | `useVueEmit` |
| `useEmit`（react.ts） | `useReactEmit` |

在**源码里**改名（而非桶里 `as` 别名），保证一个概念只有一个可 grep 的名字。

`EmitFn` **不改名**：它在两个文件里的定义逐字相同（`(name: string, detail?: unknown) => void`），是**同一个类型写了两遍**，不是两个类型 —— 收进 `types.ts` 一份即可。顺带把 `ElementAdapter.mount` 的 `emit` 形参也换成它（那里原本是第三遍内联展开）。

```ts
// packages/runtime/src/index.ts
export { createElementClass } from './element'
export { registerElement, resetRegistry } from './registry'
export { applyStyles, resetStyleCache } from './style'
export { attrNameFor, coerceAttr, isAttributeChannel } from './props'
export { defineComponentMeta } from './types'
export type {
  ComponentMeta, ElementAdapter, EmitFn, EwElementConstructor, PropDefinition, PropType,
} from './types'

export { vueAdapter, useVueEmit, EW_EMIT_KEY } from './vue'
export type { VueAdapterOptions } from './vue'

export { reactAdapter, useReactEmit, EwEmitContext } from './react'
```

测试专用的 `resetRegistry` / `resetStyleCache` / `applyStyles` 一并导出。它们是纯函数、无副作用，不用时被摇掉；为它们单开 `./internal` 子路径不划算。

被否决的方案：保留 `useEmit` 原名，改用子路径导出 `@ew/runtime/vue`、`@ew/runtime/react`。它结构性更安全（框架专用模块根本不进对方的图），但组件里要写两行 import，且 `@ew/runtime` 这个主入口只剩框架无关部分，不符合用户「一行 import」的目标。

## 7. `@ew/utils` 的边界

判据：**构建工具也需要的东西放 utils，碰 DOM 或框架的放 runtime。**

眼下只有 `toIdentifier` 满足。一个函数开一个包看着薄，但边界是真的：`scripts/build.ts`、`scripts/new-component.ts`、`docs/.vitepress/plugins/wc-mode.ts` 三个消费方全是构建期代码，不该 import 一个顶层 `extends HTMLElement` 的浏览器包。`props.ts` / `style.ts` 虽然也是纯逻辑，但它们按 attribute 名、shadow root 说话，属于 runtime。

`naming.ts` 顶部那段「三处消费者必须完全一致」的注释随文件迁走，并把路径更新为包名。

## 8. 迁移面清单

| 位置 | 改动 |
|---|---|
| `packages/utils/**` | 新建；`naming.ts` 自 `src/runtime/naming.ts` 迁入 |
| `packages/runtime/**` | 新建；7 个模块自 `src/runtime/` 迁入 + 新增桶；`types.ts` 增收 `EmitFn` |
| `src/runtime/{vue,react}.ts` | 各自删掉本地 `EmitFn`，改从 `./types` 引入；`useEmit` 改名 |
| `src/runtime/` | 整个删除 |
| `src/workspaces/demo/components/hello-{vue,react}/` | 6 个文件：`meta.ts`/`index.ts`/`Component.*` 改 import |
| `scripts/build.ts` | `'../src/runtime/naming'` → `'@ew/utils'` |
| `scripts/new-component.ts` | 同上；`RUNTIME` 常量 → `'@ew/runtime'`；模板里 `useEmit` → `useVueEmit`/`useReactEmit` |
| `tests/scripts/new-component.test.ts` | 两条 import 路径期望 |
| `tests/runtime/*.test.{ts,tsx}` | 6 个文件、16 条 import |
| `docs/.vitepress/plugins/wc-mode.ts` | `'../../../src/runtime/naming'` → `'@ew/utils'` |
| `docs/.vitepress/theme/components/{Vue,React}Mount.vue` | `'@src/runtime/*'` → `'@ew/runtime'` |
| `docs/guide/authoring.md` | 两处代码块（`meta.ts` 与 `useEmit` 示例） |
| `tsconfig.json` | `include` 加 `"packages"` |
| `package.json` | `devDependencies` 加 `"@ew/runtime": "workspace:*"`、`"@ew/utils": "workspace:*"` |
| `pnpm-workspace.yaml` | 新增 `packages: ['packages/*']` |

`@src/*` 别名保留 —— `docs` 主题仍在用它 glob `@src/workspaces/**` 与引 `@src/tokens/tokens.css`。

## 9. 消费方解析（逐个验证，不靠推断）

源码包 + `exports.types` 指向 `.ts` 是标准做法，但四个消费方各有各的解析器，每个都要实测：

| 消费方 | 验证方式 |
|---|---|
| tsx（`scripts/*.ts`） | `pnpm run build` 能跑完（脚本 import `@ew/utils`） |
| vue-tsc | `pnpm run typecheck` 通过 |
| Vitest | `pnpm run test` 通过（`tests/**` import `@ew/runtime`） |
| Vite（构建） | `pnpm run build` 产出正常，产物体积与守卫见第 10 节 |
| Vite（文档站） | `pnpm run docs:build` 通过，且预览里组件渲染正常 |

任一方解析失败，就地修那一方（补 `exports` 条件、补 `types` 字段），**不加 tsconfig paths 兜底** —— 两套解析规则迟早会分叉。

## 10. 产物隔离守卫（`scripts/check-artifacts.ts`）

桶文件把「Vue 产物里不含 React」从一个**结构性事实**降级成一条**依赖 tree-shaking 的性质**。摇不干净的症状是静默的：`dist/cdn/hello-vue.js` 从 68KB 涨到 290KB，没有任何测试会红。

守卫按组件框架断言标记出现次数。当前基线（重构前实测）：

| 标记 | `hello-vue.js` | `hello-react.js` | `ew-all.js` |
|---|---|---|---|
| `react-dom` | 0 | 1 | 1 |
| `__v_isRef` | 1 | 0 | 1 |

| 文件 | 大小 |
|---|---|
| `dist/cdn/hello-vue.js` | 68,580 B |
| `dist/cdn/hello-react.js` | 225,817 B |
| `dist/cdn/ew-all.js` | 292,760 B |

断言规则：对每个 `dist/cdn/<name>.js`（`ew-all` 除外），从 `src/workspaces/*/components/<name>/` 判断框架，要求**对家标记出现 0 次、自家标记出现 1 次**。「1 次」同时覆盖了「Vue 被装了两份」这类重复实例问题。

挂进 `verify`，排在 `build` 之后：

```
typecheck → test → build → check:artifacts → docs:build → test:e2e
```

## 11. 风险

| 风险 | 应对 |
|---|---|
| 桶文件让 Rollup 摇不掉 react-dom | 第 10 节守卫；`sideEffects: false` 兜底 |
| pnpm 给 `packages/runtime` 装出第二份 Vue | 依赖范围与根完全一致 → 同一 store 条目；守卫的「自家标记 1 次」能抓到 |
| tsx 解析不了 `exports.default` 指向的 `.ts` | 第 9 节第一项；失败则改 `exports` 条件 |
| 建 workspace 后 `pnpm install` 重排 lockfile | 预期内；`allowBuilds` 的两条必须保留，否则 `pnpm run *` 的依赖检查会退出 1 |

回滚：`git revert` 该提交即可，无数据迁移、无产物格式变更、无远程依赖。

## 12. 验收标准

1. `pnpm run verify` 全绿，且 `check:artifacts` 在其中。
2. `src/runtime/` 不存在；仓库内除 `self-monitor` 外无 `../../../../runtime` 残留。
3. `dist/cdn/*.js` 体积与基线同量级（±5%），标记计数满足第 10 节表格。
4. `docs/guide/authoring.md` 里的示例与新模板生成的代码逐字一致。
5. `pnpm run new:component` 生成的组件，其 import 行是 `@ew/runtime`。
6. `package.json` 的 `exports` 键与构建前一致（tag / CDN 文件名契约未变）。
