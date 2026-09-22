# easy-webcomp 框架组件产物设计文档

## 1. 一句话定义

在现有 esm / cdn 两个构建目标之外，新增第三个目标：把组件**按源码形态**再打一份原生的 Vue / React 组件产物，通过 `easy-webcomp/vue` 与 `easy-webcomp/react` 两个子路径导出，让宿主框架项目用 `import { MyList } from 'easy-webcomp/vue'` 直接引入；样式随模块走、挂载时注入，组件库（Element Plus）的样式拆成可选入口由消费方自行决定引不引。

## 2. 背景与动机

### 2.1 现状

组件的源码本身就是普通的框架组件：`Component.vue` / `Component.tsx`，`defineProps` 与函数签名就是它们的 props 契约。Web Components 只是外面套的一层壳——`index.ts` 里的 `createElementClass(meta, adapter, css)` 把组件塞进自定义元素，props 走 attribute/property，事件走 `ew-` 前缀的 `CustomEvent`。

也就是说，**框架产物不需要重写任何组件**，它只是绕开那层壳。

### 2.2 用户诉求（2026-09-22）

> 我还想实现一个打包成正常组件的功能，就是打包成 react vue 组件，通过 `import { xxx } from '@ew/components/vue'` 给 vue 或者 react 项目使用，这个好加吗？还有样式要怎么弄，是否需要打包的时候给全局样式包一层哈希 class 名，然后引入后保证不影响其他组件？

### 2.3 为什么需要框架产物

WC 形态是给「宿主没有构建管线、只能 `<script>` 引一个文件」的场景准备的，代价是它跨不过框架边界：props 只能走 attribute（对象得走 property）、事件是 `CustomEvent` 不是 `@select`、不能用宿主的插槽 / `v-model` / context、React 的 `useState` 与 Vue 的响应式各自关在 shadow 里。

宿主本来就是 Vue / React 项目时，这些代价白付。框架产物把壳去掉，让组件以宿主框架的原生形态参与。

### 2.4 已确认的四个取舍

| 取舍点 | 结论 |
|---|---|
| 组件库 CSS 的边界 | **拆成独立入口，不做构建开关**。消费方自己决定引不引 `easy-webcomp/element-plus.css` |
| 样式作用域 | **只改写 `:host`**，其余类名逐字不动。不做内容哈希 |
| SSR | **不支持**，消费方都是 Vite SPA。样式可以在挂载时直接注入 `document.head` |
| 类名唯一性 | **加构建期检查**，并修掉 demo 里已被违反的两处 |

## 3. 产物与入口

```
dist/framework/vue.js            →  easy-webcomp/vue
dist/framework/react.js          →  easy-webcomp/react
dist/framework/element-plus.css  →  easy-webcomp/element-plus.css
```

- `vue.js` 只导出 `Component.vue` 写的组件，`react.js` 只导出 `Component.tsx` 写的。这是源码形态决定的——React 组件没法便宜地变成 Vue 组件。某一侧没有组件时，该入口仍生成一个合法的空模块，不报错。
- 导出名沿用 `toIdentifier(c.name)`，与现有 `all.ts` 一致。
- 用法：

```ts
import { MyList } from 'easy-webcomp/vue'
import 'easy-webcomp/element-plus.css'   // 宿主已经引了 EP 就不用引这一行
```

`exports` 里三条都是**精确键**，按 Node 的解析规则优先于现有的 `./*` 通配，不会跟 `dist/esm` 撞。

## 4. 依赖边界

框架产物必须 `external` 掉 `vue` / `react` / `react-dom` / `react/jsx-runtime`。**这是硬要求**：两份 Vue 会让 `provide` / `inject` 对不上，两份 React 会让 hooks 报错。现有 esm / cdn 产物照旧自带，不受影响。

`@ew/runtime` 反而**要打进去**：包装层与组件源码都用 `EW_EMIT_KEY` 这个 symbol，必须是同一份实例，外置成宿主依赖只会让两边各拿一个。

`package.json` 补 `peerDependencies`（`vue` / `react` / `react-dom` / `react/jsx-runtime`），四个都标 `optional`——Vue 项目不该因为没装 React 被警告。

## 5. 组件契约

