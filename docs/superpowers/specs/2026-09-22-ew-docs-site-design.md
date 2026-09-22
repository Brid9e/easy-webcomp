# easy-webcomp 文档站（VitePress）设计文档

## 1. 一句话定义

把一期的自研 playground 升级为 VitePress 文档站：每个组件一个 markdown 页，手写使用说明 + 内嵌实时交互面板；组件的发现、导航、属性表单仍由 `meta.ts` 驱动，加组件保持零配置。

## 2. 背景与动机

一期做出了 `playground/` —— 一个手写的 Vite + Vue 单页预览站（`App.vue` 导航 + `ComponentPage.vue` 属性面板/事件日志/模式开关 + `plugins/wc-mode.ts` 虚拟模块）。它能工作，但它是一次性的调试台，不是交付物：

- 没有散文，只有控件。组件该怎么用、边界条件在哪，无处可写。
- 导航、主题、搜索、布局全要自己维护。
- 一期 spec 第 11 节把「不做文档站」列为非目标，理由是当时组件只有两个、契约已由 e2e 覆盖。现在这个理由不再成立——组件数量要涨，而文档是消费方唯一的入口。

本设计**推翻**该非目标。

## 3. 非目标（YAGNI）

- **不做 props 文档表格的自动生成**（从 `meta.ts` 渲染一张只读属性表）。一期 spec 已把「从源码注释提取文档」列为非目标，本设计延续；但交互面板本身就是 `meta.ts` 驱动的，属性表的信息在那里已经能改能看。等真有消费方抱怨再补。
- **不做多语言、版本化文档、博客**。
- **不做部署**。本设计只保证 `vitepress build` 能产出静态站；发布到哪台机器不在范围内。
- **不实现工作空间**。见第 13 节——本设计只预留接缝，不提前实现。

## 4. 目录结构

`docs/` 直接作为站点根，`docs/superpowers/` 用 `srcExclude` 排除。

```
docs/
├── .vitepress/
│   ├── config.mts                  # nav / sidebar / srcExclude / vite 插件
│   ├── components.ts               # 扫 src/components —— 站点侧唯一数据源
│   ├── plugins/
│   │   └── wc-mode.ts              # 从 playground/plugins/ 搬来
│   └── theme/
│       ├── index.ts                # 扩展默认主题 + 全局注册
│       ├── custom.css
│       └── components/
│           ├── ComponentDemo.vue   # 原 ComponentPage.vue，去掉 h1/tag 行
│           ├── ComponentOverview.vue  # 兜底总览页的正文
│           ├── VueMount.vue        # 原样搬
│           ├── ReactMount.vue      # 原样搬
│           └── source-style.ts     # 原样搬
├── index.md                        # 首页
├── guide/
│   ├── index.md                    # 快速开始
│   ├── authoring.md                # 新增一个组件
│   ├── theming.md                  # 主题与 token
│   └── build.md                    # 构建与产物
├── components/
│   ├── index.md                    # 组件总览 = 兜底裸预览页
│   ├── hello-vue.md                # 手写
│   └── hello-react.md              # 手写
└── superpowers/                    # 内部设计文档，被 srcExclude 排除
```

**删除**：`playground/`、`vite.playground.config.ts`。

**为什么用 `docs/` 而不是另起 `site/`**：VitePress 的默认约定（`docs/.vitepress`、`docs/public`、各部署平台的默认预设）都指向 `docs/`。把内部设计文档隔在站点之外，`srcExclude: ['superpowers/**']` 一行就够，不值得为它换掉整个目录约定。

## 5. 组件发现：唯一数据源

一期里「扫组件目录」这件事写在四个地方（`App.vue` 的 glob、`ComponentPage.vue` 的 glob、`wc-mode.ts` 的 readdir、`scripts/build.ts` 的 readdir）。

文档站侧收敛成 `docs/.vitepress/components.ts`，导出：

