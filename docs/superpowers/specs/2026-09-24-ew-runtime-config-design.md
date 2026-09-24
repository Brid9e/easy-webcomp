# 运行时全局配置（@ew/runtime + 三种产物的入口）

## 背景

组件跑在宿主的页面里，请求要打到宿主的后端。现在 `my-list/api.ts` 把 `baseURL: '/api'`
和 15 秒超时写死在组件源码里 —— 换一个宿主就得改组件源码、重新发一次包，而这件事本该
由宿主在运行时说了算。

所以需要一层「运行时全局配置」：宿主在页面里设置一次，组件读它。本期只收三项 ——
`baseURL`、`timeout`、`headers`，都是「怎么连后端」同一族的。鉴权不在其内，理由见「不做的事」。

## 一个必须先说清的前提：一份产物一份运行时副本

`@ew/runtime` 不在 external 表里，它被**内联进每一份产物**：

| 产物 | 内联形态 |
|---|---|
| CDN 单组件 | 每个组件一个 IIFE，各含一份（`dist/cdn/<空间>/<组件>.js`） |
| CDN 空间入口 | `dist/cdn/<空间>/index.js` 又一份 |
| ESM | 每个空间一套（`dist/<空间>/esm/*.js`，含共享 chunk） |
| framework | 每个空间一套（external 只有 vue / react / react-dom / element-plus / pinia） |

实测 `grep -rl "已在本运行时注册过" dist` 命中 7 个文件，横跨三个目录。

**后果：模块级变量在这些副本之间不通。** 一个页面里同时引 CDN 的 my-list 与 ESM 的 demo，
就是两三份互不相识的运行时。所以配置的**状态**必须落在 `globalThis` 的同一个槽位上，
由所有副本共读共写 —— 这是本设计唯一不能让步的部分。

**API 面则按消费场景分两种。** ESM 与 framework 的消费方手里有打包器，正常 `import` 最自然；
CDN 的消费方只有 `<script>`，只能靠全局。两者读写同一个槽位，所以仍然是一套真相，
不是两套。

## 目标结构

```
packages/runtime/src/config.ts        # 状态与 configure / getConfig / resetConfig
packages/runtime/package.json         # 新增 "./config" 子路径导出
dist/<空间>/esm/config.js             # buildEsm 多出的一个入口，ESM 与 framework 消费方共用
dist/<空间>/esm/config.d.ts           # scripts/declarations.ts 生成，类型内联
dist/cdn/config.js                    # 根级一个 IIFE，name 取 ewConfig（即 window.ewConfig）
```

`./config` 对 ESM 与 framework 两个消费方是**同一个文件**：framework 的入口映射只出
`vue` / `react` 两份，不加第三份。framework 消费方引 `@ew/<空间>/config` 拿到的就是
`dist/<空间>/esm/config.js`。

### 为什么放在 @ew/runtime

- 它本来就是「被内联进每份产物」的那一层，配置要的正是这个位置；
- `@ew/utils` 是纯函数层（`toIdentifier`、`defineWorkspace`），配置是有状态的，放那儿错位；
- 新开一个 `@ew/config` 包要多一条依赖、多一份清单，而这层只有几十行、零依赖 —— 不值。

### 为什么要加 `@ew/runtime/config` 这个子路径

生成的入口只要 `configure` / `getConfig` 两个函数，如果从 `@ew/runtime` 的桶导入，Rollup 会把
element / style / registry 以及 vue、react 两个适配器一并拉进 `esm/config.js`。走子路径则只带
`config.ts`，CDN 那个 IIFE 更是只剩几十字节。

## 契约

```ts
export interface EwConfig {
  baseURL?: string
  timeout?: number
  headers?: Record<string, string>
}

/** 顶层浅合并，返回合并后的快照。晚调也生效 —— 消费方是请求时读的。 */
export function configure(patch: EwConfig): EwConfig

/** 返回副本，改它不影响存储。 */
export function getConfig(): EwConfig

/** 清空。仅供测试，照 resetRegistry / resetStyleCache 的先例。 */
export function resetConfig(): void
```

几条定死的语义：

- **槽位是 `globalThis.__ew_config__`**，字符串键而不是 Symbol：devtools 里要看得见，
  排查时能直接敲出来。
- **`configure` 顶层浅合并**，`headers` 整体替换而不是逐键合并。逐键合并会引出「怎么删掉
  一个头」的歧义（传 `undefined`？传 `null`？），而整替换的答案很清楚：给全量。
- **`undefined` 的键不参与合并**，所以调用方没法用 `configure({ baseURL: undefined })` 清掉
  一项；要清就 `resetConfig()` 重来。这条与 `exactOptionalPropertyTypes` 下「可选键只能是
  缺席，不能是 undefined」是同一个口径。
- **不收任意键**（不定成 `Record<string, unknown>`）。这份类型要内联进生成的 `.d.ts`，
  弱类型写进去等于没有契约，消费方也拿不到补全。

### 三种产物的入口

