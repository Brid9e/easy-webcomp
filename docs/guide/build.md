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
| `dist/<空间>/framework/styles.css` | 组件 `<style>` 块抽出来的样式，从 `@ew/<空间>/styles.css` 导出，见下节 |
| `dist/<空间>/**/*.d.ts` | 类型声明，由 exports 的 `types` 条件自动带上，见下节 |
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

构建结束会打印每个产物的 gzip 体积。空间包的 `exports` 用 pattern 覆盖本空间全部组件（`./*` → `./esm/*.js` 与 `./esm/*.d.ts`、`./vue` / `./react` → `./framework/*.js` 与对应的 `.d.ts`），**不随组件增减而变动** —— 加组件只要重新构建，那些 `package.json` 不会因此产生 diff。

每条 exports 都是 `{ types, default }` 条件对象，不是裸字符串。裸字符串没有 `types` 条件，消费方的 `tsc` 就只看得到 `.js`，报「隐式拥有 any 类型」（TS7016）。`types` 必须排在 `default` 前面 —— 条件按书写顺序匹配。子路径是否真能解析到文件、产物里的裸导入是否都在 `peerDependencies` 里声明过、该有的声明文件在不在，由 `pnpm run check:artifacts` 兜底。

### 类型声明

`dist/<空间>/**/*.d.ts` 由构建期现写（`scripts/declarations.ts`）：

| 文件 | 内容 |
|---|---|
| `esm/index.d.ts` | 桶，每个组件一个命名空间 |
| `esm/<组件>.d.ts` | `meta` / `<组件>Element` / `register` |
| `framework/vue.d.ts`、`react.d.ts` | 该空间的框架组件，props 接口由 `meta.props` 生成 |

**声明是手写模板拼出来的，没上 `vite-plugin-dts`。** 产物里的声明一个字都不能引 `@ew/runtime` —— 那个包 private、不发，消费方解析不到它，而从源码图生成的声明必然带着这个说明符。所以运行时类型（`ComponentMeta` / `EwElementConstructor`）就地内联成副本；代价是这份形状与 `packages/runtime/src/types.ts` 是两份、可能漂，由 `tests/integration/consumer-types.test.ts` 兜底 —— 那条用例把 `dist/<空间>` 软链进一个临时项目，真跑一次 `tsc`。

`@ew/<空间>/<组件>/define` 没有声明文件，是有意的：它只被 `import '...'` 那种纯副作用引法用，而 TS 对没有绑定的模块不要求声明。

`./styles.css` 是唯一一条没有 `types` 条件的 exports —— CSS 没有声明文件，写一个是编的。它指向的文件在不在，由 `check:artifacts` 兜底。

### 组件里的 `<style>` 块

组件自己的样式写 `style.scss`，它由桥接层按 Shadow DOM 投递、框架路径由包装层 `applyGlobalStyles` 注入，消费方什么都不用做。

`<style>` 块的用途只有一个：`@use` 第三方样式表。典型场景是组件用了 Element Plus 的某个子组件，而宿主走的是按需引入 —— `unplugin-vue-components` 只扫宿主自己的源码，一个预构建好的 dist 在它眼里不存在，所以那些子组件的样式谁都不会引。组件作者可以自己把缺失的那份拉进来：

```vue
<style lang="scss">
@use 'element-plus/theme-chalk/src/descriptions.scss';
@use 'element-plus/theme-chalk/src/descriptions-item.scss';
</style>
```

Vite 对 SFC 的 `<style>` 一律走抽取管线，产出一个**独立 CSS 文件**而不是随模块注入 —— 框架路径的 `applyGlobalStyles` 够不到它。所以这份样式必须由宿主显式引一次：

```ts
import { MyList } from '@ew/self-monitor/vue'
import '@ew/self-monitor/styles.css'
```

三条要点：

- **不要加 `scoped`。** Vue 只会把 scope id 打到本组件自己 render 出来的元素（含子组件的根元素）上，而这类样式表的选择器命中的是第三方组件的**内部**元素，加了 `scoped` 之后绝大多数规则永远不会匹配 —— 而且不报错。组件自己的规则本来就该写 `style.scss`（那份受类名前缀检查约束），`<style>` 块只放第三方样式表，全局作用域正是它要的。
- **这个文件是有条件产出的。** 该空间没有任何组件写 `<style>` 块时它根本不存在，exports 里也就没有 `./styles.css`。`check:artifacts` 双向查：产物里有就必须导出，导出了就必须存在。
- **文件名固定为 `styles.css`，是显式指定的**（`build.lib.cssFileName`）。不指定的话 Vite 会退回根包的 `name` —— 产物里凭空出现一个叫 `easy-webcomp.css` 的文件（还是散在空间目录里的），根包一改名就静默跟着变。

