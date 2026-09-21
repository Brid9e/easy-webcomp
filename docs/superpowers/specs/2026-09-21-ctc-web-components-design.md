# ctc-web-components 设计文档

日期：2026-09-21
状态：已评审通过，待出实施计划

## 1. 一句话定义

一个**组件工厂**：开发者按自己擅长的框架（Vue 3 或 React）编写业务组件，构建管线把两者收敛成同一种交付物 —— 标准 Web Component，支持 npm ESM 引入与 CDN 单文件引入。

## 2. 核心原则

**一个组件只写一次。** 用 Vue 写还是用 React 写，是组件作者的个人选择，不是"每个组件要出两个版本"。同一仓库内可以同时存在 `.vue` 与 `.tsx` 组件，但每个组件只有一份实现。使用方对作者用了什么框架完全无感知。

这条原则带来一个直接的规模收益：**不需要跨框架一致性测试**。

## 3. 使用场景

全部为必须支持的目标场景：

| 场景 | 对设计的约束 |
|---|---|
| 嵌入客户/第三方老系统 | 强样式隔离；CDN 单文件；零配置可跑；兼容老浏览器 |
| 公司内部 Vue3 中后台 | 走 npm ESM；体积敏感；需要能贴合宿主主题 |
| 给 React 项目用 | 属性经 property 传递；事件走 addEventListener |
| 低代码 / AI 生成平台产出 | 属性驱动；`meta.ts` 自描述；可序列化 |

## 4. 非目标（YAGNI）

- 不做引用计数 / 共享依赖卸载 —— 页面级应用，不值得。
- 不做 SSR / 服务端渲染支持。
- 不做跨框架一致性测试（见第 2 节）。
- 不拆分成多个 npm 包（见第 5 节理由）。
- 不做文档站，不做 props 文档表格自动生成。playground 确实由 `meta.ts` 驱动生成**交互控件**（可改值的表单），但不做「从源码注释提取生成文档页」那类需要额外解析工具链的东西。两者不是一回事。

## 5. 仓库结构

单包 + 目录分层，不使用 pnpm workspace 拆包。

```
ctc-web-components/
├── package.json                 # 单包，多个 exports 子路径（由构建脚本生成）
├── vite.config.ts               # 库构建配置，读 mode 参数
├── vite.playground.config.ts    # playground dev 配置（含 WC 模式虚拟模块插件）
├── vitest.config.ts
├── playwright.config.ts
├── tsconfig.json
├── src/
│   ├── tokens/                  # 设计 token → CSS 变量 + TS 常量
│   ├── shared/                  # 宿主注入协议、事件常量、共享依赖注册表、工具函数
│   ├── runtime/                 # Vue/React → Web Component 桥接层
│   └── components/
│       └── <biz-name>/
│           ├── Component.vue    # 或 Component.tsx，作者自选，只写一个
│           ├── meta.ts          # 契约，必填
│           ├── style.css        # 就近样式，可选
│           ├── index.ts         # 入口：绑定 meta + 实现，导出构造器与 register()
│           └── define.ts        # 副作用入口：import 即注册（CDN 产物用）
├── playground/                  # 双模式预览站
├── scripts/build.ts             # 扫描组件目录、生成 entries、编排产物
└── docs/superpowers/specs/      # 本设计文档
```

**组件目录内的 import 一律使用相对路径，不使用 `@/` 别名** —— 保证脚本与工具链在任何时机都能解析。

**样式的唯一来源是 `style.css`，经 `?inline` 作为字符串传给桥接层。** 组件内**禁止**写 `<style>` 块 / `import './x.css'` —— 那会走框架自己的样式注入路径，与第 7.2 节的投递规则冲突。

**为什么单包**：`tokens` / `shared` / `runtime` 必须与组件**版本严格同步**（token 改了组件就得跟着发），拆包只会带来版本对齐成本。宿主若想单独使用 token，通过 exports 子路径提供 `ctc-web-components/tokens.css` 即可，无需真的拆包。

**为什么组件目录带 `meta.ts`**：加组件时**不需要修改任何构建配置或路由**。构建脚本扫描 `src/components/*/meta.ts` 自动发现，playground 同理。

## 6. 组件契约 `meta.ts`

```ts
export default defineComponentMeta({
  tag: 'ctc-biz-chart',
  shadow: true,                    // 默认 true
  shared: ['echarts'],             // 需要走全局单例的重库白名单
  props: {
    endpoint: { type: 'string', attr: 'data-endpoint' },
    autoLoad: { type: 'boolean', default: true },
  },
  events: ['load', 'select'],
})
```

**为什么必须有这个文件 —— 一次定义，三处驱动：**

1. 驱动 CE 桥接层：属性 ↔ attribute 双向映射、事件转发
2. 驱动 playground：自动生成属性控制面板，无需手写
3. 驱动产物的 `.d.ts`

