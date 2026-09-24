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
| `dist/<空间>/esm/config.js` | ESM 与框架消费方共用的配置入口，由 `@ew/<空间>/config` 导出 |
| `dist/cdn/<空间>/index.js` | CDN 单文件，该空间的全部组件，运行时内联，import 即注册 |
| `dist/cdn/<空间>/<组件>.js` | CDN 单文件，单个组件，运行时内联，import 即注册 |
| `dist/cdn/config.js` | CDN 的全局配置入口，落到 `window.ewConfig`，与空间无关，见[运行时配置](/guide/config) |
| `dist/<空间>/framework/vue.js`、`react.js` | 原生 Vue / React 组件，见下节 |
| `dist/<空间>/styles.css` | 组件 `<style>` 块抽出来的样式，由 `@ew/<空间>/styles.css` 导出，见下节 |
| `dist/<空间>/**/*.d.ts` | 类型声明，由 exports 的 `types` 条件自动带上，见下节 |
| `dist/element-plus.css` | 组件库样式，可选引入 |

`dist/` 按工作空间分目录，每个目录是一个独立包（`@ew/demo`、`@ew/self-monitor`），各带一份自己的 `package.json`：

```
dist/
├── cdn/<空间>/          根包 easy-webcomp：URL 寻址，按空间分目录
├── element-plus.css      根包：Element Plus 的全量样式，与空间无关
└── <空间>/
    ├── package.json      name 是 @ew/<空间>，依赖从产物反推
    ├── esm/              Web Component 形态
    └── framework/        Vue / React 原生组件形态
```

**依赖由构建反推，不手工维护。** 空间包的 `peerDependencies` 来自构建对 `framework/*.js` 中裸说明符的扫描，产物里那句 `import ... from "element-plus"` 即为依据。声明为 peer 而非 dependency，是因为 `element-plus` / `pinia` / `vue` / `react` 一旦出现两份实例，宿主的配置与 hooks 就无法作用于组件内那一份。

`dist/cdn/` 与 `dist/element-plus.css` 留在根包：CDN 按 URL 寻址，按空间分目录即可，不需要包管理器中的名字；Element Plus 样式是全量的，与空间无关。**不产出跨空间的聚合产物**，因为把两个空间的运行时合并进同一个 bundle，会使其中一个空间的 vue / element-plus 版本受另一个空间约束。

ESM 采用一次多入口构建，允许代码分割（消费方是打包器，按整目录解析）；IIFE 每个组件单独构建一次，空间的 `index.js` 是又一次独立的单入口构建，它 import 本空间全部组件，而不是多入口。Rollup 的 IIFE 格式不支持多入口，逐组件构建是产出单文件产物的唯一方式。

构建结束会打印每个产物的 gzip 体积。空间包的 `exports` 用 pattern 覆盖本空间全部组件（`./*` → `./esm/*.js` 与 `./esm/*.d.ts`、`./vue` / `./react` → `./framework/*.js` 与对应的 `.d.ts`），**不随组件增减而变动**，新增组件只需重新构建，这些 `package.json` 不会因此产生 diff。配置入口 `@ew/<空间>/config` 落在这条 `./*` 里，因此也是白拿的 —— 显式键只在**要盖过** pattern 时才写（`./vue` / `./react` 要指向 `framework/`，`./styles.css` 要盖掉 pattern 算出的 `esm/styles.css.js`）。

每条 exports 都是 `{ types, default }` 条件对象，不是裸字符串。裸字符串没有 `types` 条件，消费方的 `tsc` 就只看得到 `.js`，报「隐式拥有 any 类型」（TS7016）。`types` 必须排在 `default` 前面，条件按书写顺序匹配。子路径是否真能解析到文件、产物里的裸导入是否都在 `peerDependencies` 里声明过、该有的声明文件在不在，由 `pnpm run check:artifacts` 兜底。

### 类型声明

`dist/<空间>/**/*.d.ts` 由构建期生成（`scripts/declarations.ts`）：

| 文件 | 内容 |
|---|---|
| `esm/index.d.ts` | 桶，每个组件一个命名空间 |
| `esm/<组件>.d.ts` | `meta` / `<组件>Element` / `register` |
| `esm/config.d.ts` | `EwConfig` 与 `configure` / `getConfig`，供 `@ew/<空间>/config` |
| `framework/vue.d.ts`、`react.d.ts` | 该空间的框架组件，props 接口由 `meta.props` 生成 |

**声明文件由手写模板生成，未使用 `vite-plugin-dts`。** 产物中的声明不能引用 `@ew/runtime`，该包为 private 且不发布，消费方无法解析它，而从源码图生成的声明必然带着这个说明符。因此运行时类型（`ComponentMeta` / `EwElementConstructor` / `EwConfig`）在声明中就地内联为副本；代价是该形状与 `packages/runtime/src/` 下的源头存在两份、可能产生偏差，由 `tests/integration/consumer-types.test.ts` 兜底，该用例把 `dist/<空间>` 软链进一个临时项目并真跑一次 `tsc`。

