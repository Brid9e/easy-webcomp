# easy-webcomp 调试页（`devtools/`）设计文档

## 1. 一句话定义

新增顶层 `devtools/` 作为独立的 Vite 应用：`pnpm dev` 打开一个**单组件调试页**——左栏选组件、主区独占视口渲染、右栏是 meta 驱动的属性面板与事件日志，主区容器可拖拽 / 按预设改变尺寸，用于自适应与移动端场景调试。`pnpm docs:dev` 仍开文档站。

预览机制（WC 虚拟模块插件、源码模式挂载、样式补齐、面板状态）从文档站抽到 `devtools/shared/`，两边共用同一份。

## 2. 背景与动机

### 2.1 现状

`pnpm dev` 与 `pnpm docs:dev` 是同一条命令（`vitepress dev docs`）。要在文档站里调一个组件，得先找到它的页面，组件被夹在导航、侧边栏、正文之间——**可用于观察的宽度被固定的内容栏吃掉**，而组件自身的自适应行为恰恰依赖可用宽度。

文档站的交互面板（`ComponentDemo.vue`）能切双模式、能改属性、有事件日志，形态是对的，缺的是三件事：

1. **没有独占的空间**。VitePress 的三栏布局不可让位，改不了容器宽度就调不了自适应。
2. **不能改容器尺寸**。现在是「铺满正文栏」一种宽度，375px 的移动端场景根本没法看。
3. **事件是写死的**。WC 模式只绑了 `@ew-select` 一个事件，`meta.events` 里声明了别的也收不到。

### 2.2 用户诉求（2026-09-22）

> 只有 `pnpm docs:dev` 时候打开文档，默认 `pnpm dev` 专门给一个调试页面去单独调试，要利用上浏览器页面大部分区域去调试，而且支持 resize 容器，为了可能自适应移动端的场景。

### 2.3 已确认的四个取舍

| 取舍点 | 结论 |
|---|---|
| 架构位置 | **独立 Vite 应用**，`pnpm dev` 起它。不参与 `docs:build` |
| resize 形态 | **拖拽 + 预设宽度**：右/下两条把手自由改宽高，另给 375 / 768 / 1024 / 铺满 四个预设与实时像素读数 |
| 调试范围 | **单个组件**，主区只渲染它；源码模式与 WC 模式可切，**默认 WC**（消费者拿到的是 WC） |
| 控制面板 | **面板复用 + 事件改动态**：属性控件仍由 `meta.ts` 的 `props` 驱动，事件日志改为按 `meta.events` 动态绑定 |

### 2.4 共享边界（本次的核心结构决定）

需要在「文档站」与「调试页」两侧保持一致的，只有**五件东西**：

1. `wcModePlugin` —— 组件发现规则。它与 `scripts/build.ts` 的扫描逻辑是同一份约定，漂了就会「预览是对的、产物是坏的」（或反过来）。
2. `source-style.ts` —— 源码模式的样式补齐。glob 的后缀集合必须跟着构建走（`.css` + `.scss`）。
3. `VueMount.vue` / `ReactMount.vue` —— 源码模式的挂载方式（shadow root + 注入样式 + 注入 emit 上下文）。
4. **属性值定型规则** —— WC 模式下必须传**已定型**的值走 property 通道。这条规则在 `ComponentDemo.vue` 里目前有**两份内容完全相同**的实现（`propsData` 与 `wcProps`），合并后共享。
5. `component-index` —— meta / 源码 / 空间标题的 glob 查询。

**外壳不共享**：`ComponentDemo.vue` 的面板布局走 `--vp-*`，那是 VitePress 的变量，在调试页里全是空的。调试页自带外壳，只用 `--ew-*`。

## 3. 非目标（YAGNI）

