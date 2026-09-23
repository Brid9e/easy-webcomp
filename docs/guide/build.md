# 构建与产物

```bash
pnpm run build            # ESM + CDN + 框架产物
pnpm run build:esm        # 只出 ESM
pnpm run build:cdn        # 只出 CDN
pnpm run build:framework  # 只出框架产物
```

| 路径 | 用途 |
|---|---|
| `dist/<空间>/esm/*.js` | npm ESM 引入，无副作用，需显式调 `register()` |
| `dist/<空间>/esm/*/define.js` | npm ESM 引入，import 即注册 |
| `dist/cdn/<组件>.js` | CDN 单文件，运行时内联，import 即注册 |
| `dist/cdn/ew-all.js` | CDN 全量单文件 |
| `dist/<空间>/framework/vue.js`、`react.js` | 原生 Vue / React 组件，见下节 |
| `dist/element-plus.css` | 组件库样式，可选引入 |

`dist/` 按工作空间分目录，每个目录是一个独立包（`@ew/demo`、`@ew/self-monitor`），各带一份自己的 `package.json`：

```
dist/
├── cdn/                  根包 easy-webcomp：URL 寻址 + ew-all 聚合
├── element-plus.css      根包：Element Plus 的全量样式，与空间无关
└── <空间>/
    ├── package.json      name 是 @ew/<空间>，依赖从产物反推
    ├── esm/              Web Component 形态
    └── framework/        Vue / React 原生组件形态
```

**依赖不手写。** 空间包的 `peerDependencies` 由构建扫 `framework/*.js` 里的裸说明符反推 —— 产物里那句 `import ... from "element-plus"` 就是证据。声明成 peer 而不是 dependency，是因为 `element-plus` / `pinia` / `vue` / `react` 一旦出现两份实例，宿主的配置与 hooks 就够不到组件里那一份。

`dist/cdn/` 与 `dist/element-plus.css` 留在根包：CDN 是 URL 寻址的，`ew-all.js` 按定义就是跨空间聚合；EP 样式是全量的，与空间无关。

ESM 一次多入口构建、允许代码分割（消费方是打包器，整目录解析）；IIFE 每个组件单独构建一次 —— Rollup 的 IIFE 格式不支持多入口，这是唯一能产出「单文件可拷走」的方式。

构建结束会打印每个产物的 gzip 体积。空间包的 `exports` 用 pattern 覆盖本空间全部组件（`./*` → `./esm/*.js`、`./vue` / `./react` → `./framework/*.js`），**不随组件增减而变动** —— 加组件只要重新构建，那些 `package.json` 不会因此产生 diff。子路径是否真能解析到文件、产物里的裸导入是否都在 `peerDependencies` 里声明过，由 `pnpm run check:artifacts` 兜底。

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

Vue 项目里用 `v-bind` 要注意：**只要 prop 名在元素上已定义，Vue 就走 property 通道而不是 attribute 通道**，值不会经过字符串化与类型强转。所以数字要传数字、布尔要传真布尔 —— 传 `''` 表示布尔为真会被 Vue 的 Boolean prop 转换一律当成 `false`。文档站的交互面板就是按这条规则写的。

### 框架产物（宿主本来就是 Vue / React 项目时）

上一节那套 Web Component 用法，代价是跨不过框架边界：props 只能走 attribute、事件是 `CustomEvent` 不是 `@select`、用不了宿主的插槽。宿主本来就是 Vue 3 或 React 项目时这些代价白付 —— 直接用原生组件形态：

```ts
import { MyList } from '@ew/self-monitor/vue'
import 'easy-webcomp/element-plus.css'   // 宿主已经引了 Element Plus 就不用引
```

```tsx
import { MyList } from '@ew/self-monitor/react'
```

- `@ew/<空间>/vue` 只有该空间里 `Component.vue` 写的组件，`@ew/<空间>/react` 只有 `Component.tsx` 写的；某一侧没组件时那个子路径不存在。
- 事件按宿主框架的写法接：Vue 用 `@select`，React 用 `onSelect`。
- 组件样式随模块自动注入，不需要逐个引 css；未用到的组件会被 tree-shaking 摇掉。
- **Vue / React / Element Plus / Pinia 都不打进产物**，用的是宿主自己那份 —— 空间包把它们声明成 optional 的 peer，装了才有约束，没装不告警。
- 组件库样式（Element Plus）单独一个入口，宿主已有就不必引。
- 顶层挂载的那层 div 带 `class="ew-<组件名>-host"`，要对它设宽高就选这个类。

## 体积基线

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
