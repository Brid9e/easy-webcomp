# easy-webcomp

用 Vue 3 或 React 编写业务组件，构建管线输出统一形态的 Web Component。支持 npm ESM 引入与 CDN 单文件引入。

使用哪个框架由作者决定：Vue 组件放 `Component.vue`，React 组件放 `Component.tsx`。构建脚本按文件名自动判别，两者最终产出一致的 `<ew-*>` 自定义元素。

## 快速开始

```bash
pnpm install
pnpm dev            # 调试页：http://localhost:5273，单组件调试，容器可拖拽改宽
pnpm docs:dev       # 文档站：http://localhost:5173
```

调试页每次只渲染一个组件并占满视口。容器可拖拽，也可按 375 / 768 / 1024 / 铺满 取预设，右上角显示实时像素读数，用于观察组件在窄容器下的自适应表现。左栏选择组件，右栏修改属性、查看事件。它同样扫描 `packages/workspaces/`，因此与文档站一样，**新增目录后需要重启**。

文档站位于 `docs/`，由 VitePress 驱动。每个组件一页，散文手写，交互面板由 `meta.ts` 驱动；未单独编写页面的组件会得到一个只含交互面板的详情页。

组件页的交互面板使用与消费方完全一致的 `createElementClass` 路径，可验证属性传递、事件冒泡与 Shadow 隔离。修改源码即热更新，不重新执行 `customElements.define`。

属性面板与事件日志均由 `meta.ts` 驱动，无需手写。

## 工作空间

组件必须属于某个工作空间，不存在隐式的默认空间。工作空间是一个目录加一份清单，**一个空间一个包**：

```
packages/workspaces/
└── demo/                       # 包名 @ew/demo
    ├── workspace.ts            # 展示名与描述，供文档站用
    ├── package.json            # 空间的依赖清单，也是构建期取版本号的来源
    ├── styles/
    │   └── index.scss          # 空间共享的变量与 mixin，组件按需 @use
    └── components/
        ├── hello-vue/
        └── hello-react/
```

新建一个工作空间：

```bash
pnpm run new:workspace <空间名>
```

目录名即工作空间 id，清单里不重复声明；只允许小写字母、数字与连字符，且以字母开头。生成时自带 `package.json`（包名 `@ew/<空间名>`），跑一次 `pnpm install` 把它挂进 workspace。**新建后需要重启 `docs:dev` 与 `pnpm dev`**：页面清单、侧边栏与 grid 都在启动时确定，运行时新增的目录不会被收录（新增组件同理）。

空间的依赖装在自己的 `package.json` 里：组件用到的库（UI 库、axios、echarts……）都是这个空间的依赖，版本号也从这里读，产物清单里写的 peerDependencies 因此与空间声明一致。`pnpm run new:component` 选完配套设施后会把依赖直接装进对应空间。

工作空间只是**文件组织单位**，不影响交付：自定义元素 tag、`package.json` 的 `exports` 键、CDN 文件名都不带空间前缀。代价是**组件名必须全局唯一**，两个空间下的同名组件会使构建直接报错。

## 新增一个组件

先在某个工作空间下新建目录，放入五个文件即可，**不需要修改任何构建配置或路由**：

```
packages/workspaces/<空间名>/components/<组件名>/
├── Component.vue     # 或 Component.tsx，二者只能有一个
├── meta.ts           # 组件契约：tag、props、events
├── style.scss        # 组件自己的样式（选了 Tailwind 是 style.css）
├── index.ts          # 入口：导出构造器与 register()
└── define.ts         # 副作用入口，CDN 产物用
```

样式默认写 SCSS。空间共享的变量与 mixin 放 `<空间>/styles/index.scss`，组件里用 `@use '<空间>/styles' as styles;` 取用。写空间名而非相对路径是刻意为之：构建与文档站都把 SCSS 的解析路径指向 `packages/workspaces`，路径因此与组件所在层级解耦，组件目录移到更深一层也不需要改这行。**例外：Tailwind 组件是 `style.css`**，因为 `@tailwindcss/vite` 不处理 `.scss`。