- **不建 `packages/devtools` 包**。包边界带来的 exports / 依赖声明 / publish 面，对「同仓库内的两个消费者」是纯开销。理由见第 4 节。
- **不复制一份插件**。复制的是第 2.4 节里最不该漂的那一件。
- **不发布 `devtools/`**。`package.json` 的 `files` 白名单只含 `dist` 与 `src/tokens/tokens.css`，本来就不会带上它。
- **不做多组件并排对比**。一次一个。
- **不做 iframe 隔离**。WC 有自己的 shadow root，源码模式靠 `VueMount`/`ReactMount` 自己 attach 的 shadow root 隔离，样式也注入到各自的 root 里。加 iframe 会让属性面板与事件日志跨文档通信，收益不抵复杂度。
- **不做真机 / 设备像素比 / 触屏模拟**。只做容器尺寸，这是「自适应」里唯一能从桌面浏览器真实观察到的维度。
- **不做独立的 build 产物**。调试页只在 dev 下跑，不进 `verify` 的构建阶段。
- **不改 `src/workspaces/self-monitor/`**（在制品）、**不改 `docs/superpowers/**` 既有文件**（历史记录）。
- **不改 `ComponentDemo.vue` 的 `--vp-*` 样式外壳**。它是文档站外壳，不是共享机制。
- **不动 `docs:preview` 与 e2e 静态服务器（4173）的端口策略**。本次只给文档站 dev（5173）补 `strictPort`，理由见 7.2。

## 4. 目录结构

```
devtools/                            # 新建顶层目录，同时是 Vite root
├── index.html                       # 挂载点
├── vite.config.ts
├── shared/                          # 别名 @devtools/* —— 文档站与调试页共用（机制层）
│   ├── wc-mode.ts                   # 自 docs/.vitepress/plugins/wc-mode.ts 迁入，内容不变
│   ├── source-style.ts              # 自 docs/.vitepress/theme/components/ 迁入，内容不变
│   ├── component-index.ts           # 新：meta / 源码 / 空间标题的 glob 查询
│   ├── preview-state.ts             # 新：usePropControls + useEventLog
│   └── mount/
│       ├── VueMount.vue             # 迁入，仅改 source-style 的 import 路径
│       └── ReactMount.vue           # 同上
└── src/                             # 调试页 UI（外壳层，不共享）
    ├── main.ts
    ├── App.vue
    ├── ComponentPicker.vue          # 左栏：按空间分组的组件列表
    ├── DebugToolbar.vue             # 顶栏：模式切换 / 预设 / 撑满开关 / 像素读数
    ├── DebugStage.vue               # 主区：resize 容器 + 渲染目标
    ├── ResizeHandle.vue             # 拖拽把手
    ├── PropPanel.vue                # 属性控件（meta.props 驱动）
    ├── EventLog.vue                 # 事件日志（meta.events 驱动）
    ├── shell.css                    # 外壳样式，只用 --ew-*
    └── use-persisted.ts             # localStorage 读写
```

迁移后 `docs/.vitepress/plugins/` 目录为空，删除。

**为什么是 `devtools/shared/` 而不是包**：两个消费者都在本仓库内、都通过 Vite 打包，包边界唯一的实际作用是写一份 `package.json` 并让根 `package.json` 多一条 `workspace:*` 依赖——换不来任何隔离。而别名 `@devtools/*` 与既有的 `@src/*` 是同一套注册方式（tsconfig `paths` + 各 Vite config 的 `resolve.alias`），不引入第二种解析规则。

**为什么文档站能引到 `devtools/` 之外的文件**：`docs` 与 `devtools` 都在仓库根内，Vite 的工作区根（`searchForWorkspaceRoot` 命中 `pnpm-workspace.yaml`）就是仓库根，`server.fs.allow` 覆盖得到。`import.meta.glob('@src/...')` 解析到的是仓库内的绝对路径，同现有写法。

## 5. 共享机制层

### 5.1 `wc-mode.ts` —— 原样搬迁

导出签名不变（`wcModePlugin(workspacesDir: string): Plugin`），它本来就接受路径参数、不依赖 VitePress。虚拟模块 id `virtual:ew-wc-index` 与 `virtual:ew-wc/<name>` 不变，`src/env.d.ts` 里的类型声明因此不用动。

生成代码里那条注释（「直接复用组件自己的 `index.ts`，不要在这里再 `createElementClass` 一遍」）是这层的核心不变量，一并搬过去。

### 5.2 `source-style.ts` —— 原样搬迁

`componentStyle(name)` 与 glob（`'@src/workspaces/*/components/*/style.{css,scss}'`，`?inline`）都不变。

### 5.3 `mount/VueMount.vue` / `mount/ReactMount.vue` —— 只改相对 import

两处 `import { componentStyle } from './source-style'` 改为 `'../source-style'`。其余（attachShadow、注入 `componentStyle(name)`、`EW_EMIT_KEY` / `EwEmitContext.Provider`）一字不动。

Props 契约不变：`{ name, component, propsData, onEvent }`。

### 5.4 `component-index.ts` —— 新