| 产物 | 消费方怎么拿到它 |
|---|---|
| ESM | `import { configure, getConfig } from '@ew/<空间>/config'` |
| framework | 同上，同一个文件 |
| CDN | 引 `<script src=".../cdn/config.js">`，然后 `ewConfig({ baseURL: '…' })` |

CDN 那个 IIFE 的全局名就是 `ewConfig`：生成的入口 `export { configure as default }`，Vite 的
IIFE 把它落成 `var ewConfig = (…)()` —— 顶层 `var` 在 `<script>` 里就是 `window.ewConfig`。

不走「入口里写一句 `globalThis.ewConfig = configure`」：那是一句导入副作用，而且 IIFE 的
`lib.name` 仍然必填，结果平白多出一个没人要的 `window.EwConfig`。用 `name` 这一个机制，
与既有两个 CDN 产物（`toIdentifier(组件名)`、`Ew<空间>`）也才是同一个形状。

### 为什么 CDN 要单独一个文件，而不是别的挂法

三条都被否掉的路，理由不一样：

- **让运行时模块顶层自己挂 window。** 那是导入副作用：与 `sideEffects: false` 的声明冲突，
  会被打包器摇掉；而且每个 ESM 宿主都会平白多一个全局变量。
- **让空间入口 `index.js` 顺带挂上。** 按空间分，同页引两个空间就有两个名字；只引单个
  组件文件的人根本拿不到（单组件的 `define.ts` 没有任何导出）。
- **纯数据全局**（约定宿主写 `window.ewConfig = { baseURL: '…' }`）。少一个文件，但 CDN
  与 ESM 就成了两种形态：一个填对象、一个调函数，合并语义也没有了。

一个只做一件事、与空间无关的小文件，代价是一行 `<script>`，换来的是 CDN 与 ESM 用同一个
函数、同一套语义。

## api.ts 怎么用

`http` 改成不带默认值创建，三项全在**请求拦截器**里读 —— 请求时读而不是创建时读，
所以晚调 `configure()` 也生效，不需要登记实例、也不要求宿主赶在组件加载前配置。

优先级三层：

> **请求级 > 全局配置 > 组件自己的兜底**

- `baseURL`：`config.baseURL ??= 全局 ?? '/api'`
- `timeout`：`if (!config.timeout) config.timeout = 全局 ?? 15_000`
- `headers`：只补请求上没有的那些键

兜底仍是 `/api` 与 15 秒，所以**宿主没调 `configure()` 时行为与今天完全一样**。

`timeout` 那行用「假值」判定而不是 `undefined`：axios 的请求配置里 `timeout: 0` 意味着
「不限时」，把它当作「没设」才对。其余两处用 `undefined` 判定就够了。

`fetchMyList` 仍是 mock，见「不做的事」。

## 接线：构建与守卫改到什么

- `packages/runtime/package.json`：exports 加 `./config`（`types` 与 `default` 都指
  `./src/config.ts`，与 `"."` 同形）。
- `scripts/build.ts`：
  - `writeGeneratedEntries` 多生成两个各一行的文件 —— `config.ts`（`export { configure,
    getConfig } from '@ew/runtime/config'`，给 buildEsm）与 `cdn-config.ts`（同一个模块，
    但只出 `default`，给 buildCdn）。**`config.ts` 不分空间**：内容逐字相同，按空间生成
    几个副本纯属多余，也与「配置不按空间分」这条结论自相矛盾。
  - `buildEsm` 的 entry 多一项 `config`，产物落在 `dist/<空间>/esm/config.js`，并按
    `configDeclarationSource()` 写 `config.d.ts`；
  - `buildCdn` 多一次根级构建，入口是生成的 `cdn-config.ts`，产物 `dist/cdn/config.js`，
    IIFE 的 `name` 取 `ewConfig`。入口**只出 default 一个导出** —— 多一个具名导出，Rollup
    就改成把整个 exports 对象挂上去，`window.ewConfig` 便不再是函数。
    **这次构建必须排在函数开头那次 `rmSync(dist/cdn)` 之后** —— 那句清的是整棵 CDN 树，
    放前面会被自己清掉。
- **空间包的 package.json 一个字都不用改。** `@ew/<空间>/config` 已被现有的 `./*` 覆盖：
  实测 `import.meta.resolve('@ew/demo/config')` 就落在 `dist/demo/esm/config.js`，`types`
  走 `./esm/config.d.ts`。显式键只在**要盖过** pattern 时才写 —— `./vue` / `./react` 指向
  `framework/`，`./styles.css` 要盖掉 pattern 算出的 `esm/styles.css.js`；config 两样都不占，
  补一个显式键是纯冗余。上面那次 exports 改动是 `@ew/runtime` 自己的，与空间包无关。
- `scripts/declarations.ts`：新增 `configDeclarationSource()`。与其他声明一样，**不许出现
  `@ew/runtime` 这个说明符** —— 那个包 private、不发，消费方解析不到，`EwConfig` 的形状
  照 `RUNTIME_TYPES` 的做法就地内联。
