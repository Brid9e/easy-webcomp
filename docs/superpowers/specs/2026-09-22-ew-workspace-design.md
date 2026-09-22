# easy-webcomp 工作空间设计文档

## 1. 一句话定义

引入「工作空间」作为组件的**必需**文件组织单位：组件一律住在 `src/workspaces/<ws>/components/<name>/`，每个空间带一份 `workspace.ts` 清单；文档站随之改为按空间浏览，空间页用 grid 展示组件（框架 icon + 组件名），组件详情页保留散文与交互面板。

## 2. 背景与动机

一期把组件放在扁平的 `src/components/`。设计文档第 9 节「宿主注入协议（网络 / 登录态 / i18n）」当初被划到二期，用户于 2026-09-21 提出引入工作空间来承载它，并定下一条关键定性：**工作空间是文件组织单位，不是纯运行时作用域**。

文档站已于 2026-09-22 落地，其 spec 第 13 节列出工作空间会触及的四处接缝。本设计实现其中的骨架部分，另加一条脚手架命令。

本设计**新增一条硬约束**（用户明确要求）：组件必须属于某个工作空间，**没有隐式默认空间**。

## 3. 非目标（YAGNI）

- **不实现跨框架状态层**。这是独立子系统，需要自己的 spec → plan → 实施循环。
- **不实现全局参数管理**。同上。
- **不实现 per-workspace 的组件 API 配置**。同上。
- **不做 per-workspace 的主题 / token 覆盖**。`--ew-*` 仍是全局的。
- **不做组件脚手架命令**。「加组件零配置」是已公开的承诺（见 `docs/guide/authoring.md`），不因引入工作空间而增加步骤。
- **不做工作空间的删除 / 重命名 / 迁移命令**。手工 `mv` 即可。
- **不改交付契约**：自定义元素 tag、`package.json` 的 `exports` 键、CDN 产物文件名一律不变。
- **不把 `scripts/build.ts` 改成引用文档站代码**。构建脚本属于产物管线，不应反向依赖文档站——这条沿用文档站 spec 第 5 节的既有决策。

## 4. 目录结构与身份

```
src/workspaces/
├── define.ts                       # defineWorkspace + WorkspaceMeta
└── demo/
    ├── workspace.ts                # 空间清单
    └── components/
        ├── hello-vue/
        │   ├── Component.vue
        │   ├── meta.ts
        │   ├── index.ts
        │   ├── define.ts
        │   └── style.css
        └── hello-react/
```

**目录名即空间 id**。`workspace.ts` 不重复声明 `name`——一个信息只存一处，不可能漂移。清单只管展示层：

```ts
// src/workspaces/demo/workspace.ts
import { defineWorkspace } from '../define'

export default defineWorkspace({
  title: '演示组件',
  description: '文档站的示例集合',
})
```

```ts
// src/workspaces/define.ts
export interface WorkspaceMeta {
  /** 展示名，缺省回落目录名 */
  title?: string
  description?: string
}

export function defineWorkspace(meta: WorkspaceMeta): WorkspaceMeta {
  return meta
}
```

`title` 缺省时由读取方回落到目录名，因此 `workspace.ts` 可以只有一个 `description`。

**组件内的五文件约定与文件名全部不变**——`Component.vue` / `Component.tsx` 判别框架的做法保留。本设计曾考虑改成 `index.vue`，因与既有的 `index.ts` 入口同层撞名（`./index` 的解析依赖 Vite `resolve.extensions` 顺序，而它默认不含 `.vue`）而放弃。

**`src/workspaces/` 顶层的散文件（`define.ts`）被扫描器跳过**：只认目录。

## 5. 全局唯一性约束

tag 与 `exports` 键都不带空间前缀，因此**组件名必须全局唯一**。两个空间各有一个 `hello-vue`，会让 `ew-hello-vue` 与 `exports['./hello-vue']` 直接撞车——而且是静默覆盖，不是报错。

构建脚本新增一条校验：扫描完成后检测重名，命中即抛错并列出全部冲突位置。文档站侧的 `workspaces.ts` 做同样的校验，理由与文档站 spec 第 5 节一致——两边各扫各的，共享的是约定而非代码。