把 `ComponentDemo.vue` 里现在内联的三段 glob 查询收敛到一处：

```ts
export interface ComponentEntry {
  name: string
  workspace: string
  framework: 'vue' | 'react'
  meta: ComponentMeta | undefined
  source: unknown
}

export const components: ComponentEntry[]
export function componentByName(name: string): ComponentEntry | undefined
export function groupByWorkspace(): Array<{ id: string; title: string; items: ComponentEntry[] }>
```

- meta：`import.meta.glob('@src/workspaces/*/components/*/meta.ts', { eager: true })`
- 源码：`import.meta.glob('@src/workspaces/*/components/*/Component.{vue,tsx}', { eager: true })`
- 空间标题：`import.meta.glob('@src/workspaces/*/workspace.ts', { eager: true })`，读不到就回落目录名

glob 的 key 形状（别名前缀 / 绝对路径）是实现细节，沿用现有做法，只取倒数第几段目录名：

- 组件级 glob 的 key 形如 `…/workspaces/<空间>/components/<组件>/meta.ts` → `split('/').at(-2)` 是组件名、`at(-4)` 是空间名。
- 空间级 glob 的 key 形如 `…/workspaces/<空间>/workspace.ts` → `at(-2)` 就是空间名。

两种 key 形状（别名前缀与相对路径）下标一致，因为 `workspaces/<空间>/…` 这一段的相对位置不变。

`components` 按组件名排序（组件名全局唯一，由构建期强制）。

### 5.5 `preview-state.ts` —— 新

```ts
export function usePropControls(meta: Ref<ComponentMeta | undefined>): {
  propDefs: ComputedRef<Array<[string, PropDefinition]>>
  values: Record<string, string>            // text / number 输入框的绑定值
  booleanValues: Record<string, boolean>    // checkbox 的绑定值
  model: ComputedRef<Record<string, unknown>>   // 交给组件的那份值
}

export function useEventLog(eventNames: Ref<string[] | undefined>): {
  entries: Ref<Array<{ name: string; detail: unknown; at: string }>>
  log(name: string, detail: unknown): void
  wcHandlers: ComputedRef<Record<string, (e: Event) => void>>
}
```

**`model` 取代现有的 `propsData` 与 `wcProps` 两份实现**——它们的内容逐字相同，只是分别喂给源码模式与 WC 模式。合并成一份后，那条注释（为什么必须已定型：Vue 对自定义元素里「已定义的属性」走 property 通道，传 `''` 表示布尔为真会因 Boolean prop 转换直接失效）只需要维护一处。

定型规则保持现状：`boolean` → 真布尔、`number` → `Number(v || 0)`、其余原样。

`initValue` 的「已存在就不覆盖」语义保持：切换组件回来时不丢用户改过的值。

`wcHandlers` 按 `meta.events` 生成 `{ 'ew-<name>': handler }`，handler 从 `CustomEvent` 取 `detail` 交给 `log`。这就是「事件改动态」——WC 模式不再写死 `@ew-select`，声明在 `meta.events` 里的事件都能收到。（源码模式本来就走 `EW_EMIT_KEY` / Context，与事件名无关。）

`preview-state.ts` **不得** import `component-index.ts`：后者带 `import.meta.glob`，会把单测拖进 Vite 环境。本模块只接受 meta 作为入参，因此可以在 jsdom 里直接测。

### 5.6 文档站侧的改动

- `docs/.vitepress/config.mts`：加 `@devtools` 别名（`resolve(rootDir, 'devtools/shared')`），`wcModePlugin` 的 import 改为**相对路径** `../../devtools/shared/wc-mode` —— 不能用别名，原因见 7.1。
- `docs/.vitepress/theme/components/ComponentDemo.vue`：内联 glob 与 `propsData`/`wcProps` 改为引 `@devtools/component-index` 与 `@devtools/preview-state`；`@ew-select` 改为 `v-on="wcHandlers"`；`VueMount`/`ReactMount` 的 import 指向 `@devtools/mount/*`。**面板模板与 `--vp-*` 样式不动。**
- `ComponentPreview.vue`、`ComponentDetail.vue`、其余 theme 文件不动。

## 6. 调试页形态

### 6.1 布局