- `scripts/check-artifacts.ts`：
  - `checkDeclarations` 的期望清单加 `esm/config.d.ts`。空间包不加 exports 键，`./*` 那条的
    `types` 含 `*`、会被守卫跳过，所以这份清单是 `config.d.ts` 唯一的守卫，必须加。
  - `checkExports` 的空间规格里加 `@ew/<空间>/config`，根包那边加 `easy-webcomp/cdn/config`
    （它落在 `./cdn/*` 这条 pattern 下，但守卫是逐条列举的，不列就查不到）。
  - **`checkCdn` 开头那条残留守卫要放行 `config.js`。** 它现在的判据是「`dist/cdn` 下不许有
    文件、只许有目录」，`dist/cdn/config.js` 正撞在上面 —— 不放行，`check:artifacts` 必红。
    放行的同时把它加进必查清单：哪次构建漏了它，守卫得说话。
- `tests/scripts/declarations.test.ts`：跟着补断言（`configDeclarationSource()` 里不出现
  `@ew/runtime`）。`tests/scripts/workspace-packages.test.ts` 不用动 —— 空间包那份 exports
  本来就没变。

## 测试

- `tests/runtime/config.test.ts`：默认全空；`configure` 合并；`getConfig` 返的是副本
  （改返回值不动存储）；`headers` 整体替换；`undefined` 的键不参与合并；`resetConfig`；
  以及**直接读写 `globalThis.__ew_config__` 能被 `getConfig` 看见** —— 这是「多副本共享」
  在单测里唯一能表达的形式。
- `tests/workspaces/self-monitor-api.test.ts`（新目录）：给 `http` 塞一个假 adapter，
  断言最终真正发出的那份 config —— 有全局配置时用全局；请求级传了就用请求级；没有全局
  配置时落回 `/api` 与 15 秒；全局 headers 补上、请求级同名 header 不被覆盖。
- `tests/e2e/`：`tests/e2e/fixture/index.html` 引 `/dist/cdn/config.js`，然后**在同一页里**
  动态 `import('/dist/demo/esm/config.js')`，用 CDN 那份写、用 ESM 那份读，断言读到同一个值。
  这条直接钉住本设计的核心论断（多副本共享一份状态），而且能跑在 4173 那台静态服务器上 ——
  `esm/config.js` 是自包含的，没有裸说明符。

## 破坏性变更

无。未调用 `configure()` 时组件行为与今天逐字一致；只是新增了一个子路径、一个 CDN 文件、
一个 `globalThis` 槽位。

## 已知代价

- **配置是全局一份，不按空间分。** 同页引两个空间也只能打同一个后端。这不是妥协，是
  三项本身的口径：`baseURL` / `timeout` / `headers` 描述的都是「怎么到达宿主的后端」，
  那是**页面**的属性（一个页面一个 origin），而真正按空间分的那一截 ——
  `/self-monitor/list` 这种路径前缀 —— 已经写在各自的 `api.ts` 里了。
- **但 API 面看不出上面那一点。** `@ew/<空间>/config` 带空间名，只是发布形态的产物
  （`@ew/runtime` 不发包，每个空间包必须自带一份入口），不是「配置按空间分」的意思。
  后果：同页有人引两个空间的 `config` 各配一次，后一次会**静默**盖掉前一次，没有任何提示。
  本期只在文档里说清。
- **真要按空间分，是纯增量。** 槽位本来就是个普通对象，将来往里加 per-空间键、读时按
  「空间键 ?? 页面键」取值即可，`configure({ … })` 这份页面级配置照旧生效 —— 不是破坏性
  变更。到真有「同页两个空间打不同后端」的场景时再谈，那时才知道 `configure` 该不该多一个
  空间参数、CDN 那个全局该改成什么形状。
- **多个 easy-webcomp 版本同页会共用同一个槽。** 版本 A 写的配置版本 B 也读得到。这是全局槽
  的固有代价；把版本号写进槽名会走向反面（同版本的不同内联副本反而分家了）。
- **CDN 消费方没有类型。** `window.ewConfig` 在 TS 里是个隐式 any。与既有 CDN 产物的处境
  一致（那条路本来就没有 `.d.ts`），不为它单独造一套。

## 不做的事

- **不接真实请求。** `fetchMyList` 仍是 mock：没有后端可打，换了真请求只会让文档站与
  devtools 的 my-list 变成一片报错，e2e 也会挂。本期只让配置对那个 axios 实例生效，
  用假 adapter 断言，不需要后端。
- **不把鉴权收进配置。** 上一期（`2026-09-24-ew-auth-resolution-design.md`）已经明确推迟了
  请求拦截器与鉴权的接线，而且主系统的 token 存在宿主自己的 `localStorage` 里、调试页还有
  一套自己的面板 —— 现在就并进来会让两处成为两个真相。`configure` 的键集留着口子，
  将来按 `auth: { method, secret }` 的形状加。
- **不做 `window.ew` 命名空间。** 现在只有一个函数，包一层命名空间是为将来假设接口形状，
  正是本仓库一贯不做的事。将来真有第二个全局要挂时再谈。
- **不做运行时注册任意配置键。** 同上的理由：没有第二个来源时，接口长什么样无从判断。
