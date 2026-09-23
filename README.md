# easy-webcomp

用 Vue 3 或 React 编写业务组件，构建管线输出统一形态的 Web Component。支持 npm ESM 引入与 CDN 单文件引入。

组件写哪个框架由你决定：Vue 组件放 `Component.vue`，React 组件放 `Component.tsx`。构建脚本按文件名自动判别，两者最终产出一致的 `<ew-*>` 自定义元素。

## 快速开始

```bash
pnpm install
pnpm dev            # 调试页：http://localhost:5273 —— 单组件调试，容器可 resize
pnpm docs:dev       # 文档站：http://localhost:5173
```

调试页一次只渲染一个组件，占满视口，容器可以拖拽或按 375 / 768 / 1024 / 铺满 改尺寸，还有实时像素读数——用来观察组件在窄容器下的自适应表现。左栏选组件，右栏改属性、看事件。它也扫 `src/workspaces/`，所以和文档站一样**新增目录后要重启**。

文档站在 `docs/`，由 VitePress 驱动。每个组件一页，散文手写、交互面板由 `meta.ts` 驱动；没有单独写页面的组件会在空间页里给出兜底详情页。

组件页的交互面板走真实的 `createElementClass` 路径 —— 即消费方实际拿到的那条路，能验证属性传递、事件冒泡、Shadow 隔离。改源码热更新，不重新 `customElements.define`。

属性面板与事件日志都由 `meta.ts` 驱动，不用手写。

## 工作空间

组件必须住在工作空间里，没有隐式的默认空间。一个工作空间是一个目录，加一份清单：

```
src/workspaces/
└── demo/
    ├── workspace.ts            # 展示名与描述，供文档站用
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

目录名即工作空间 id，清单里不重复声明；只允许小写字母、数字与连字符，且以字母开头。**新建后要重启 `docs:dev` 与 `pnpm dev`** —— 页面清单、侧边栏与 grid 都在启动时就定好了，运行时冒出来的新目录不会被收进去（新增组件同理）。

工作空间只是**文件组织单位**，不影响交付：自定义元素 tag、`package.json` 的 `exports` 键、CDN 文件名都不带空间前缀。代价是**组件名必须全局唯一**，撞名时构建会直接报错。

## 新增一个组件

先在某个工作空间下新建目录，放入五个文件即可，**不需要修改任何构建配置或路由**：

```
src/workspaces/<空间名>/components/<组件名>/
├── Component.vue     # 或 Component.tsx，二者只能有一个
├── meta.ts           # 组件契约：tag、props、events
├── style.scss        # 组件自己的样式（选了 Tailwind 是 style.css）
├── index.ts          # 入口：导出构造器与 register()
└── define.ts         # 副作用入口，CDN 产物用
```

样式默认写 SCSS。空间共享的变量与 mixin 放 `<空间>/styles/index.scss`，组件里 `@use '<空间>/styles' as styles;` 取用 —— 写空间名而非相对路径，是因为构建与文档站都把 SCSS 的解析路径指向了 `src/workspaces`，这样组件挪层级不会断。**例外是 Tailwind**：`@tailwindcss/vite` 不处理 `.scss`，选了它的组件仍是 `style.css`。

组件自己的样式写 `style.scss`，它由桥接层注入，消费方不用管。`Component.vue` 里另开 `<style>` 块只用于把第三方样式表拉进来（比如宿主按需引入 Element Plus 时组件用到的子组件样式），**不要加 `scoped`** —— 那份 CSS 会被抽成独立文件而不是随模块注入，框架消费方得自己 `import '@ew/<空间>/styles.css'`。细节见 [docs/guide/build.md](docs/guide/build.md#组件里的-style-块)。

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
```

产物结构：

| 路径 | 用途 |
|---|---|
| `dist/<空间>/esm/*.js` | npm ESM 引入，无副作用，需显式调 `register()` |
| `dist/<空间>/esm/*/define.js` | npm ESM 引入，import 即注册 |
| `dist/cdn/<组件>.js` | CDN 单文件，运行时内联，import 即注册 |
| `dist/cdn/ew-all.js` | CDN 全量单文件 |
| `dist/<空间>/framework/styles.css` | 组件 `<style>` 块抽出来的样式，从 `@ew/<空间>/styles.css` 导出（没有组件写 `<style>` 块就没有这个文件） |
| `dist/<空间>/**/*.d.ts` | 类型声明，由 exports 的 `types` 条件自动带上 |