```
┌──────────┬────────────────────────────────────────────┬──────────┐
│ 组件列表  │ 顶栏：模式 · 预设 · 撑满 · 宽×高            │ 属性面板  │
│ (按空间   ├────────────────────────────────────────────┤          │
│  分组)    │                                            │──────────│
│          │         resize 容器（居中，可滚动）          │ 事件日志  │
│ 220px    │                             ◢ 右/下拖拽把手   │  280px   │
└──────────┴────────────────────────────────────────────┴──────────┘
```

根容器 `height: 100dvh`、`display: flex`；主区 `flex: 1` + `min-width: 0`。左右两栏固定宽、各自内部滚动。空白区域（主区除舞台外的部分）是中性底色，舞台用 `var(--ew-color-bg)` + `var(--ew-color-text)`——组件配色基于浅色，跟随系统深色会让它深字压深底，这条与文档站的 `.canvas` 是同一个理由。

### 6.2 resize

状态：`width: number | 'fill'`、`height: number`（px）。

- **预设**：375 / 768 / 1024 设为对应 px；**铺满**设为 `'fill'`（`width: 100%`）。
- **拖拽**：`ResizeHandle` 两条，右侧改宽、底部改高（各自一个角把手也可以，本次两条直角边即可）。用 `pointerdown` + `setPointerCapture` + `pointermove`/`pointerup`。
  - 把手 `position: absolute` 贴在容器边缘外侧、`touch-action: none`、光标 `ew-resize`/`ns-resize`。放在**边缘上而非内容里**，是因为组件可能吞掉 pointer 事件（有的组件自己会捕获拖拽）。
  - 在 `'fill'` 状态下拖右侧把手，含义是「改成显式 px 宽」：以当前实际像素宽为起点。
  - 最小尺寸钳制（如 120 × 80），避免拖成 0 之后把手不可见、拖不回来。
- **读数**：容器上挂 `ResizeObserver`，显示**实测**宽高而非状态值——`'fill'` 与钳制都会让状态与真实值不一致，读数要反映组件真正拿到的尺寸。
- **撑满开关**（默认开）：给渲染目标打内联 `display: block; width: 100%`。
  - 为什么需要：组件的 `:host` 是 `display: inline-block`（脚手架生成），不撑满的话它按内容收缩，**把容器宽度改成 375px 对组件毫无作用**，自适应调试就失去意义。
  - 为什么用内联样式：宿主元素上，外部文档的普通声明优先级高于 shadow tree 里的 `:host` 规则，所以内联 `width: 100%` 能压过 `:host { display: inline-block }`。
  - 关掉它就回到「按内容收缩」，用于观察组件自身尺寸。

### 6.3 双模式

与文档站一致：默认 `wc`。切换时 `virtual:ew-wc-index` 按需 import，`customElements.get(tag)` 已注册则跳过——这条去重是跨 bundle 场景下唯一有效的防线（`customElements.define` 同 tag 重复注册直接抛错）。

WC 模式挂 `v-on="wcHandlers"`；源码模式按 `framework` 走 `VueMount` / `ReactMount`，`model` 作为 `propsData` 传入。

**没有 SSR**：调试页是纯客户端 Vite 应用，`onMounted` 之类的时序约束（`<ClientOnly>`、不能在 `watch(immediate)` 里注册）在调试页不存在。注册时机仍然放在挂载之后，但这是本能写法，不是为了绕 SSR。

### 6.4 持久化

选中组件、模式、宽高、撑满开关存 `localStorage`（`ew-debug:*` 前缀），下次打开回到上次的状态。读不到 / 解析失败就回落默认值——调试点坏了不该打不开页面。

## 7. 装配与配置

### 7.1 `devtools/vite.config.ts`

```ts
export default defineConfig({
  resolve: { alias: { '@src': ..., '@devtools': ... } },
  css: { preprocessorOptions: { scss: { loadPaths: [workspacesDir], includePaths: [workspacesDir] } } },
  plugins: [
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('ew-') } } }),
    react(),
    tailwind(),
    wcModePlugin(workspacesDir),
  ],
  server: { port: 5273, strictPort: true },
})
```

**`@devtools` 这个别名有两副面孔，别搞混：**

- 在**被 Vite 处理的应用代码**里（`devtools/src/**`、`devtools/shared/**`、`docs/.vitepress/theme/**`）走 `resolve.alias`，`@devtools/*` 正常可用。
- 在**配置文件的自身 import** 里不可用。VitePress 用 esbuild 把 `config.mts` 打成一个独立临时模块，其中裸模块说明符一律标记为 external，再由 Node 从 `node_modules` 解析 —— 既不认 tsconfig `paths`，也不认 `resolve.alias`（别名只作用于配置加载**之后**的内容构建）。所以要引共享层时写相对路径，和同文件里已有的 `./workspaces` 一样。`devtools/vite.config.ts` 是普通 Vite 配置（自己就是 Vite 入口），不受这条限制，但那份也照相对路径写，保持一致。