**这条约束反过来简化了别处**：组件名既然全局唯一，虚拟模块 id 可以继续用 `virtual:ew-wc/<name>`，不必按文档站 spec 第 13 节预言的 `<ws>/<name>`。这是**有意偏离**该节——加空间前缀反而让「组件换空间」产生 import 变动。URL 仍带空间（`/workspaces/demo/hello-vue`），模块 id 不带。

## 6. 构建面

- **`scripts/build.ts`**：扫描基路径由 `src/components/*` 改为 `src/workspaces/*/components/*`；新增第 5 节的重名校验；`src/.generated/all.ts` 与 `all-define.ts` 的 import 路径相应变化。产物侧一切照旧。
- **`scripts/new-workspace.ts`（新）** + `package.json` 增加 `"new:workspace": "tsx scripts/new-workspace.ts"`。见第 9 节。

## 7. 文档站结构

```
docs/workspaces/
├── index.md                        # 静态：所有空间的 grid
├── [ws]/
│   ├── index.md                    # 动态模板：空间内的组件 grid
│   ├── index.paths.ts
│   ├── [name].md                   # 动态模板：无散文时的兜底详情页
│   └── [name].paths.ts             # 枚举组件，排除已写散文的
└── demo/
    ├── hello-vue.md                # 手写散文，写法不变
    └── hello-react.md
```

**删除** `docs/components/` 整个目录；nav「组件」由 `/components/` 改为 `/workspaces/`。

### 7.1 两种详情页

- **有散文**：`docs/workspaces/<ws>/<name>.md`，手写，页面里用 `<ComponentDemo name="..." />`。**写法与现在完全一致**，只是从 `docs/components/` 挪了一个目录。
- **无散文**：由 `[name].paths.ts` 动态生成，内容只有交互面板。

`[name].paths.ts` **必须排除已写散文的组件**，否则动态路由会与静态页生成同一路径 `/workspaces/<ws>/<name>`，造成路由冲突：

```ts
// docs/workspaces/[ws]/[name].paths.ts
import { listWorkspaces } from '../../.vitepress/workspaces'

export default {
  paths() {
    return listWorkspaces().flatMap((ws) =>
      ws.components
        .filter((c) => !c.documented)
        .map((c) => ({ params: { ws: ws.id, name: c.name } })),
    )
  },
}
```

```ts
// docs/workspaces/[ws]/index.paths.ts
import { listWorkspaces } from '../../.vitepress/workspaces'

export default {
  paths: () => listWorkspaces().map((ws) => ({ params: { ws: ws.id } })),
}
```

两个 md 模板都通过全局属性 `$params` 拿参数（VitePress 在 `app.config.globalProperties` 上暴露）：

```md
<!-- docs/workspaces/[ws]/index.md -->
<WorkspaceGrid :ws="$params.ws" />
```

```md
<!-- docs/workspaces/[ws]/[name].md -->
<ComponentDetail :ws="$params.ws" :name="$params.name" />
```

### 7.2 侧边栏

两层，空间名用 `title`（缺省回落 id），`collapsed: false`：

```
组件
  演示组件
    hello-vue
    hello-react
```

**比现状更简单的一点**：现在两种组件都有页面了，不再需要「没写 md 就链到 `/components/#<name>` 锚点」这套兜底，链接规则退化成一条——永远指向 `/workspaces/<ws>/<name>`。

### 7.3 卡片链接

grid 卡片指向的 URL 与「有没有散文」无关，两种情况都是 `/workspaces/<ws>/<name>`。散文的有无只影响**那个页面由谁渲染**（静态 md 还是动态兜底）。

### 7.4 数据从哪来：Node 侧与 Vite 侧各取所需

沿用文档站 spec 第 5 节已有的划分——**Node 侧只能拿到目录结构，Vite 侧才能拿到模块**。工作空间把这条划分推到了一个更容易踩雷的位置，必须写死：

**`docs/.vitepress/workspaces.ts` 只导出同步的、纯 `fs` 的扫描**：

```ts
export interface ComponentInfo {
  name: string
  framework: 'vue' | 'react'
  documented: boolean
}

export interface WorkspaceInfo {
  id: string
  components: ComponentInfo[]
}

export function listWorkspaces(): WorkspaceInfo[]
```

`components` 的判定与 `scripts/build.ts` 一致（`Component.vue` / `Component.tsx` 必须且只能有一个），另加第 5 节的全局重名校验。**这里不返回 `title` / `description`**，因为那是 TS 模块里的值，`fs` 读不到。