没有它，这三处会各写一遍且必然漂移。

**命名约定**：tag 前缀统一 `ctc-`；attribute 使用 kebab-case；事件名由 `meta.events` 声明，最终映射为 `ctc-<name>` 形式的 DOM CustomEvent。

## 7. 桥接层 `src/runtime/`

统一入口 `defineElement(meta, impl)`，返回 CustomElement 构造器。集中处理五件易错的事：

### 7.1 框架适配（自写适配器，不用现成桥接库）

**决策：自己写 Vue / React 适配器，不使用 `defineCustomElement` 或 `@r2wc`。**

原因是规划期发现的技术冲突：

- Vue 的 `defineCustomElement` 在**构造函数内**就创建了 shadow root，而 attribute 要等到 `connectedCallback` 才能读取。这个时序意味着**第 7.2 节的 per-instance `disable-shadow` 降级无法实现** —— shadow root 已经建好了，无法撤销。
- Vue 的 `emit` 不会自动变成 DOM CustomEvent。要套用 `defineCustomElement` 就得再包一层 hack 才能拿到宿主元素去 `dispatchEvent`。
- `@r2wc` 内部同样自己管 shadow root，存在同样的冲突。

既然第 7.2 / 7.3 两条规则都要求桥接层完全掌控 shadow root 创建时机与事件派发，那正确做法就是**自写适配器**。

适配器统一接口（`ElementAdapter`）：

```ts
interface ElementAdapter {
  mount(host, props, emit): unknown
  update(instance, props): void
  unmount(instance): void
}
```

- Vue 适配器：`createApp` + `shallowRef` 装 props + render 函数内调 `getComponent()`；事件经 `provide(CTC_EMIT_KEY, emit)` 注入，组件侧用 `useEmit()` 取出。
- React 适配器：`createRoot` 挂载 + `Context.Provider` 注入 emit，组件侧用 `useEmit()` 取出。
- 两者都用**函数Getter 取组件**（而非快照），使第 7.5 节的 HMR 只需重渲染即可换掉实现。

作者侧写法完全一致：组件里调 `useEmit()('select', detail)` 即可，不需要知道桥接层怎么派发。

### 7.2 样式投递
统一为「一个 CSS 字符串 + 一个注入点」，按 `meta.shadow` 决定去处：
- shadow：`adoptedStyleSheets`
- light：注入 `<head>` 一次

**必须带 `<style>` 元素降级分支** —— `adoptedStyleSheets` 在 Safari 16.4 以下不支持，客户老系统场景一定会撞上。

### 7.3 事件转发
**声明式统一转发，不给作者自由。** 作者在组件内只管 `emit` / 调回调，桥接层按 `meta.events` 生成 CustomEvent，统一设置 `{ bubbles: true, composed: true }`。

理由：让作者手写 `dispatchEvent` 一定会有人漏 `composed: true`，而漏了它是**静默失败**（事件在 Shadow DOM 外完全收不到，不报错）。

### 7.4 属性变更（双通道）
- 标量（string / number / boolean）走 **attribute**：HTML 可声明、SSR 友好
- 对象 / 数组 / 函数只走 **property**：避免序列化损失
- property 赋值**不回写 attribute**，避免污染 DOM 与序列化损耗
- 由 `meta.props[].type` 自动决定走哪条通道
- 必须同时支持 `attributeChangedCallback` 与 property 直接赋值（React ≤18 传对象属性只能走 property）

### 7.5 HMR 友好
桥接层持有组件**引用**而非快照。`import.meta.hot.accept` 拿到新组件后：换引用 → 触发已挂载实例重渲染。

**绝不走 CE 重定义**。这是 playground WC 模式能用的前提。

## 8. 依赖共用（「依赖共用」的落地）

分三层，分别解决三类不同的重复问题。

### 8.1 框架运行时（Vue / React）
由产物模式决定：
- `self-contained`：内联进产物，接受重复
- `shared`：external 出去

**shared 模式使用 `window.Vue` / `window.React` 全局变量，不使用 import map。** 理由：import map 在不可控的老系统环境中没有保证；`window.Vue`（Vue 的 global build 包含 `defineCustomElement`）可靠得多。代价是桥接层需支持「从全局取运行时」这条分支。

### 8.2 重库白名单（echarts / three.js 等）

组件内**禁止**直接 `import echarts`，统一走：

```ts
const echarts = await useSharedDep('echarts')
```

机制：运行时把已加载的库挂到 `window.__CTC_SHARED__[name]`。任何 bundle 加载时**先查全局注册表** —— 命中直接复用，未命中才加载并登记。

