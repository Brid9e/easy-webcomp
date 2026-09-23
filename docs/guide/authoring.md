# 新增一个组件

## 先建一个工作空间

组件必须属于某个工作空间。工作空间是一个目录 + 一份清单，用脚手架生成：

```bash
pnpm run new:workspace my-space
```

```
src/workspaces/my-space/
├── workspace.ts            # 展示名与描述，供文档站用
├── styles/
│   └── index.scss          # 空间共享的变量与 mixin，组件按需 @use
└── components/             # 组件都放这里
```

目录名就是工作空间 id，清单里不重复声明。**新建后必须重启 `docs:dev` 与 `pnpm dev`** —— 页面清单、侧边栏与 grid 都在启动时就定好了，运行时冒出来的新目录不会被收进去。

工作空间不影响交付：tag、`npm` 子路径、CDN 文件名都不带空间前缀。代价是**组件名要全局唯一**，两个空间下同名会在构建时报错。

## 再加一个组件

在空间的 `components/` 下新建目录，放入五个文件即可，**不需要修改任何构建配置或路由**：

```
src/workspaces/<空间名>/components/<组件名>/
├── Component.vue     # 或 Component.tsx，二者只能有一个
├── meta.ts           # 组件契约：tag、props、events
├── style.scss        # 组件自己的样式（选了 Tailwind 是 style.css）
├── index.ts          # 入口：导出构造器与 register()
└── define.ts         # 副作用入口，CDN 产物用
```

`Component.vue` 与 `Component.tsx` **必须且只能有一个**。两个都有或都没有，构建脚本与文档站扫描都会直接抛错。

## 样式：SCSS 与空间共享

组件样式默认写 `style.scss`；`.css` 也照收，构建管线对两者一视同仁，只是拿不到预处理器能力。

空间级共享的变量与 mixin 放 `<空间>/styles/index.scss`，组件里按需取用：

```scss
@use 'my-space/styles' as styles;

.ew-card {
  padding: styles.$gutter;
  @include styles.focus-ring;
}
```

写空间名而不是 `../../styles` 是有意的：构建与文档站都把 `scss` 的解析路径指向了 `src/workspaces`，路径因此与组件所在层级解耦，组件目录挪到更深一层也不用改这行。

**例外：选了 Tailwind 的组件生成的是 `style.css`。** `@tailwindcss/vite` 不处理 `.scss` —— 写进 `.scss` 的 `@import "tailwindcss"` 会被 Sass 当成待解析的 partial 而报错。这是工具链的硬约束，不是风格选择；Tailwind 组件也因此用不上 `@use`。

### `<style>` 块只用来引第三方样式表

组件自己的样式一律写 `style.scss`。`Component.vue` 里再开一个 `<style>` 块只有一个正当用途：把第三方库的样式表拉进来 —— 宿主按需引入 Element Plus 时，组件用到的子组件样式不会被自动带上，得自己补：

```vue
<style lang="scss">
@use 'element-plus/theme-chalk/src/descriptions.scss';
</style>
```

**不要加 `scoped`。** scope id 只会打到本组件自己 render 出来的元素上，而这类样式表命中的是第三方组件的内部元素，加了 `scoped` 绝大多数规则永远不匹配，且不报错。

这份 CSS 走 Vite 的抽取管线，会被单独出一个文件而不是随模块注入，所以框架消费方要显式引一次 `@ew/<空间>/styles.css`（详见[构建与产物](build.md#组件里的-style-块)）。什么都没写的空间不产这个文件。

## 类名必须落在组件自己的命名空间里

组件样式的每一个类名都要以 `ew-<组件名>` 打头（UI 库自己的 `el-*` 类除外）：

```scss
.ew-my-list { }            // 根
.ew-my-list__head { }      // BEM 元素
.ew-my-list--active { }    // 修饰符
```

**构建会强制这条规则**，违反直接报错。原因是 shadow 模式关掉之后（框架产物、或组件自己的 `disable-shadow`），样式落到整页，两个组件用了同一个类名就是直接互相覆盖。这条约定没有「看着差不多就行」的余地。

`new:component` 生成的骨架已经按这条规则命名根元素。

## meta.ts

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

`props` 的 `type` 目前支持 `string` / `number` / `boolean`，交互面板按它渲染 text / number / checkbox 三种控件。布尔属性的 attribute 名用 `attr` 显式指定（不指定的话 `autoLoad` 会推导成 `auto-load`，结果一样，写出来更明确）。

`shadow: true` 是默认值。`style.scss` 交给桥接层按 Shadow DOM 投递，因此组件自己的样式都要写在那里 —— `<style>` 块不参与这条路，见上一节。

## 派发事件

```ts
import { useVueEmit } from '@ew/runtime'   // React 组件改为 useReactEmit

const emit = useVueEmit()
emit('select', { id: 1 })                      // → 派发 ew-select 事件
```

事件名必须出现在 `meta.ts` 的 `events` 数组里，否则开发态会打印警告。事件一律以 `ew-` 为前缀、`composed: true`，能穿透 shadow root。

## 被隐藏时该停下来的事

宿主给元素加了 `keep-alive` 时，元素被移出文档不会卸载 —— 组件还能跑，但已经不在台上。轮询、
定时器这类后台动作得自己停，否则页签看不见了接口还在打。用 `useVueActive()`（React 组件改为
`useReactActive()`）读这个信号，用法见[生命周期与状态保持](lifecycle.md#知道自己是「被藏起来了」还是「还在台上」)。

## 加完之后

不用改导航。构建脚本扫目录生成构建入口，而 `package.json` 的 `exports` 是 pattern，本来就覆盖任意组件名，不用动；文档站同样扫目录 —— 重启后组件会出现在侧边栏与它所属空间的 grid 里，卡片上有框架图标。还没写散文的组件也点得进去，会看到一个只有交互面板的兜底页。想给它一页散文，新建 `docs/workspaces/<空间名>/<组件名>.md`，下次构建就自动改用那一页。

**新增组件目录后要重启 `docs:dev` 与 `pnpm dev`**，和工作空间同理：页面清单、侧边栏、grid 的 glob 都是在启动时定下的，运行时新建的目录不会被收进去。改已有组件的文件则不用重启，保存即热更新。