**`workspace.ts` 的 `title` / `description` 走另一个函数**：

```ts
export async function readWorkspaceMeta(id: string): Promise<WorkspaceMeta>
```

实现用 `tsx/esm/api` 的 `tsImport`（tsx 已是既有 devDependency，`scripts/build.ts` 就跑在它上面）。这需要 `config.mts` 改成 **async 配置函数**——VitePress 支持（`resolveConfigExtends` 里是 `await (typeof config === "function" ? config() : config)`）。

**为什么 `tsImport` 在被打包的 config 里能生效**：Vite 的 `bundleConfigFile` 有一个 `externalize-deps` 插件，把形如 `/^[^.#].*/` 的裸包 import 一律标记为 `external: true` 并改写成 file URL，所以 `tsx/esm/api` 不会被 esbuild 塞进产物，而是留给 Node 在运行时真正加载。同一插件保留 `import.meta.url` 的原始文件路径（注入 `__vite_injected_original_import_meta_url`），所以 `components.ts` 里现有的 `rootDir` 求值写法可以照搬。

**读不到就回落到目录名**：`readWorkspaceMeta` 失败时返回 `{}`，调用方用 `meta.title ?? id`。侧边栏不因为一个清单文件写错就整个构建失败。

**Vite 侧（主题组件）不能用上面两个函数**——`WorkspaceGrid.vue`、`WorkspaceIndex.vue`、`ComponentCard.vue` 最终跑在浏览器里，`node:fs` 不存在（SSR 期也一样，VitePress 在 Node 里渲染每一页）。它们一律用 `import.meta.glob`，与今天的 `ComponentOverview.vue` / `ComponentDemo.vue` 同法：

| 组件 | glob |
|---|---|
| `WorkspaceIndex.vue` | `@src/workspaces/*/workspace.ts`（空间名与描述）+ `@src/workspaces/*/components/*/Component.{vue,tsx}`（组件数与框架） |
| `WorkspaceGrid.vue` | `@src/workspaces/*/workspace.ts`（本空间标题）+ `@src/workspaces/*/components/*/Component.{vue,tsx}`，按路径里的空间段过滤出本空间 |
| `ComponentCard.vue` | 由父组件传入，不自己 glob |

**框架判别在 Vite 侧靠扩展名**（`.vue` → vue、`.tsx` → react），在 Node 侧靠文件存在性。两处都要写，这是既有约定的延续，不是新引入的重复。

**空空间要能渲染**：`new:workspace` 建出来的空间一个组件都没有，`/workspaces/<ws>/` 与 `/workspaces/` 都必须给出空态文案（`WorkspaceGrid` / `WorkspaceIndex` 各一句），而不是空白页。`ComponentOverview.vue` 已有这个先例。

## 8. 主题组件

新增四个，均在 `docs/.vitepress/theme/components/`：

| 文件 | 职责 |
|---|---|
| `WorkspaceIndex.vue` | `/workspaces/` 的正文：所有空间的卡片（空间名 + 描述 + 组件数） |
| `WorkspaceGrid.vue` | 空间页正文：该空间组件的 grid |
| `ComponentCard.vue` | 单张卡片：框架 icon + 组件名，整张可点 |
| `ComponentDetail.vue` | 兜底详情页正文：渲染 `<ComponentDemo>` |

**框架 icon 用内联 SVG**，不引依赖：Vue 用 `#41B883`、React 用 `#61DAFB` 的品牌色。icon 只作标识，不承担语义——卡片上同时有组件名，不依赖颜色区分。

**`ComponentDemo.vue` 的 prop 签名不变**——名字全局唯一，单一个 `name` 仍然够用，只需把 `import.meta.glob` 的基路径由 `@src/components/*/` 改为 `@src/workspaces/*/components/*/`。key 仍取 `path.split('/').at(-2)`。

**模板渲染层不受影响**：`VueMount.vue`、`ReactMount.vue`、`source-style.ts` 一行不改。

## 9. 脚手架命令

```bash
pnpm run new:workspace demo
```

行为：

1. 校验参数：必须匹配 `/^[a-z][a-z0-9-]*$/`；目标目录不存在。
2. 生成 `src/workspaces/demo/workspace.ts`，`title` 预填目录名，`description` 留空。
3. 生成 `src/workspaces/demo/components/.gitkeep`（git 不跟踪空目录）。
4. 打印后续步骤，**包含「重启 dev 才能看到新空间」**（见第 12 节风险 1）。