**关键收益**：即使 `self-contained` 产物，一个页面放三个图表组件也只有一份 echarts 真正执行。这解决了「自包含产物必然重复依赖」这个通常无解的问题，代价只是每个产物里多一份解析壳，可忽略。

约束：
- 白名单**必须手写显式枚举**，不能靠正则匹配 `node_modules`，否则 external 列表与注册表会漂移
- 不做引用计数 / 卸载

### 8.3 设计 token

`src/tokens/` 产出 `tokens.css`（`:root { --ctc-color-primary: ... }`）与 `tokens.ts`。

选 CSS 自定义属性做主题机制，是因为**它能穿透 Shadow DOM 边界**（靠继承而非选择器匹配）。宿主换肤只需覆盖 `--ctc-*`，无需逐个 `::part()` 暴露。这使 shadow 方案能同时满足「强隔离」与「可定制」。

**兜底值必须写在 `var()` 的第二个参数里，不能写在 `:host` 上。**

```css
/* 正确 */
color: var(--ctc-color-primary, #1677ff);

/* 错误 —— 会反杀宿主换肤 */
:host { --ctc-color-primary: #1677ff; }
```

原因：Shadow DOM 内 `:host` 上的声明，优先级高于从宿主继承来的值。`:host` 兜底会覆盖宿主设置，导致换肤失效，且组件单独看完全正常，非常隐蔽。

## 9. 宿主注入协议（网络 / 登录态 / i18n）

组件不能写死请求方式，否则嵌进客户系统读不到登录态。三级兜底，就近优先：

1. **就近**：`<ctc-provider>` 包裹 —— 作用域隔离，同页多实例可用不同上下文
2. **全局**：`window.__CTC_HOST__ = { request, getToken, locale, theme }`
3. **兜底**：组件自身属性

`request` 是一个 `(url, options) => Promise<any>` 适配器。宿主把 axios / fetch 包一层传进来，组件完全不知道宿主用什么 HTTP 库，且天然带上宿主的登录态与拦截器。

组件内通过 `useHost()` 统一读取，不感知三级来源。

## 10. 产物矩阵

| 模式 | 粒度 | 路径 | 语义 |
|---|---|---|---|
| self-contained | 单组件 ESM | `dist/esm/<name>.js` | 内联运行时，**只 export，不 auto-define** |
| self-contained | 单组件 IIFE | `dist/cdn/<name>.js` | 内联运行时，**引入即 auto-define** |
| self-contained | 全量 | `dist/index.js` / `dist/ctc-all.iife.js` | 全组件 |
| shared | 单组件 ESM | `dist/esm-shared/<name>.js` | 运行时 external，只 export |
| shared | 单组件 IIFE | `dist/cdn-shared/<name>.js` | 运行时 external，引入即注册 |
| shared | 全量 | `dist/esm-shared/index.js` / `dist/cdn-shared/ctc-all.iife.js` | 全组件 |

**ESM 与 IIFE 的语义差异是刻意的**：ESM 无副作用、tree-shake 友好，故不自动注册；CDN 场景没法写注册代码，故引入即注册。

每个组件提供两个 exports 子路径：

```
ctc-web-components/button          → export class（无副作用）
ctc-web-components/button/define   → 引入即注册（有副作用）
```

另外产出 `dist/types/*.d.ts`，由 `meta.ts` 驱动生成。

### 10.1 构建实现要点

1. **Rollup 的 IIFE 格式不支持多入口、也不支持代码分割** → 每个组件的 CDN 产物**必须单独跑一次构建**，由 `scripts/build.ts` 循环并发执行。这是构建耗时的主要来源，组件数量增长后构建会明显变慢，属于可接受代价。

   与之对应，**ESM 列允许代码分割**：一次 Vite 构建产出全部 ESM 入口，公共代码抽成 chunk。ESM 消费方是打包器/构建工具，整目录解析没有部署耦合问题。「单文件可拷走」这个诉求由 IIFE 列承担 —— 它才是客户老系统真正需要的形式。

2. **`package.json` 的 `exports` 字段由构建脚本生成**（扫描 `src/components/*/` 后覆写）。这样加组件依然零配置，不需要手改 exports 映射。
3. **shared 模式**：external `vue` / `react` / `react-dom`，并用 `output.globals` 映射到 `Vue` / `React` / `ReactDOM`。（二期）
4. **self-contained 模式下 Vue 会内联整个 runtime**（约 60KB gzip）。把 `vue` 别名指向 `vue/dist/vue.runtime.esm-bundler.js`（runtime-only，不含模板编译器）。组件都是 SFC 预编译产物，运行时不需要编译器，这个别名是安全的。
5. **构建结束打印每个产物 gzip 体积**并与上次对比，防止某次引入大依赖无人察觉。（低成本高收益）

## 11. Playground（双模式 + HMR）

**关键设计：dev 下不跑构建。**