```ts
export interface ComponentInfo {
  name: string                    // 目录名，如 'hello-vue'
  framework: 'vue' | 'react'
  documented: boolean             // docs/components/<name>.md 是否存在
}

export function listComponents(): ComponentInfo[]
```

判定规则（与 `scripts/build.ts` 一致）：目录下 `Component.vue` 与 `Component.tsx` **必须且只能有一个**，两个都有或都没有即抛错。

**`scripts/build.ts` 不改成引用它。** 构建脚本属于产物管线，不应反向依赖文档站——文档站删掉时构建必须照常工作。两边各扫各的，共享的是目录约定而非代码。

**站点内仍有第二处枚举**：`ComponentOverview.vue`（第 6.3 节）用 `import.meta.glob` 拿组件的**模块**。这不是重复——Node 侧扫描只能拿到目录结构（sidebar 需要它），Vite 侧 glob 才能拿到可渲染的组件模块。两者职责不同，各自做只有它能做的事。

## 6. 页面类型

### 6.1 首页 `docs/index.md`

VitePress 默认主题的 hero + features 布局。四个 feature 卡片：Vue 或 React 任选、产出自包含 Web Component、npm 与 CDN 双通道、`meta.ts` 驱动零配置。按钮指向 `/guide/`。

**feature 文案里的尖括号必须写成 HTML 实体**（实施期间实测纠正）：`details` 走 `v-html` 且**不经 markdown**（反引号会原样显示出来），裸的 `<script>` 会作为真脚本元素进入构建产物的 HTML，浏览器随即把它后面的文档——包括 `__VP_SITE_DATA__` 脚本——全部吞进该脚本体内，客户端初始化 `SyntaxError`、整站不可用。dev 下首页由客户端渲染，看不到这个问题，只有对 SSG 产物做浏览器验证才会暴露。因此写 `&lt;script&gt;`、`&lt;ew-*&gt;`。

### 6.2 指南 `docs/guide/`

四页手写散文，内容从一期 README 改写而来：

| 页面 | 内容 |
|---|---|
| `index.md` | 快速开始：安装、`pnpm run dev`、两种模式各是什么 |
| `authoring.md` | 新增组件：五个文件各自的职责、`meta.ts` 契约、`useEmit()` |
| `theming.md` | `--ew-*` 换肤、`:host` 陷阱、`disable-shadow` 降级 |
| `build.md` | ESM / CDN 产物矩阵、`exports` 自动生成、体积基线 |

### 6.3 组件页 `docs/components/`

**手写页** `docs/components/<name>.md`：

```md
# hello-vue

给 Vue 3 写的问候组件。点击按钮会派发 `ew-select` 事件。

<ComponentDemo name="hello-vue" />

## 用法

...

## 属性

...
```

`<ComponentDemo>` 已在主题里全局注册，md 里直接用，不需要 `import`。

**兜底页** `docs/components/index.md` 是「组件总览」：内容只有一行 `<ComponentOverview />`。`ComponentOverview.vue` 用 `import.meta.glob` 枚举所有组件，为每个渲染一块 `ComponentDemo`，并带上锚点 `id="<name>"`。

**侧边栏**：写了 md 的组件 → `/components/<name>`；没写的 → `/components/#<name>`。这样加组件的人不写文档也不会让组件在导航里消失，散文可以渐进补。

## 7. 交互面板 `ComponentDemo.vue`

从 `ComponentPage.vue` 改造，**删除 h1 与 tag 行**（这两样由 md 提供），只保留三块：

1. 属性表单 —— 由 `meta.ts` 的 `props` 驱动，按 `type` 渲染 text / number / checkbox
2. 预览 —— 双模式（源码模式 / WC 模式），带模式开关
3. 事件日志 —— 实时打印冒泡出来的 `CustomEvent`

**默认模式改为 WC 模式**。一期默认源码模式，因为那时读者是组件作者；文档站的读者是组件消费者，WC 才是他们实际拿到的东西。源码模式保留为可切换项，供作者调试。