同一份 CSS 在 `esm/` 与 `cdn/` 下也有（同名 `styles.css`，CDN 侧是 `<组件>.css`）：CSS 抽取跟着模块图走，构建分几条管线它就在几处出现。只有 framework 那份被导出，另两份是过程产物。CDN 那份按组件名分而不是共用根包名，是因为逐组件构建共用 `dist/cdn` 且 `emptyOutDir: false`，共用一个名字时后一个组件会覆盖前一个。

宿主已经引了完整 Element Plus 的话，直接用根包的 `easy-webcomp/element-plus.css` 更省事 —— 那是个全量入口，不必逐个组件地补。

## 引入方式

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/hello-vue.js"></script>

<ew-hello-vue name="World" count="3"></ew-hello-vue>
```

ESM（npm）：

三个入口，按需要选一个：

| import | 拿到什么 | 副作用 |
|---|---|---|
| `@ew/demo/hello-vue/define` | 无导出 | import 即注册 `<ew-hello-vue>` |
| `@ew/demo/hello-vue` | `meta` / `HelloVueElement` / `register` | 无，要自己调 `register()` |
| `@ew/demo` | 整空间命名空间，`HelloVue.register()` | 无 |

```ts
import '@ew/demo/hello-vue/define'

document.body.innerHTML = '<ew-hello-vue name="World" count="3"></ew-hello-vue>'
```

要控制升级时机（比如等布局算完再升级元素）就用第二种入口手动 `register()`。

空间包还没发到 registry，本地用 `pnpm add link:<仓库>/dist/<空间>` 接进来。`link:` 是软链，重跑构建后立刻生效；`file:` 会拷一份，重建了不跟着变。

**ESM 产物是自包含的**：Vue 运行时、组件自己的样式、以及组件显式引的库样式（如 my-list 引的 Element Plus）都打在里面，所以宿主项目既不用装 `vue` / `element-plus` / `pinia`（它们在空间包里只是 optional peer），也不用引任何 CSS —— 样式在挂载时投进 shadow root。

属性分成两条通道：**string / number / boolean 走 attribute，对象、数组、函数只能走 property** —— 后三者的类型根本不在 `observedAttributes` 里，写进 attribute 只会被忽略。

事件名一律带 `ew-` 前缀，且 `bubbles: true, composed: true`，能穿出 shadow root：

```ts
el.addEventListener('ew-select', (e) => console.log(e.detail))
```

`easy-webcomp/tokens.css` 里的 `--ew-*` 是可选的 —— 组件都带兜底值，不引只有默认主题。

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
| `dist/cdn/hello-vue.js` | 26.9 KB |
| `dist/cdn/hello-react.js` | 69.3 KB |
| `dist/cdn/my-list.js` | 393.7 KB |
| `dist/cdn/ew-all.js` | 464.2 KB |

CDN 这一栏与拆分前**逐字节相同** —— `buildCdn` 这次一行没动，它只在自己那套 `dist/cdn/` 下逐组件构建，与 `dist/` 的目录重构无关。数字比上一版基线大，是因为 `my-list`（Element Plus + Pinia，单文件就近 400 KB）是上一版基线写下之后才加进仓库的，与本次拆分无关。

ESM 与框架产物的体积随打包器与引入方式而定，不在基线对比范围内。两点值得留意：`dist/demo/framework/vue.js`（1.1 KB）现在只含 `hello-vue`，`dist/self-monitor/framework/vue.js`（27.8 KB）只含 `my-list` —— 后者仍引 Element Plus 与 Pinia，故比前者大两个数量级；ESM 侧原本全仓库共享的那份 Vue 运行时，现在每个空间包各带一份。

## 已知约束

- **不要用 `:host` 写变量默认值。** 优先级高于宿主继承来的值，换肤会静默失效。
- **事件必须带 `composed: true`。** 漏了事件出不了 shadow root，且不报错。桥接层已统一处理，手写事件时注意。
- **CDN 产物必须静态替换 `process.env.NODE_ENV`。** Vite lib 模式默认不替换（留给宿主打包器），但 IIFE 没有宿主打包器。构建脚本已处理。
- **`customElements.define` 同 tag 重复注册直接抛错。** 桥接层的 `registerElement` 做了两层去重（模块级 Map + `customElements.get()` 兜底），后者是跨 bundle 场景下唯一有效的防线。
- **IIFE 不支持多入口。** 因此 CDN 侧是逐组件构建，不是一次多入口。