```
playground/
├── 路由/导航由 src/components/*/meta.ts 自动生成（加组件零配置）
└── 每个组件页
    ├── [源码模式]  默认 —— .vue 直接挂载 / .tsx 直接渲染
    └── [WC 模式]   import 'virtual:ctc-wc/<name>'
```

**源码模式**：组件源码直接挂载到页面，获得原生 HMR 与框架 devtools。

**WC 模式**：通过一个 Vite 插件提供 `virtual:ctc-wc/<name>` 虚拟模块，内部：import 组件源码 → `defineElement(meta, impl)` 定义 CE → 页面插入 `<ctc-biz-chart>`。

**为什么走虚拟模块而不是引构建产物**：虚拟模块 import 的仍是源码，Vite 照常追踪依赖，因此**保留了 HMR**，同时验证的是真实的属性传递、事件冒泡、Shadow 隔离。直接引构建产物的话，每次改动都要等构建，开发体验就废了。

WC 模式的 HMR 依赖第 7.5 节的引用替换机制。

**控制面板全部由 `meta.ts` 驱动**，不手写：
- 属性表单（按 `type` 渲染 string / number / boolean / select 控件）
- shadow ↔ light 切换
- mock 宿主上下文（假 request、切 locale / theme）
- 事件日志区（实时打印冒泡出来的 CustomEvent）

## 12. 测试

三层，按投入产出比排序：

1. **桥接层单测**（Vitest）—— 最高价值。自研代码集中于此且全是易错点：attribute ↔ property 映射、事件转发（**必须断言 `composed === true`**）、shadow / light 切换、重复注册去重。
2. **组件契约测试** —— 由同一份 `meta.ts` 驱动：给定 props 断言渲染结果与事件。写一次，所有组件复用。
3. **产物冒烟测试**（Playwright）—— 唯一能验证「打包后」的手段。加载静态页 `<script src="dist/cdn/xxx.js">`，断言：CE 已升级、shadow root 存在、事件能冒泡到 window、**token 换肤生效**（改 `--ctc-*` 后断言计算样式变化，直接防住第 8.3 节的 `:host` 坑）。

## 13. 技术选型

- 构建：Vite 7 + TypeScript（严格模式）
- 框架：Vue 3.5（`defineCustomElement`）、React 19（peer 允许 18）
- 包管理：pnpm
- 测试：Vitest + Playwright
- 代码规范：ESLint + Prettier

## 14. 已知陷阱清单（实现时必须逐条防住）

1. **事件漏 `composed: true`** —— 事件在 Shadow DOM 外完全收不到，且不报错，只能靠调试发现。是整个项目最常见的坑。
2. **`:host` 兜底反杀宿主换肤** —— 见 8.3。组件单独看正常，一换肤就失效，极隐蔽。
3. **`customElements.define` 同 tag 重复注册直接抛错**，且 `defineCustomElement` 每次调用产出新构造器。开发态最易撞：HMR、playground 切模式、同页引两个产物。桥接层必须做 tag 注册去重，已注册则复用而非重定义。
4. **`adoptedStyleSheets` 老浏览器不支持** —— 必须有 `<style>` 降级分支。
5. **IIFE 不支持多入口** —— 见 10.1。
6. **React ≤18 无法通过 attribute 传对象** —— 必须支持 property 通道。

## 15. 分期建议

本设计的实施范围限定在**一期**。二期、三期单独走各自的 spec → plan → 实施循环。

- **一期（骨架跑通）**：仓库结构 + tokens + runtime 桥接层 + 构建脚本 + playground 双模式 + 1 个 Vue 组件 + 1 个 React 组件端到端跑通。此期结束时，**self-contained 列**的产物（单组件 ESM / 单组件 IIFE / 全量 ESM / 全量 IIFE）应可完整产出并通过冒烟测试；构建脚本的 `mode` 参数已就位但只启用 `self-contained`。
- **二期（依赖共用，本期不做）**：`window.__CTC_SHARED__` 注册表、宿主注入协议三级兜底、shared 模式产物、token 换肤能力。
- **三期（工程完备，本期不做）**：测试三层补齐、体积哨兵、ESLint/Prettier、CI。

**一期范围内仍必须防住第 14 节的全部陷阱** —— 其中 `composed: true`（第 1 条）、`customElements.define` 去重（第 3 条）、`adoptedStyleSheets` 降级（第 4 条）、IIFE 多入口限制（第 5 条）、React property 通道（第 6 条）都是一期就会撞上的。第 2 条 `:host` 坑只在二期做 token 换肤时才会暴露，但一期写 `tokens` 时就要按正确姿势写。

一期还需显式验证一件事：**同一页面同时加载 Vue 写的组件与 React 写的组件互不干扰** —— 这是「一个组件只写一次」原则唯一的真实风险点。