包装层的职责只有两件：透传 props、把原生框架事件接到 `EW_EMIT_KEY` 上。组件源码一个字不改。

### 5.1 属性

内层组件自己的 `defineProps` / 函数签名就是契约。包装层原样透传，所以 `:label` / `label=` 的用法与 WC 模式的 attribute 一致。

类型由构建期从 `meta.props` 生成（`string` / `number` / `boolean` 直译，`object` / `array` 退化成 `Record<string, unknown>` / `unknown[]`）。

**已知不足**：`meta.props` 的类型精度不如内层组件的声明，事件 detail 一律是 `unknown`。够用，但不是最终形态；将来若要精确，得加 `@vue/compiler-sfc` 去解 `defineProps<{...}>`，那是另一期的事。

### 5.2 事件

```ts
// Vue：消费方写 @select
provide(EW_EMIT_KEY, (name, detail) => emit(name, detail))

// React：消费方写 onSelect
<EwEmitContext.Provider value={(name, detail) => props[onXxx(name)]?.(detail)}>
```

`meta.events` 里的名字即契约：Vue 用 `@<name>`，React 用 `on` + 首字母大写。

## 6. 样式

### 6.1 组件自身样式

仍以 `?inline` 字符串随模块走，**不单独出 .css 文件**，由包装组件在挂载时注入 `document.head`（幂等去重，复用 `packages/runtime/src/style.ts` 的 light DOM 分支语义）。

三个理由：

1. 不需要消费方逐个引 N 个 css 文件。
2. 注入发生在**挂载时**而不是模块顶层，所以 barrel 导入时未用到的组件会被 tree-shake 掉，样式不会跟着注入。若改成模块顶层注入，就必须给 `package.json` 加 `sideEffects: false` 才摇得掉，而那个字段一旦写错会让 css 被整包丢掉。
3. 样式与组件版本天然同步，不会出现「引了组件忘了引 css」。

**不裹 `@layer`。** 这是组件自己的样式，不是默认值；宿主针对组件写的高权重规则理应能覆盖它。这一点与 WC 模式里那份 head 副本不同——那份裹层是因为它是**重复**的一份，跟宿主抢没有正当性。

### 6.2 `:host` 的改写

`:host` 在 light DOM 里匹配不到任何元素（没有自定义元素了），必须改写。包装组件渲染一层 div，`class="ew-<组件名>-host"`，`:host` 就改写成这个选择器。

**为什么是额外一层 div，而不是把类挂到组件自己的根元素上**：`my-list` 的根元素已经带 `class="ew-my-list"`，样式里同时有 `:host { display: block }` 和 `.ew-my-list { display: flex }`。两条规则要是落到同一个元素上，`display` 谁赢取决于顺序，会直接坏掉。多一层 div 让两者各归其位，而这层 div 的角色与 WC 模式里的**自定义元素宿主**完全等价——`height: 100%` 的传递链一模一样。

改写用一个 `@ew/runtime` 里的小函数 `rewriteHost(css, selector)`，在生成的包装源码里调用：

```ts
import rawCss from '../../workspaces/demo/components/hello-vue/style.scss?inline'
const css = rewriteHost(rawCss, '.ew-hello-vue-host')
```

**为什么在运行时改而不是构建期用 Vite 插件改**：构建期改写要挂 `transform`，而 `?inline` 模块的产物由 Vite 内置 CSS 插件生成，我们的钩子必须在它之后跑，这是个靠 `enforce` / 插件顺序维持的隐式契约，Vite 升版就可能静默失效。运行时改写是一个纯函数，单测直接覆盖。

### 6.3 Element Plus 样式

独立入口 `dist/framework/element-plus.css`，内容是 `element-plus/dist/index.css` 裹一层 `@layer ew { ... }`。

**必须裹层**，与 WC 模式同一个理由：EP 的 `:root` 里除了 `--el-*` 还带一句 `color-scheme: light`，不分层注入会把宿主的深色主题连同原生控件一起翻成浅色。分层之后它是一份**默认值**——宿主自己写的未分层规则永远赢，宿主完全没引 EP 时这层才顶上来。

生成时注意 EP 那个 css 开头的 `@charset "UTF-8";` 必须提到 `@layer` 块**外面**，留在块里是无效的。