组件自身的样式写在 `style.scss`，由桥接层注入，消费方无需操作。`Component.vue` 里的 `<style>` 块只用于引入第三方样式表（例如宿主按需引入 Element Plus 时，组件用到的子组件样式），**不要加 `scoped`**：那份 CSS 会被抽成独立文件而非随模块注入，框架消费方需要显式 `import '@ew/<空间>/styles.css'`。细节见 [docs/guide/build.md](docs/guide/build.md#组件里的-style-块)。

`meta.ts` 示例：

```ts
import { defineComponentMeta } from '@ew/runtime'

export default defineComponentMeta({
  tag: 'ew-hello-vue',
  shadow: true,
  props: {
    name: { type: 'string', default: 'World' },
    count: { type: 'number', default: 0 },
    autoLoad: { type: 'boolean', attr: 'auto-load', default: false },
  },
  events: ['select'],
})
```

组件内派发事件用 `useVueEmit()`：

```ts
import { useVueEmit } from '@ew/runtime'   // React 组件改为 useReactEmit
const emit = useVueEmit()
emit('select', { id: 1 })                      // → 派发 ew-select 事件
```

事件名必须出现在 `meta.ts` 的 `events` 数组里，否则开发态会打印警告。事件一律以 `ew-` 为前缀、`composed: true`，能穿透 shadow root。

## 构建

```bash
pnpm run build      # ESM + CDN 全部产物
pnpm run build:esm  # 只出 ESM
pnpm run build:cdn  # 只出 CDN
pnpm run snapshot   # 重新生成文档站卡片缩略图（需先 build 过）
```

产物结构：

| 路径 | 用途 |
|---|---|
| `dist/<空间>/esm/*.js` | npm ESM 引入，无副作用，需显式调 `register()` |
| `dist/<空间>/esm/*/define.js` | npm ESM 引入，import 即注册 |
| `dist/cdn/<空间>/index.js` | CDN 单文件，该空间的全部组件，运行时内联，import 即注册 |
| `dist/cdn/<空间>/<组件>.js` | CDN 单文件，单个组件，运行时内联，import 即注册 |
| `dist/<空间>/styles.css` | 组件 `<style>` 块抽出来的样式，由 `@ew/<空间>/styles.css` 导出（没有组件写 `<style>` 块就没有这个文件） |
| `dist/<空间>/**/*.d.ts` | 类型声明，由 exports 的 `types` 条件自动带上 |

ESM 采用一次多入口构建，允许代码分割（消费方是打包器，按整目录解析）；IIFE 每个组件单独构建一次，空间的 `index.js` 是又一次独立的单入口构建，它 import 本空间全部组件，而非多入口。Rollup 的 IIFE 格式不支持多入口，逐组件构建是产出单文件产物的唯一方式。

构建结束会打印每个产物的 gzip 体积。`dist/` 按工作空间分目录，每个目录是一个独立包（`@ew/demo`、`@ew/self-monitor`），各带一份 `package.json`，依赖由构建从产物反推。`exports` 用 pattern 覆盖本空间全部组件，**不随组件增减而变动**：新增组件只需重新构建，这些 `package.json` 不会因此产生 diff。

每条 exports 是 `{ types, default }` 条件对象：声明文件（`.d.ts`）与 JS 一样由构建期生成，没有 `types` 条件时消费方的 `tsc` 只看得到 `.js`，会报「隐式拥有 any 类型」（TS7016）。细节见 [docs/guide/build.md](docs/guide/build.md)。子路径是否真能解析到文件、产物里的裸导入是否都在 `peerDependencies` 里声明过，由 `pnpm run check:artifacts` 兜底。

### 文档站卡片缩略图

空间页的卡片显示静态截图（`docs/public/snapshots/<空间>/<组件名>.png`），点击卡片进入详情页或点击全屏时挂载的才是真实元素：空间内组件较多时，页面上同时挂载十几个运行时既慢且没有必要。截图由 `pnpm run snapshot` 生成（起一次静态服务与无头 Chrome，逐张截取组件连同四周 16px 留白，尺寸随组件走），修改组件样式后需要重新生成，见 [docs/guide/authoring.md](docs/guide/authoring.md#组件卡片上的缩略图)。

## 引入方式

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/demo/index.js"></script>

<ew-hello-vue name="World" count="3"></ew-hello-vue>
```

ESM：

```ts
import '@ew/demo/hello-vue/define'

document.body.innerHTML = '<ew-hello-vue name="World"></ew-hello-vue>'
```

React 项目里传对象属性：

```tsx
const ref = useRef<HTMLElement>(null)
useEffect(() => {
  if (ref.current) (ref.current as any).payload = { id: 1 }
}, [])
return <ew-hello-vue ref={ref} name="World" />
```

React ≤18 会把对象属性序列化，必须走 property 通道；`<ew-hello-vue>` 需要在自己的 `d.ts` 里补充 JSX 类型声明。

## 主题

覆盖任意 `--ew-*` 变量即可换肤，无需 `::part()`：

```css
:root {
  --ew-color-primary: #ff4d4f;
}
```

组件内部一律用 `var(--ew-color-primary, 兜底值)` 取用。**不要在 `:host` 上写变量默认值**：它的优先级高于宿主继承来的值，会使换肤静默失效。

## 降级到 light DOM

默认每个组件挂 shadow root。给元素加 `disable-shadow` 属性即降级到 light DOM，样式改为注入 `document.head`（相同 CSS 只注入一次）：

```html
<ew-hello-vue name="World" disable-shadow></ew-hello-vue>
```

## 保持状态（keep-alive）

自定义元素被移出文档时默认销毁。宿主用 KeepAlive 缓存页签、或只是改变它在文档中的位置时，状态会一并丢失
（切回页签必然重新请求）。为元素加上 `keep-alive` 即断开时不销毁：

```html
<ew-my-list keep-alive></ew-my-list>
```

组件可读激活信号，在隐藏期间停掉轮询与请求：`useVueActive()`（Vue）/ `useReactActive()`（React）。
代价是挂起的元素继续持有框架实例与整棵 DOM，因此默认关闭。细节见
[docs/guide/lifecycle.md](docs/guide/lifecycle.md)。

## 验证

```bash
pnpm run verify   # typecheck + 单测 + 构建 + 产物检查 + 框架产物检查 + 文档站构建 + 冒烟测试
```

七项依次为：

| 阶段 | 内容 |
|---|---|
| `typecheck` | `vue-tsc --noEmit`，根目录 `*.config.ts` 也在检查范围内 |
| `test` | Vitest + jsdom，17 个文件 186 个用例，覆盖桥接层全部易错点与组件扫描 |
| `build` | ESM + CDN 全量产物 |
| `check:artifacts` | 产物结构、exports 子路径能否解析、裸导入是否都声明过 |
| `check:framework` | Vue / React 框架产物在 jsdom 里真实挂载（2 个文件 8 个用例） |
| `docs:build` | VitePress 构建文档站，同时是 SSR 问题的唯一防线 |
| `test:e2e` | Playwright 冒烟测试，14 个用例加载 `dist/cdn/<空间>/*.js` 真实产物，其中一个起调试页 |

`pnpm run snapshot`（卡片缩略图）不在 `verify` 里：它要开无头 Chrome，而图片是提交进 git 的产物，缺图时卡片会退回实时组件而不是报错。

e2e 用**系统 Chrome**（`channel: 'chrome'`），因为 Playwright 自带 chromium 的下载源在本机只有约 2.5 MB/min，182 MB 装不上。若要改用自带 chromium：`pnpm exec playwright install chromium`，然后删掉 `playwright.config.ts` 里的 `channel`。

### 冒烟测试覆盖

注册升级、shadow 渲染、Vue 与 React 同页共存互不干扰（含两个 root 的样式表互相独立）、事件穿透 shadow root 冒泡到 window、`disable-shadow` 降级、token 换肤穿透、单组件产物与空间 index 同时引入不触发重复注册错误、空间 index 单独引入即注册该空间全部组件。

另有一条起调试页（独立端口 5274）验证舞台本身：元素升级后渲染进 shadow root、按 375 预设后容器实测宽度就是 375。

### 体积基线

最近一次构建（gzip）。后续构建应与这张表对比，某个产物突然变大说明引入了未察觉的大依赖：

| 产物 | gzip |
|---|---|
| `dist/cdn/demo/hello-vue.js` | 27.0 KB |
| `dist/cdn/demo/hello-react.js` | 69.4 KB |
| `dist/cdn/demo/index.js` | 95.1 KB |
| `dist/cdn/self-monitor/my-list.js` | 393.6 KB |
| `dist/cdn/self-monitor/index.js` | 393.6 KB |

ESM 产物体积随打包器而定，不在基线对比范围内。

## 已知约束

- **不要用 `:host` 写变量默认值。** 优先级高于宿主继承来的值，换肤会静默失效。
- **事件必须带 `composed: true`。** 漏了事件出不了 shadow root，且不报错。桥接层已统一处理，手写事件时注意。
- **CDN 产物必须静态替换 `process.env.NODE_ENV`。** Vite lib 模式默认不替换（留给宿主打包器），但 IIFE 没有宿主打包器。构建脚本已处理。
- **`customElements.define` 同 tag 重复注册直接抛错。** 桥接层的 `registerElement` 做了两层去重（模块级 Map + `customElements.get()` 兜底），后者是跨 bundle 场景下唯一有效的防线。
- **IIFE 不支持多入口。** 因此 CDN 侧逐组件构建，空间 `index.js` 也是独立的一次单入口构建（它 import 本空间全部组件，不是多入口）。