只写 `src/`，**不碰 `docs/`**——文档站是 `src/` 的消费者，脚手架不该替它生成页面。这也是第 7 节坚持用动态路由而非「脚手架顺手写个 md」的原因。

**不加 `new:component`**（第 3 节）：组件仍是手建目录、零配置。

## 10. 迁移清单

| 现状 | 去向 |
|---|---|
| `src/components/hello-vue/` | `src/workspaces/demo/components/hello-vue/` |
| `src/components/hello-react/` | `src/workspaces/demo/components/hello-react/` |
| 各组件文件内的 `../../runtime/*` 相对导入 | `../../../../runtime/*`（每个组件 5 处：`index.ts` 3、`meta.ts` 1、`Component.vue` / `.tsx` 1；深了两层） |
| `docs/components/hello-vue.md` | `docs/workspaces/demo/hello-vue.md` |
| `docs/components/hello-react.md` | `docs/workspaces/demo/hello-react.md` |
| `docs/components/index.md` | 删除，由 `docs/workspaces/index.md` 取代 |
| `docs/.vitepress/components.ts` | → `workspaces.ts`，`listComponents()` → `listWorkspaces()` |
| `tests/docs/components.test.ts` | → `workspaces.test.ts` |
| `README.md`、`docs/guide/index.md`、`authoring.md`、`build.md` | 路径示例 `src/components/...` 全部改写 |
| `docs/components/hello-vue.md` 等正文里的源码路径 | 同上 |

`docs/index.md` 首页 feature 文案里的「组件放 `Component.vue` 或 `Component.tsx`」不含路径，无需改；但 `link: /components/` 与 `linkText: 看组件总览` 要改指 `/workspaces/`。

**注意事项**：`docs/index.md` 的 `details` 走 `v-html` 且不经 markdown，尖括号必须写成 HTML 实体（`&lt;ew-*&gt;`）。改这四条文案时不要退回裸尖括号，否则构建产物会整站挂掉——详见文档站 spec 第 6.1 节。

## 11. 验证方式

`pnpm run verify` 五项不变，无需新增脚本。

**验收标准（逐条可验证）**：

1. `pnpm run verify` 五项全绿。
2. `pnpm run new:workspace tmp-ws` 生成骨架；`pnpm run build` 通过且产物不含 `tmp-ws` 的任何入口；**空空间页 `/workspaces/tmp-ws/` 与 `/workspaces/` 都渲染出空态文案而非空白**（重启 dev 后看）。删除该目录后 `build` 仍通过。验证完删除。
3. dev 浏览器确认：
   - 侧边栏出现「**演示组件**」分组（中文标题，证明 `readWorkspaceMeta` 真的读到了 `workspace.ts`；回落成 `demo` 即为第 12 节风险 6 命中）
   - `/workspaces/` 是空间 grid，卡片显示空间名与描述
   - 进 `/workspaces/demo/` 是组件 grid，两张卡片各带正确的框架 icon（Vue 绿 / React 青）
   - 点 `hello-vue` 卡片进详情页，散文与交互面板都在，面板默认 WC 模式，事件日志能收到 `ew-select`
   - 点 `hello-react` 卡片同理，事件为 `ew-select`
4. **兜底详情页**：临时建一个只有五个文件、不写散文的组件，重启 dev——它出现在 `/workspaces/demo/` 的 grid 上，点进去是一个只有交互面板的页面。验证完删除。
5. **重名校验**：临时在两个空间下建同名组件，`pnpm run build` 报错并指出两处冲突。验证完删除。
6. `pnpm run docs:build` 产物含 `workspaces/demo/hello-vue.html`、`workspaces/demo/index.html`、`workspaces/index.html`，**不含** `components/`，**不含** `superpowers/`。
7. 交付契约未变：`package.json` 的 `exports` 键与 `dist/cdn/` 文件名与改动前逐字节一致。

## 12. 已知风险