`@ew/<空间>/<组件>/define` 没有声明文件，这是刻意的：它只被 `import '...'` 这类纯副作用引法使用，而 TS 对没有绑定的模块不要求声明。

`./styles.css` 是唯一一条没有 `types` 条件的 exports。CSS 没有声明文件，为其编写声明文件属于虚构。它指向的文件是否存在，由 `check:artifacts` 兜底。

### 组件里的 `<style>` 块

组件自身的样式写在 `style.scss`，由桥接层按 Shadow DOM 投递；框架路径下则由包装层的 `applyGlobalStyles` 注入，消费方无需任何操作。

`<style>` 块只有一个用途：`@use` 第三方样式表。典型场景是组件使用了 Element Plus 的某个子组件，而宿主采用按需引入：`unplugin-vue-components` 只扫描宿主自身的源码，一个预构建好的 dist 在其眼中不存在，因此这些子组件的样式不会被任何环节引入。组件作者可以自行补上缺失的那份：

```vue
<style lang="scss">
@use 'element-plus/theme-chalk/src/descriptions.scss';
@use 'element-plus/theme-chalk/src/descriptions-item.scss';
</style>
```

Vite 对 SFC 的 `<style>` 一律走抽取管线，产出一个**独立 CSS 文件**而不是随模块注入，框架路径的 `applyGlobalStyles` 无法触及。因此这份样式必须由宿主显式引入一次：

```ts
import { MyList } from '@ew/self-monitor/vue'
import '@ew/self-monitor/styles.css'
```

三条要点：

- **不要加 `scoped`。** Vue 只会把 scope id 打到本组件自身渲染出的元素（含子组件的根元素）上，而这类样式表的选择器命中的是第三方组件的**内部**元素，加上 `scoped` 之后绝大多数规则永远不会匹配，且不会报错。组件自身的规则本就应写在 `style.scss`（那份受类名前缀检查约束），`<style>` 块只放第三方样式表，全局作用域正是该用途所需。
- **该文件为条件产出。** 空间内没有任何组件写 `<style>` 块时它根本不存在，exports 里也就没有 `./styles.css`。`check:artifacts` 双向校验：产物里有就必须导出，导出了就必须存在。
- **文件名固定为 `styles.css`**（`build.lib.cssFileName`）。不指定的话 Vite 会退回根包的 `name`，产物中会出现一个名为 `easy-webcomp.css` 的文件，并在根包改名时静默跟随变化。

**只保留一份，位于空间根目录。** CSS 抽取跟随模块图，每条构建管线本都会在自己的 outDir 里落一份（`esm/` 一份、`framework/` 一份），内容完全相同。构建结束会把 framework 那份提到 `dist/<空间>/styles.css` 并删除 ESM 那份：WC 模式下组件渲染在 shadow root 中，外部 CSS 无法进入，ESM 那份没有任何消费方能拿到，保留它只会让消费方在内容相同的两份文件之间选择。`check:artifacts` 会拦住构建目录里残留的那份。

CDN 产物（`dist/cdn/<空间>/<组件>.css`、`dist/cdn/<空间>/index.css`）是例外，予以保留：它按 URL 寻址，与空间包的入口无关，且单组件 IIFE 旁边没有别的入口能把样式带进去，使用 CDN 时需自行补一个 `<link>`。它按组件名而非共用根包名，是因为同空间内逐组件构建共用 `dist/cdn/<空间>` 且 `emptyOutDir: false`，共用一个名字时后一个组件会覆盖前一个。

**键名必须以 `.css` 结尾。** 消费方的 tsc 依赖 `vite/client` 中的 `declare module '*.css'` 来识别这个模块，而该声明匹配的是说明符文本，`@ew/<空间>/css` 不以 `.css` 结尾，匹配不上，即便 exports 指向的确实是个 `.css` 文件也会报 TS2307。

宿主若已引入完整 Element Plus，可直接使用根包的 `easy-webcomp/element-plus.css`，无需逐组件补充。

## 引入方式

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/demo/index.js"></script>

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

需要控制升级时机（例如等布局计算完成后再升级元素）时，使用第二种入口手动调用 `register()`。

空间包尚未发布到 registry，本地可通过 `pnpm add link:<仓库>/dist/<空间>` 接入。`link:` 是软链，重跑构建后立即生效；`file:` 会拷贝一份，重建后不跟随变化。

**ESM 产物是自包含的**：Vue 运行时、组件自身的样式、以及组件显式引入的库样式（如 my-list 引入的 Element Plus）都打包在内，因此宿主项目既不需要安装 `vue` / `element-plus` / `pinia`（它们在空间包中只是 optional peer），也不需要引入任何 CSS，样式在挂载时注入 shadow root。

属性分为两条通道：**string / number / boolean 走 attribute，对象、数组、函数只能走 property**，后三者的类型不在 `observedAttributes` 中，写入 attribute 只会被忽略。