组件名通过 `name` prop 传入。meta 与组件模块都由 `import.meta.glob` 取——与一期相同的做法，只是 glob 的基路径改用 `@src` 别名（第 10 节）。

**SSR 保护内置在组件里**：`ComponentDemo.vue` 的模板根部裹 `<ClientOnly>`。这样 md 作者不用记得加，写 `<ComponentDemo name="x" />` 就是安全的。代价是静态 HTML 里面板区域为空，客户端接管后出现（第 8 节）。

**但 `<ClientOnly>` 挡的只是它 slot 里的内容**（实施期间实测纠正）：`ComponentDemo` 自身的 `setup` 在 SSR 期照样执行，被挡住的只有 `VueMount` / `ReactMount` / `<ew-*>` 那棵子树。因此本组件的 `setup` 里不能碰 DOM、不能 import 桥接层——**WC 的注册必须挂在 `onMounted` 上，不能用 `watch(..., { immediate: true })`**。这不是风格偏好：`immediate` 会在 Node 里动态 import 到 `virtual:ew-wc-index`，而它在**模块顶层**求值 `class EwElement extends HTMLElement`，构建直接以 `HTMLElement is not defined` 失败。同一道理适用于日后任何往面板里加的东西。

**面板走 property 通道**（实施期间实测纠正）：Vue 给自定义元素打 `v-bind` 时，只要 key 在元素上存在已定义的属性就走 property 而非 attribute——而桥接层给每个声明过的 prop 都装了 accessor。所以面板传的值必须是**已定型的**：`count` 传 `'7'` 会原样落进组件并触发 Vue 的 prop 类型警告，`autoLoad` 传 `''` 表示真更是直接失效（Vue 的 Boolean prop 转换把 `''` 一律当 `false`）。这一条同时修掉了一期 playground 里一直存在、但没有任何测试覆盖到的同类缺陷。

## 8. SSR 约束

VitePress 默认 SSG：每个 md 页在构建期于 Node 里渲染一次。`HTMLElement`、`customElements`、`attachShadow`、`document` 在 Node 里都不存在。

最直接的雷：`src/runtime/element.ts` 的 `createElementClass` 内部有 `class EwElement extends HTMLElement`，**模块顶层求值**时会立刻抛 `HTMLElement is not defined`。任何在 SSR 期 import 到它的路径都会炸。

处理方式：

- **`ComponentDemo.vue` 根部裹 `<ClientOnly>`** —— SSR 阶段面板那棵子树不渲染。但注意它挡不住 `ComponentDemo` 自己的 `setup`（见第 7 节的实测纠正）：`setup` 里只能做纯计算，任何 DOM 访问与桥接层 import 都必须等到 `onMounted`。
- **`virtual:ew-wc/*` 天然安全** —— 它只在 `enableWc()` 里被动态 `import()`，而 `enableWc()` 由 `onMounted` 触发，SSR 期不会走到。**若改用 `watch(..., { immediate: true })`，这道保险立刻失效** —— 实测就是这样炸的。
- **布局档位**：md 页在 `<ClientOnly>` 里渲染的默认槽是空的，所以面板高度在 hydration 前为 0，接管的瞬间会跳一下。可接受（文档站的 demo 区域本就不参与首屏布局）；如果实测难看到无法忍受，再给面板加 `min-height` 占位。

**验证手段**：`pnpm run docs:build` 必须在 CI 意义上稳定通过。这是唯一能防住「哪天有人在面板外碰了 `document`」的关卡，因此纳入 `pnpm run verify`（第 12 节）。

## 9. 主题与 token

`docs/.vitepress/theme/index.ts`：

```ts
import DefaultTheme from 'vitepress/theme'
import ComponentDemo from './components/ComponentDemo.vue'
import ComponentOverview from './components/ComponentOverview.vue'
import './custom.css'
import '@src/tokens/tokens.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ComponentDemo', ComponentDemo)
    app.component('ComponentOverview', ComponentOverview)
  },
}
```

