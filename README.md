# ctc-web-components

用 Vue 3 或 React 编写业务组件，构建管线输出统一形态的 Web Component。支持 npm ESM 引入与 CDN 单文件引入。

组件写哪个框架由你决定：Vue 组件放 `Component.vue`，React 组件放 `Component.tsx`。构建脚本按文件名自动判别，两者最终产出一致的 `<ctc-*>` 自定义元素。

## 快速开始

```bash
pnpm install
pnpm run dev        # 文档站：http://localhost:5173
```

文档站在 `docs/`，由 VitePress 驱动。每个组件一页，散文手写、交互面板由 `meta.ts` 驱动；没有单独写页面的组件会出现在[组件总览](/components/)里。

组件页的交互面板有两种模式：

- **源码模式** —— 组件源码直接挂载，获得原生 HMR 与框架 devtools。
- **WC 模式** —— 走真实的 `createElementClass` 路径，验证属性传递、事件冒泡、Shadow 隔离。改源码同样热更新，不重新 `customElements.define`。

两种模式下属性面板与事件日志都由 `meta.ts` 驱动，不用手写。

## 新增一个组件

在 `src/components/` 下新建目录，放入五个文件即可，**不需要修改任何构建配置或路由**：

```
src/components/<组件名>/
├── Component.vue     # 或 Component.tsx，二者只能有一个
├── meta.ts           # 组件契约：tag、props、events
├── style.css         # 唯一样式来源，禁止用 <style> 块
├── index.ts          # 入口：导出构造器与 register()
└── define.ts         # 副作用入口，CDN 产物用
```

`meta.ts` 示例：

```ts
import { defineComponentMeta } from '../../runtime/types'

export default defineComponentMeta({
  tag: 'ctc-hello-vue',
  shadow: true,
  props: {
    name: { type: 'string', default: 'World' },
    count: { type: 'number', default: 0 },
    autoLoad: { type: 'boolean', attr: 'auto-load', default: false },
  },
  events: ['select'],
})
```

组件内派发事件用 `useEmit()`：

```ts
import { useEmit } from '../../runtime/vue'   // React 组件改为 '../../runtime/react'
const emit = useEmit()
emit('select', { id: 1 })                      // → 派发 ctc-select 事件
```

事件名必须出现在 `meta.ts` 的 `events` 数组里，否则开发态会打印警告。事件一律以 `ctc-` 为前缀、`composed: true`，能穿透 shadow root。

## 构建

```bash
pnpm run build      # ESM + CDN 全部产物
pnpm run build:esm  # 只出 ESM
pnpm run build:cdn  # 只出 CDN
```

产物结构：

| 路径 | 用途 |
|---|---|
| `dist/esm/*.js` | npm ESM 引入，无副作用，需显式调 `register()` |
| `dist/esm/*/define.js` | npm ESM 引入，import 即注册 |
| `dist/cdn/<组件>.js` | CDN 单文件，运行时内联，import 即注册 |
| `dist/cdn/ctc-all.js` | CDN 全量单文件 |

ESM 一次多入口构建、允许代码分割（消费方是打包器，整目录解析）；IIFE 每个组件单独构建一次（Rollup 的 IIFE 格式不支持多入口，这是唯一能产出「单文件可拷走」的方式）。

构建结束会打印每个产物的 gzip 体积。`package.json` 的 `exports` 字段由构建脚本扫描组件目录自动生成，加组件后重新构建即自动多出对应子路径，不用手改。

## 引入方式

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/hello-vue.js"></script>

<ctc-hello-vue name="World" count="3"></ctc-hello-vue>
```

ESM：

```ts
import 'ctc-web-components/hello-vue/define'

document.body.innerHTML = '<ctc-hello-vue name="World"></ctc-hello-vue>'
```

React 项目里传对象属性：

```tsx
const ref = useRef<HTMLElement>(null)
useEffect(() => {
  if (ref.current) (ref.current as any).payload = { id: 1 }
}, [])
return <ctc-hello-vue ref={ref} name="World" />
```

React ≤18 会把对象属性序列化，必须走 property 通道；`<ctc-hello-vue>` 需要在自己的 `d.ts` 里补充 JSX 类型声明。

## 主题

覆盖任意 `--ctc-*` 变量即可换肤，无需 `::part()`：

```css
:root {
  --ctc-color-primary: #ff4d4f;
}
```

组件内部一律用 `var(--ctc-color-primary, 兜底值)` 取用。**不要在 `:host` 上写变量默认值** —— 它的优先级高于宿主继承来的值，会让换肤失效。

## 降级到 light DOM

默认每个组件挂 shadow root。给元素加 `disable-shadow` 属性即降级到 light DOM，样式改为注入 `document.head`（相同 CSS 只注入一次）：

```html
<ctc-hello-vue name="World" disable-shadow></ctc-hello-vue>
```

## 验证

```bash
pnpm run verify   # typecheck + 单测 + 构建 + 文档站构建 + 冒烟测试
```

五项依次为：

| 阶段 | 内容 |
|---|---|
| `typecheck` | `vue-tsc --noEmit`，根目录 `*.config.ts` 也在检查范围内 |
| `test` | Vitest + jsdom，7 个文件 46 个用例，覆盖桥接层全部易错点与组件扫描 |
| `build` | ESM + CDN 全量产物 |
| `docs:build` | VitePress 构建文档站，同时是 SSR 问题的唯一防线 |
| `test:e2e` | Playwright 冒烟测试，8 个用例加载 `dist/cdn/*.js` 真实产物 |

e2e 用**系统 Chrome**（`channel: 'chrome'`），因为 Playwright 自带 chromium 的下载源在本机只有约 2.5 MB/min，182 MB 装不上。若要改用自带 chromium：`pnpm exec playwright install chromium`，然后删掉 `playwright.config.ts` 里的 `channel`。

### 冒烟测试覆盖

注册升级、shadow 渲染、Vue 与 React 同页共存互不干扰（含两个 root 的样式表互相独立）、事件穿透 shadow root 冒泡到 window、`disable-shadow` 降级、token 换肤穿透、单组件产物与全量包同时引入不触发重复注册错误。

### 体积基线

最近一次构建（gzip）——后续构建应与这张表对比，某个产物突然变大说明引入了未察觉的大依赖：

| 产物 | gzip |
|---|---|
| `dist/cdn/hello-vue.js` | 26.8 KB |
| `dist/cdn/hello-react.js` | 69.3 KB |
| `dist/cdn/ctc-all.js` | 95.2 KB |

ESM 产物体积随打包器而定，不在基线对比范围内。

## 已知约束

- **不要用 `:host` 写变量默认值。** 优先级高于宿主继承来的值，换肤会静默失效。
- **事件必须带 `composed: true`。** 漏了事件出不了 shadow root，且不报错。桥接层已统一处理，手写事件时注意。
- **CDN 产物必须静态替换 `process.env.NODE_ENV`。** Vite lib 模式默认不替换（留给宿主打包器），但 IIFE 没有宿主打包器。构建脚本已处理。
- **`customElements.define` 同 tag 重复注册直接抛错。** 桥接层的 `registerElement` 做了两层去重（模块级 Map + `customElements.get()` 兜底），后者是跨 bundle 场景下唯一有效的防线。
- **IIFE 不支持多入口。** 因此 CDN 侧是逐组件构建，不是一次多入口。