ESM 一次多入口构建、允许代码分割（消费方是打包器，整目录解析）；IIFE 每个组件单独构建一次（Rollup 的 IIFE 格式不支持多入口，这是唯一能产出「单文件可拷走」的方式）。

构建结束会打印每个产物的 gzip 体积。`dist/` 按工作空间分目录，每个目录是一个独立包（`@ew/demo`、`@ew/self-monitor`），各带一份 `package.json`，依赖由构建从产物反推。`exports` 用 pattern 覆盖本空间全部组件，**不随组件增减而变动** —— 加组件只要重新构建，那些 `package.json` 不会因此产生 diff。

每条 exports 是 `{ types, default }` 条件对象：声明文件（`.d.ts`）与 JS 一样由构建期现写，没有 `types` 条件的话消费方的 `tsc` 只看得到 `.js`，报「隐式拥有 any 类型」（TS7016）。细节见 [docs/guide/build.md](docs/guide/build.md)。子路径是否真能解析到文件、产物里的裸导入是否都在 `peerDependencies` 里声明过，由 `pnpm run check:artifacts` 兜底。

## 引入方式

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/hello-vue.js"></script>

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

组件内部一律用 `var(--ew-color-primary, 兜底值)` 取用。**不要在 `:host` 上写变量默认值** —— 它的优先级高于宿主继承来的值，会让换肤失效。

## 降级到 light DOM

默认每个组件挂 shadow root。给元素加 `disable-shadow` 属性即降级到 light DOM，样式改为注入 `document.head`（相同 CSS 只注入一次）：

```html
<ew-hello-vue name="World" disable-shadow></ew-hello-vue>
```

## 验证

```bash
pnpm run verify   # typecheck + 单测 + 构建 + 文档站构建 + 冒烟测试
```

五项依次为：

| 阶段 | 内容 |
|---|---|
| `typecheck` | `vue-tsc --noEmit`，根目录 `*.config.ts` 也在检查范围内 |
| `test` | Vitest + jsdom，13 个文件 113 个用例，覆盖桥接层全部易错点与组件扫描 |
| `build` | ESM + CDN 全量产物 |
| `docs:build` | VitePress 构建文档站，同时是 SSR 问题的唯一防线 |
| `test:e2e` | Playwright 冒烟测试，9 个用例加载 `dist/cdn/*.js` 真实产物，其中一个起调试页 |

e2e 用**系统 Chrome**（`channel: 'chrome'`），因为 Playwright 自带 chromium 的下载源在本机只有约 2.5 MB/min，182 MB 装不上。若要改用自带 chromium：`pnpm exec playwright install chromium`，然后删掉 `playwright.config.ts` 里的 `channel`。

### 冒烟测试覆盖

注册升级、shadow 渲染、Vue 与 React 同页共存互不干扰（含两个 root 的样式表互相独立）、事件穿透 shadow root 冒泡到 window、`disable-shadow` 降级、token 换肤穿透、单组件产物与全量包同时引入不触发重复注册错误。

另有一条起调试页（独立端口 5274）验证舞台本身：元素升级后渲染进 shadow root、按 375 预设后容器实测宽度就是 375。

### 体积基线

最近一次构建（gzip）——后续构建应与这张表对比，某个产物突然变大说明引入了未察觉的大依赖：

| 产物 | gzip |
|---|---|
| `dist/cdn/hello-vue.js` | 26.8 KB |
| `dist/cdn/hello-react.js` | 69.3 KB |
| `dist/cdn/ew-all.js` | 95.2 KB |

ESM 产物体积随打包器而定，不在基线对比范围内。

## 已知约束

- **不要用 `:host` 写变量默认值。** 优先级高于宿主继承来的值，换肤会静默失效。
- **事件必须带 `composed: true`。** 漏了事件出不了 shadow root，且不报错。桥接层已统一处理，手写事件时注意。
- **CDN 产物必须静态替换 `process.env.NODE_ENV`。** Vite lib 模式默认不替换（留给宿主打包器），但 IIFE 没有宿主打包器。构建脚本已处理。
- **`customElements.define` 同 tag 重复注册直接抛错。** 桥接层的 `registerElement` 做了两层去重（模块级 Map + `customElements.get()` 兜底），后者是跨 bundle 场景下唯一有效的防线。
- **IIFE 不支持多入口。** 因此 CDN 侧是逐组件构建，不是一次多入口。