**五件套一件都不能少**（`@src` 别名、两个 glob 的解析、scss 的 `loadPaths` + `includePaths`、`wcModePlugin`、`isCustomElement`）：

- 别名少一个，`import.meta.glob('@src/...')` 直接匹配不到文件——**且不报错**，只是列表为空。
- **scss 两个键都要写**：本仓库 Vite 两代并存（根构建 Vite 7 走现代 API 认 `loadPaths`，VitePress 1.6 内嵌 Vite 5 走旧 API 只认 `includePaths`），旧 API 收到 `loadPaths` 会当没看见。组件的 `@use '<空间>/styles'` 少一条键就解析失败。
- `isCustomElement` 少了，Vue 会把 `<ew-*>` 当未知组件报警告，devtools 面板里的组件反而渲染不出来。
- `wcModePlugin` 少了，WC 模式 import 虚拟模块直接失败。

### 7.2 端口

| 用途 | 端口 | 策略 |
|---|---|---|
| 调试页（人用，`pnpm dev`） | 5273 | `strictPort: true` |
| 调试页（e2e） | 5274 | `strictPort: true` |
| 文档站（`pnpm docs:dev`） | 5173 | `strictPort: true`（新增） |
| e2e 静态服务器 | 4173 | 不变 |

**为什么要 `strictPort`**：这个仓库已经两次被「端口不等于自己的进程」带偏——e2e 的 4173 被残留服务复用导致 8 个用例全红、看起来像构建坏了；`vitepress dev` 在 5173 被占时**静默顺延**到 5174/5175，探默认端口打到的是别人的旧服务，一度以为是 dev 与 build 的配置分叉。`strictPort` 把「静默换端口」变成「启动即报错」。

**e2e 为什么另用 5274**：这样 `pnpm run verify` 不会和开发者开着的 `pnpm dev`（5273）打架。e2e 的 webServer 用 `reuseExistingServer: false`——它必须是自己起的那一个，复用任何 5274 上的残留进程都会把假红重新引进来。

### 7.3 根 `package.json` 脚本

```jsonc
"dev": "vite devtools",              // 改：原来是 vitepress dev docs
"docs:dev": "vitepress dev docs",    // 不变
```

### 7.4 `tsconfig.json`

- `include` 加 `"devtools"`（现在是 `["*.config.ts", "src", "docs", "tests", "scripts", "packages"]`）——新顶层目录不加进去，`pnpm run typecheck` 就管不到它。
- `paths` 加 `"@devtools/*": ["./devtools/shared/*"]`。

`src/env.d.ts` 已有的 `declare module 'virtual:ew-wc-index'` 与 `*.vue` shim 是全局声明，调试页直接受益，不用新增。

### 7.5 tokens

`devtools/src/main.ts` 引 `@src/tokens/tokens.css`。调试页外壳只用 `--ew-*`，不引 `docs/.vitepress/theme/custom.css`（那是 `--vp-*` → `--ew-*` 的重映射，只在 VitePress 里有意义）。

## 8. 数据流

```
                   ┌────────────────────────────────┐
meta.ts ──┐        │  component-index.ts  (glob)    │
Component.{vue,tsx} ─┼─► components[] ──► ComponentPicker（左栏）
workspace.ts ─┘     └────────────────────────────────┘
                                  │ 选中
                                  ▼
                          usePropControls(meta)
                                  │
                 ┌────────────────┴────────────────┐
                 │ model（已定型的值）              │ propDefs
                 ▼                                 ▼
          DebugStage（wc / source）            PropPanel
                 │                                 │ 输入
                 │                                 └─► values / booleanValues
                 ▼
        ┌── wc ──────► <component :is="tag" v-bind="model" v-on="wcHandlers">
        └── source ──► VueMount / ReactMount（--propsData="model"）

  组件 emit ──► wcHandlers（WC） / onEvent（源码）──► useEventLog.entries ──► EventLog
```

## 9. 测试与验证