`tokens.css` 必须在这里引入——站点自己的 UI 也用 `var(--ew-*)`，不引入的话侧边栏、正文的字体颜色全空。

`custom.css` 覆盖 VitePress 默认主题的 `--vp-c-brand-*` 到我们的主色，让文档站与组件视觉一致。

**把 `--ew-*` 映射到 `--vp-c-*`**，而不是反过来：token 是一等公民（消费方也要用），VitePress 的变量是文档站私有的皮肤。

## 10. VitePress 配置要点

```ts
// docs/.vitepress/config.mts
export default defineConfig({
  title: 'easy-webcomp',
  srcExclude: ['superpowers/**'],
  vite: {
    resolve: { alias: { '@src': resolve(rootDir, 'src') } },
    plugins: [wcModePlugin(resolve(rootDir, 'src/components'))],
  },
  themeConfig: {
    nav: [...],
    sidebar: { '/guide/': [...], '/components/': buildComponentSidebar() },
  },
})
```

三处必须这样写：

- **`srcExclude` 排除 `superpowers/`** —— 否则内部设计文档会被当成页面发布出去。
- **加 `@src` 别名**。文档站的目录比 playground 深（主题组件在 `docs/.vitepress/theme/components/`），相对路径要写到 `../../../../src/`。别名一次解决，也让搬过来的文件不必逐个改相对层级。
- **`wcModePlugin` 里生成的 import 仍用绝对路径**（一期已如此）。VitePress 的 Vite root 是 `docs/`，写 `/src/...` 会被解析成 `docs/src/...`；绝对路径是唯一稳妥的写法。这与 `@src` 别名不冲突：插件生成的是字符串代码，别名只服务于手写文件。

**注意有两份 Vite**：VitePress 1.6.4 内部绑 Vite 5，仓库根是 Vite 7。pnpm 隔离，互不干扰；但 `@vitejs/plugin-react@4.7.0` 会被装进 VitePress 的 Vite 5，需实测（第 14 节）。

**不设 `cleanUrls`，站内链接一律带 `.html`**（实施期间实测）：VitePress 1.6.4 的 `cleanUrls` 默认为 `false`（源码 `cleanUrls: !!userConfig.cleanUrls`），生成 `/components/hello-vue.html` 这类链接。这是能落到任何静态托管的形态，不引入「服务器要不要做 rewrite」这一层部署依赖，所以保持默认。

## 11. 与一期 playground 的迁移关系

| 一期文件 | 去向 |
|---|---|
| `playground/plugins/wc-mode.ts` | → `docs/.vitepress/plugins/wc-mode.ts`，逻辑不变 |
| `playground/renderers/VueMount.vue` | → `docs/.vitepress/theme/components/`，改 `@src` 别名 |
| `playground/renderers/ReactMount.vue` | 同上 |
| `playground/renderers/source-style.ts` | 同上 |
| `playground/ComponentPage.vue` | → `ComponentDemo.vue`，删 h1/tag、默认模式改 WC、裹 `ClientOnly` |
| `playground/App.vue` | 删除，导航交给 VitePress |
| `playground/index.html`、`main.ts` | 删除，VitePress 接管 |
| `vite.playground.config.ts` | 删除，配置进 `config.mts` |

`isCustomElement: (tag) => tag.startsWith('ew-')` 的配置**必须带到 `config.mts`** —— 漏了 Vue 会把 `<ew-hello-vue>` 当成未注册的 Vue 组件，每次渲染打一条 "Failed to resolve component" 警告。

**组件与运行时不改**：`src/` 下一行不动。这是本设计成立的前提——文档站是 `src/` 的消费者，不是它的改造者。

## 12. 验证方式

`package.json` 脚本：