事件名一律带 `ew-` 前缀，且 `bubbles: true, composed: true`，能穿出 shadow root：

```ts
el.addEventListener('ew-select', (e) => console.log(e.detail))
```

`easy-webcomp/tokens.css` 里的 `--ew-*` 是可选的，组件都带兜底值，不引入则只有默认主题。

React 项目里传对象属性：

```tsx
const ref = useRef<HTMLElement>(null)
useEffect(() => {
  if (ref.current) (ref.current as any).payload = { id: 1 }
}, [])
return <ew-hello-vue ref={ref} name="World" />
```

React ≤18 会序列化对象属性，必须走 property 通道；`<ew-hello-vue>` 需要在自己的 `d.ts` 里补充 JSX 类型声明。

Vue 项目里用 `v-bind` 时注意：**只要 prop 名在元素上已定义，Vue 就走 property 通道而不是 attribute 通道**，值不会经过字符串化与类型强转。因此数字要传数字、布尔要传真布尔，传 `''` 表示布尔为真会被 Vue 的 Boolean prop 转换一律当成 `false`。文档站的交互面板即按这条规则实现。

### 框架产物

上一节那套 Web Component 用法，代价是无法跨越框架边界：props 只能走 attribute、事件是 `CustomEvent` 而非 `@select`、用不了宿主的插槽。宿主本身即为 Vue 3 或 React 项目时，这些代价无须承担，可直接使用原生组件形态：

```ts
import { MyList } from '@ew/self-monitor/vue'
import 'easy-webcomp/element-plus.css'   // 宿主已经引了 Element Plus 就不用引
```

```tsx
import { MyList } from '@ew/self-monitor/react'
```

- `@ew/<空间>/vue` 只包含该空间里用 `Component.vue` 写的组件，`@ew/<空间>/react` 只包含 `Component.tsx` 写的；某一侧没有组件时该子路径不存在。
- 事件按宿主框架的写法接入：Vue 用 `@select`，React 用 `onSelect`。
- 组件样式随模块自动注入，不需要逐个引入 css；未用到的组件会被 tree-shaking 摇掉。
- **Vue / React / Element Plus / Pinia 都不打进产物**，使用宿主自己的那份。空间包将它们声明为 optional peer，安装了才会产生约束，未安装不告警。
- 组件库样式（Element Plus）单独一个入口，宿主已有则不必引入。
- 顶层挂载的那层 div 带 `class="ew-<组件名>-host"`，要对它设宽高就选这个类。

## 体积基线

最近一次构建（gzip）。后续构建应与这张表对比，某个产物突然变大说明引入了未察觉的大依赖：

| 产物 | gzip |
|---|---|
| `dist/cdn/demo/hello-vue.js` | 27.0 KB |
| `dist/cdn/demo/hello-react.js` | 69.4 KB |
| `dist/cdn/demo/index.js` | 95.1 KB |
| `dist/cdn/self-monitor/my-list.js` | 393.6 KB |
| `dist/cdn/self-monitor/index.js` | 393.6 KB |

移除跨空间的 `ew-all.js` 后，各空间按需引入：此前使用 demo 的两个组件，要么引两次单组件文件（运行时各内联一份），要么引 464.2 KB 的 `ew-all.js`，使 self-monitor 那份 Element Plus 一并被引入。现在引入 `demo/index.js` 只需 95.1 KB。`self-monitor/index.js` 与它那个单组件文件同为 393.6 KB 属正常现象：该空间只有一个组件，共享运行时的收益没有第二个组件来分摊。数字比更早的基线大，是因为 `my-list`（Element Plus + Pinia，单文件就近 400 KB）在那份基线写下之后才加入仓库，与本次改动无关。

ESM 与框架产物的体积随打包器与引入方式而定，不在基线对比范围内。两点值得留意：`dist/demo/framework/vue.js`（1.1 KB）现在只含 `hello-vue`，`dist/self-monitor/framework/vue.js`（27.8 KB）只含 `my-list`，后者仍引 Element Plus 与 Pinia，故比前者大两个数量级；ESM 侧原本全仓库共享的那份 Vue 运行时，现在每个空间包各带一份。

## 已知约束

- **不要用 `:host` 写变量默认值。** 优先级高于宿主继承来的值，换肤会静默失效。
- **事件必须带 `composed: true`。** 漏了事件出不了 shadow root，且不报错。桥接层已统一处理，手写事件时注意。
- **CDN 产物必须静态替换 `process.env.NODE_ENV`。** Vite lib 模式默认不替换（留给宿主打包器），但 IIFE 没有宿主打包器。构建脚本已处理。
- **`customElements.define` 同 tag 重复注册直接抛错。** 桥接层的 `registerElement` 做了两层去重（模块级 Map + `customElements.get()` 兜底），后者是跨 bundle 场景下唯一有效的防线。
- **IIFE 不支持多入口。** 因此 CDN 侧逐组件构建，空间 `index.js` 也是独立的一次单入口构建（它 import 本空间全部组件，不是多入口）。