| 层 | 内容 |
|---|---|
| `typecheck` | `include` 加上 `devtools` 后，`vue-tsc` 覆盖调试页与共享层 |
| 单测 | 新增 `tests/devtools/preview-state.test.ts` |
| `docs:build` | **重构文档站的唯一防线**（e2e 覆盖不到文档站；`ComponentDemo` 被改成引共享层，只有这条能抓到破坏） |
| `build` / `check:artifacts` | 不受影响，应与基线同量级 |
| e2e | 新增 1 条调试页冒烟（见下） |

**`preview-state.test.ts` 覆盖**（这是共享层里唯一有分支逻辑的代码）：

1. 定型：`boolean` 得到真布尔、`number` 得到 `Number()` 结果（含 `'' → 0`）、其余原样。
2. `default` 回填：首帧 `model` 就是声明里的默认值。
3. 已存在不覆盖：改过值之后再触发一次 `propDefs` 变化，用户改的值不被重置。
4. `wcHandlers` 的键：`events: ['select', 'change']` 生成 `ew-select` / `ew-change`，handler 从 `CustomEvent.detail` 取到值。

测试文件用**相对路径** import `../../devtools/shared/preview-state`——`vitest.config.ts` 里没有 `@devtools` 别名，为一条测试去新增别名不划算。

**e2e 冒烟**（新增 `tests/e2e/debug-page.spec.ts`）：

`playwright.config.ts` 的 `webServer` 由单个对象改为**数组**，加一条起调试页 dev server（5274，`strictPort`，`reuseExistingServer: false`）。全局 `baseURL` 仍指向 4173 的静态服务器，因此本用例要**写绝对地址** `http://localhost:5274/`，不要依赖 `baseURL`。

1. 打开 `http://localhost:5274/`，左栏选中 `hello-vue`，断言页面里存在 `ew-hello-vue` 且 `shadowRoot` 非空（WC 模式真的走了真实路径，而不是渲染了个空标签）。
2. 点预设 `375`，断言舞台容器实测宽度为 375。
3. 切到源码模式，断言舞台内仍有渲染内容（源码模式的挂载链路可用）。

## 10. 风险

| 风险 | 应对 |
|---|---|
| `import.meta.glob` 在文档站（root = `docs/`）里匹配 `docs/` 之外的 `src/` — 这是把 glob 从文档站内部搬到 `devtools/shared/` 新增的不确定性 | 第一步就先做「搬迁 + 文档站改 import」，以 `pnpm run docs:build` 绿为准再往下走。glob 解析到的是绝对路径，预期无碍；真有 root 限制就在这里暴露，代价最小 |
| `docs/.vitepress/config.mts` 自身 import 共享层时用别名 → `docs:build` 直接失败（`ERR_MODULE_NOT_FOUND`） | **已实测命中。** VitePress 把 config 单独打成一个 esbuild 临时模块，裸说明符一律 external 交给 Node 从 `node_modules` 解析，`resolve.alias` 与 tsconfig `paths` 都够不着。修法是写相对路径（见 5.6 / 7.1） |
| 重构 `ComponentDemo.vue` 打断文档站 | `docs:build`（SSR）+ `typecheck` 覆盖；e2e 覆盖不到，所以改完必须手工打开 `pnpm docs:dev` 看一眼 demo 页两模式外观仍正常 |
| 拖拽把手被组件吞事件 | 把手贴在容器边缘外侧而非内容区；`setPointerCapture` 兜住移出容器的移动 |
| 端口 5273/5173 被残留进程占住 | `strictPort: true` → 启动即报错，不再静默顺延 |
| `--vp-*` 变量在调试页未定义导致外壳样式塌掉 | 调试页外壳只用 `--ew-*`；`ComponentDemo.vue` 的 `--vp-*` 样式不搬 |

## 11. 验收

- `pnpm dev` 打开调试页，`pnpm docs:dev` 打开文档站，两者互不影响。
- 左栏能列出全部工作空间的全部组件；选中后主区只渲染它，默认 WC 模式。
- 四个预设与两条拖拽把手的宽高都对，读数反映实测值；关掉「撑满」后组件按内容收缩。
- 属性面板按 `meta.props` 渲染三种控件，改动实时反映到组件；事件日志收到 `meta.events` 里声明的任意事件（不再只有 `ew-select`）。
- `pnpm run verify` 全链绿：`typecheck` → `test`（净增 4 个用例）→ `build` → `check:artifacts` → `docs:build` → `test:e2e`（净增 1 个）。
- 构建产物体积与既有基线持平（本次不改构建管线与组件源码）。