```json
"dev": "vitepress dev docs",
"docs:dev": "vitepress dev docs",
"docs:build": "vitepress build docs",
"docs:preview": "vitepress preview docs"
```

`verify` 追加 `docs:build`：

```
typecheck && test && build && docs:build && test:e2e
```

`docs:build` 放在 `build` 之后、`test:e2e` 之前。它慢，但它是 SSR 问题的唯一防线。

`tsconfig.json` 的 `include` 追加 `docs`，让主题组件与 `.vitepress` 配置进 typecheck。

**验收标准（逐条可验证）**：

1. `pnpm run verify` 五项全绿。
2. `pnpm run docs:build` 产出 `docs/.vitepress/dist/`，其中**不含** `superpowers/` 下的任何页面。
3. `pnpm run dev` 起站，浏览器确认：
   - 首页正常渲染，四个 feature 卡片可点
   - 侧边栏「组件」分组里 `hello-vue`、`hello-react` 都在
   - 进入 `hello-vue` 页，散文与交互面板都在
   - 面板默认是 **WC 模式**，改属性实时生效，点击派发 `ew-select` 并出现在事件日志
   - 切到源码模式，行为一致
4. 编辑 `src/components/hello-vue/Component.vue` 的文案，两种模式下**都不刷新整页**且文案更新。
5. 新建一个临时组件目录（只有五个文件、不写 md），重启 dev：它出现在侧边栏且链接指向 `/components/#<name>`，总览页能看到它的面板。验证完删除。

## 13. 为工作空间预留的接缝

用户已确定**工作空间是文件组织单位**（暂定形如 `src/workspaces/<ws>/components/`），且每个工作空间自带组件 API 配置与全局参数管理。它会在文档站之后实现，本设计不提前实现，但明确会受影响的四处：

| 位置 | 届时怎么改 |
|---|---|
| `docs/.vitepress/components.ts` | 从「扫一个目录」改成「扫工作空间，再扫各自组件」，返回结构多一层 |
| `config.mts` 的 `buildComponentSidebar()` | 侧边栏多一层「工作空间 → 组件」分组 |
| `plugins/wc-mode.ts` | 虚拟模块 id 从 `virtual:ew-wc/<name>` 变成 `virtual:ew-wc/<ws>/<name>` |
| `docs/components/*.md` | 可能挪到 `docs/workspaces/<ws>/components/` |

**不受影响**：`VueMount.vue`、`ReactMount.vue`、`source-style.ts`、`ComponentDemo.vue` 的渲染逻辑，以及 `src/runtime/` 全部。也就是说工作空间的迁移是「换个扫描层 + 加一层导航分组」，不是重写。

**为什么仍先做文档站**：接缝是薄的且已隔离；工作空间的设计尚未产出。反过来先做工作空间，文档站要无限期等待。

## 14. 已知风险

1. **`@vitejs/plugin-react@4.7.0` 装进 VitePress 内部的 Vite 5 是否能跑**。两者跨大版本。缓解：实施第一步就是「装上 VitePress、把 React 组件渲染出来」的最小验证；若冲突，退路是升级 `@vitejs/plugin-react` 到 5.x，或给 VitePress 单独指定插件版本。
2. **不用 VitePress 2.0.0-alpha**。它配 Vite 7 更顺，但 alpha 不适合做项目骨架。等它发 stable 再评估。
3. **`<ClientOnly>` 导致面板在静态 HTML 里为空**。已知且接受（第 8 节）；若首屏跳动难看，给面板加 `min-height`。
4. **两份 Vite 带来的迷惑**。`scripts/build.ts` 用根目录的 Vite 7，文档站用 VitePress 的 Vite 5，日志里会同时出现两个版本号。属预期，不是错误。
5. **`srcExclude` 是唯一挡住内部文档的东西**。它有被误删的风险。缓解：验收标准第 2 条把它变成可验证项——构建产物里不能有 `superpowers/`。