1. **新建工作空间后必须重启 dev**。VitePress 的动态路由只在 `paths.ts` 及其 import 依赖变动时重解析（`handleHotUpdate` 查 `dynamicRoutes.fileToModulesMap`），而工作空间是 `fs` 扫出来的、不在 import 图里。用户已确认接受，`new:workspace` 的提示输出会写明。理论上的替代方案是让 `paths.ts` 用 `import.meta.glob` 把 `src/workspaces/*/workspace.ts` 变成真实依赖，但**新增文件仍不会进 glob**，换不来完整的热更新，不值得引入这层曲折。
2. **`docs/workspaces/` 下 `[ws]` 与 `demo` 是同级目录**，肉眼看着别扭。这是 VitePress 动态路由的固有形态（模板目录与内容目录并列），无法回避；会在主题注释里说明。
3. **动态路由与静态页的共存依赖 `paths.ts` 的过滤**。若哪天有人给一个已有散文的组件又让它进了动态路由，会得到重复路由。缓解：把这条写进 `[name].paths.ts` 的注释；验收标准 3、4 覆盖了两种情况。
4. **两次 `docs:build` 之间 VitePress 的路由解析缓存**。`routeModuleCache` 是模块级 Map，长驻的 dev 进程可能持有旧的 `paths` 结果。缓解：改 `workspace.ts` 或 `paths.ts` 后重启 dev。
5. **`workspaces.ts` 被三处消费**（`config.mts` 与两个 `paths.ts`），后两者经 `loadConfigFromFile` 各自单独打包。现有 `components.ts` 已被 `config.mts` 以同样方式消费且工作正常，`import.meta.url` 求值 `rootDir` 的写法可直接沿用；但若出现路径解析异常，退路是把 `rootDir` 改为显式参数注入。
6. **`tsImport` 读 `workspace.ts` 是本设计里最不确定的一环**。它的可行性建立在 Vite `bundleConfigFile` 的 `externalize-deps` 行为上（已读源码确认：裸包 import 一律 `external: true`），但这是 Vite 的内部实现，跨版本可能变。缓解分三层：`readWorkspaceMeta` 失败回落目录名、`config.mts` 改 async 是本设计里唯一的侵入式改动、验收标准 3 的第一条直接检查侧边栏中文标题——真回落到 `demo` 会立刻暴露。若实施时发现不可行，退路是让 `workspace.ts` 改用 `import type` + `satisfies`（Node 22.18+ 原生剥离类型，无需 tsx），代价是写法偏离 `defineComponentMeta` 的既有风格。
7. **同步的 `paths()` 与异步的 `readWorkspaceMeta` 不能混用**。第 7.4 节把 `listWorkspaces()` 限死在 `fs`，正是为了让 `paths()` 保持同步；若有人日后在 `paths()` 里 await 清单文件，会拖慢每次路由解析。缓解：`[ws]/index.md` 的标题由 `WorkspaceGrid` 自己在运行时用 glob 取，不走 params。

## 13. 与文档站 spec 第 13 节的关系

| 该节预言 | 本设计的实际做法 |
|---|---|
| `components.ts` 改成扫工作空间，返回结构多一层 | 兑现，改名为 `workspaces.ts` |
| `config.mts` 的 `buildComponentSidebar()` 多一层分组 | 兑现，见第 7.2 节 |
| `wc-mode.ts` 的虚拟模块 id 变成 `virtual:ew-wc/<ws>/<name>` | **偏离**：保持 `virtual:ew-wc/<name>`，理由见第 5 节（名字全局唯一；加前缀会让换空间产生 import 变动） |
| `docs/components/*.md` 可能挪到 `docs/workspaces/<ws>/components/` | **偏离**：移到 `docs/workspaces/<ws>/`，不再有 `components/` 中间层——URL 少一层，且该层与动态模板目录无对应关系 |

该节「不受影响」的判断（渲染器与 `src/runtime/` 全部不动）在本次实施中成立。

## 14. 为后续子项目预留的接缝

本设计只做骨架，但下面三处是刻意为后续留的：

| 子项目 | 落点 |
|---|---|
| 组件 API 配置 | `src/workspaces/<ws>/` 下新增文件，扫描器只认目录、不认文件名，加文件不影响现有逻辑 |
| 全局参数管理 | 同上；`workspace.ts` 已有 `description` 的同类扩展位 |
| 跨框架状态层 | `src/workspaces/<ws>/state/` 或提升为全局模块，`src/runtime/` 不动 |

三者都**尚未产出任何设计**，各自需要独立的 brainstorming → spec → plan。