只有 EP 这份分层，组件自身样式不分层，所以两者之间不存在层序问题：组件样式（未分层）恒赢 EP 默认值（分层），这正是想要的。

### 6.4 tokens

维持宿主显式引入，与 WC 模式的文档一致：

```ts
import 'easy-webcomp/tokens.css'
```

组件样式里的 `var(--ew-*, 兜底)` 保证了漏引时只是退化成默认外观，而不是像裸 `var()` 那样赢下层叠把值抹成 initial。

## 7. 构建期检查

新增一条与现有「组件名全局唯一」同级的校验：**组件样式里的每一个类选择器都必须以 `ew-<组件名>` 开头**（`el-` 这类库前缀放行）。

这条检查存在的唯一理由是「不影响其他组件」这句承诺。现状并不成立——demo 里 `hello-vue` 与 `hello-react` **共用 `.ew-hello`**（一个蓝一个红），shadow 模式下相安无事，落到 light DOM 就是直接互相覆盖。构建必须拦住这类情况，而不是靠人自觉。

这里的「组件名」指组件目录名，即 `ComponentInfo.name`。

检查**对所有非 Tailwind 组件生效，与构建目标无关**——三条构建管线（esm / cdn / framework）都在它之后跑。light DOM 撞车只是它最容易显形的地方，`disable-shadow` 模式同样会中招；把不变量做成全局的，比按目标分叉少一处会漂的东西。

实现：`scripts/build.ts` 用已有的 `sass` devDependency 编译每个组件的样式文件（`loadPaths` 复用现有 `cssConfig` 的配置），扫描选择器。不引入新依赖。

**Tailwind 组件不参与这条检查，也不出框架产物**：Tailwind 的 preflight 是一份全局 reset，与「不影响其他组件」在 light DOM 下天然冲突，且它的类名（`.flex` / `.p-4`）无法用前缀规则约束。当前仓库没有任何组件用 Tailwind，所以这条排除今天不产生成本。构建时若在框架入口里发现 Tailwind 组件，直接报错。

## 8. 非目标（YAGNI）

- **不做 SSR**。不做 `typeof window` 守卫，不做样式收集对接。将来要做，样式注入要挪到挂载后的生命周期并补守卫。
- **不做内容哈希类名**。组件名全局唯一（构建强制），哈希换不来新的隔离，却让消费方再也无法覆盖样式。
- **不给框架产物做 CDN / IIFE 版**。它本来就是给有构建管线的宿主用的。
- **不做跨空间或跨组件的样式共享**。
- **不改动现有 esm / cdn 产物的任何行为**。这一期是纯新增。
- **不做 `v-model` / 插槽的专门支持**。组件源码里没有，等真有需求再说。
- **不给 Tailwind 组件出框架产物**，理由见第 7 节。
- **不改 `src/workspaces/self-monitor/`**（在制品）与 `docs/superpowers/**` 既有文件（历史记录）。

## 9. 验证策略

- **单测**：`rewriteHost()` 的改写规则（含 `:host(...)`、注释里的 `:host` 这类边界）；构建期类名前缀检查的正反用例。
- **集成**：文档站本身就是一个真实的 Vue 3 应用，在其中一页引 `dist/framework/vue.js` 渲染一个组件，跑一条 e2e——这条覆盖的是「真实的 Vue 应用 + 真实的 dist 产物」，比任何单测都硬。页面需包 `<ClientOnly>`（VitePress 是 SSR 构建）。
- **React 侧**：同样的方式起一个最小页面，验 `onSelect` 回调与样式注入。
- **人工确认**：宿主已有 EP 时**不引** `element-plus.css`，组件外观应正常；宿主是深色主题时组件不该把它翻成浅色（这一条与 WC 模式的 `@layer` 修复是同一类回归，必须实际看一眼）。

## 10. 落地注意事项

- `package.json` 目前有未提交的 self-monitor 依赖改动（axios / element-plus / pinia），而 `writeExportsField()` 每次构建都会重写这个文件。本期要往里加 `peerDependencies`，提交时必须挑着加，别把在制品一起带进去。
- `src/workspaces/demo/` 的两个组件要改名类前缀（`.ew-hello` → `.ew-hello-vue` / `.ew-hello-react`），根元素与样式文件同步改。这是第 7 节那条检查的直接后果。
