# 新增一个组件

## 创建工作空间

组件必须属于某个工作空间。工作空间是一个目录 + 一份清单，用脚手架生成：

```bash
pnpm run new:workspace my-space
```

```
packages/workspaces/my-space/      # 包名 @ew/my-space
├── workspace.ts            # 展示名与描述，供文档站用
├── package.json            # 空间的依赖清单，也是构建期取版本号的来源
├── styles/
│   └── index.scss          # 空间共享的变量与 mixin，组件按需 @use
└── components/             # 组件都放这里
```

目录名就是工作空间 id，清单里不重复声明。生成后跑一次 `pnpm install` 把它挂进 workspace。**新建后必须重启 `docs:dev` 与 `pnpm dev`**：页面清单、侧边栏与 grid 都在启动时确定，运行时新增的目录不会被收录。

**一个空间一个包。** 组件用到的第三方库是这个空间的依赖，写在空间的 `package.json` 里；产物清单（`dist/<空间>/package.json`）的版本号也从这里读。`pnpm run new:component` 选完配套设施会把依赖直接装进对应空间，不必手工改根 `package.json`。

工作空间不影响交付：tag、`npm` 子路径、CDN 文件名都不带空间前缀。代价是**组件名必须全局唯一**，两个空间下的同名组件会在构建时报错。

## 新增组件

在空间的 `components/` 下新建目录，放入五个文件即可，**不需要修改任何构建配置或路由**：

```
packages/workspaces/<空间名>/components/<组件名>/
├── Component.vue     # 或 Component.tsx，二者只能有一个
├── meta.ts           # 组件契约：tag、props、events
├── style.scss        # 组件自己的样式（选了 Tailwind 是 style.css）
├── index.ts          # 入口：导出构造器与 register()
├── define.ts         # 副作用入口，CDN 产物用
└── mock.ts           # 可选：文档站预览用的假数据
```

`Component.vue` 与 `Component.tsx` **必须且只能有一个**。两个都有或都没有，构建脚本与文档站扫描都会直接抛错。

### `mock.ts`（可选）：文档站预览的假数据

组件要打后端接口时，文档站的演示不该跟着后端的脸色走 —— 写一份 `mock.ts`，预览就渲染假数据。它对外的全部约定是导出**一个** `installMock()`：

```ts
// components/<组件名>/mock.ts
import { http } from './api'

export function installMock(): void {
  http.defaults.adapter = async (config) => ({ data: body, status: 200, statusText: 'OK', headers: {}, config })
}
```

**文档站会装上它，调试页不会。** 两个预览都从 `registerWcElement(name, tag, options)` 注册元素，文档站那两处（`<ComponentDemo>`、截图缺失时回退的真实元素）传 `mock: true`，调试页不传 —— 它存在的意义就是拿真接口验鉴权，装上假数据等于把它废掉。组件目录下没有 `mock.ts` 时这一项无事发生。

三条约束：

- **进不了产物。** 构建从 `index.ts` 出发，`mock.ts` 不在那条链上。认得它的只有预览那侧的虚拟模块 `virtual:ew-wc/<名字>`，生成时按文件在不在决定要不要加一条 export 边。
- **装在 `define` 之前。** 元素一进 DOM 就发第一次请求，`registerWcElement` 里的顺序是排过的：装、再 define。
- **截在适配器那一层，不改组件源码。** 组件保持「一律走真实接口」，假数据只接管出口；真实接口换了，要跟着改的只有假数据里的 URL 分支。

`my-list` 是一份完整的例子，见[排放口清单](/workspaces/self-monitor/my-list)。

## 样式：SCSS 与空间共享

组件样式默认写 `style.scss`；`.css` 同样支持，构建管线对两者一视同仁，但不具备预处理器能力。

空间级共享的变量与 mixin 放 `<空间>/styles/index.scss`，组件里按需取用：

```scss
@use 'my-space/styles' as styles;

.ew-card {
  padding: styles.$gutter;
  @include styles.focus-ring;
}
```

写空间名而不是 `../../styles` 是刻意为之：构建与文档站都把 `scss` 的解析路径指向了 `packages/workspaces`，路径因此与组件所在层级解耦，组件目录移到更深一层也不需要改这行。

**例外：选用 Tailwind 的组件生成的是 `style.css`。** `@tailwindcss/vite` 不处理 `.scss`，写进 `.scss` 的 `@import "tailwindcss"` 会被 Sass 当成待解析的 partial 而报错。这是工具链的硬约束，不是风格选择；Tailwind 组件也因此用不上 `@use`。

Tailwind 可以与 UI 库同选。UI 库要求关掉 Shadow DOM，此时整份 CSS 落到 `document.head`，而 Tailwind 的 preflight 是一份全局 reset，会把宿主页面的标题、列表、按钮样式一并抹平 —— 所以同选时生成的入口是 preflight-free 的 `@import "tailwindcss/theme.css" layer(theme)` + `@import "tailwindcss/utilities.css" layer(utilities)`：主题变量与工具类照常可用，只是不动宿主已有的元素样式。

### `<style>` 块只用来引第三方样式表

组件自身的样式一律写 `style.scss`。`Component.vue` 里再开一个 `<style>` 块只有一个正当用途：引入第三方库的样式表。宿主按需引入 Element Plus 时，组件用到的子组件样式不会被自动带上，需要自行补上：

```vue
<style lang="scss">
@use 'element-plus/theme-chalk/src/descriptions.scss';
</style>
```

**不要加 `scoped`。** scope id 只会打到本组件自身渲染出的元素上，而这类样式表命中的是第三方组件的内部元素，加上 `scoped` 后绝大多数规则永远不会匹配，且不会报错。

这份 CSS 走 Vite 的抽取管线，会被单独出一个文件而不是随模块注入，因此框架消费方要显式引入一次 `@ew/<空间>/styles.css`（详见[构建与产物](build.md#组件里的-style-块)）。没有编写 `<style>` 块的空间不产出这个文件。

## 类名命名空间

组件样式的每一个类名都要以 `ew-<组件名>` 打头（UI 库自己的 `el-*` 类除外）：

```scss
.ew-my-list { }            // 根
.ew-my-list__head { }      // BEM 元素
.ew-my-list--active { }    // 修饰符
```

**构建会强制这条规则**，违反直接报错。原因是 shadow 模式关闭之后（框架产物、或组件自身的 `disable-shadow`），样式会落到整页，两个组件使用同一个类名即直接互相覆盖。这条约定没有例外。

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

`props` 的 `type` 目前支持 `string` / `number` / `boolean`，交互面板按它渲染 text / number / checkbox 三种控件。布尔属性的 attribute 名可用 `attr` 显式指定（不指定时 `autoLoad` 会推导成 `auto-load`，结果相同，写出来更明确）。

`shadow: true` 是默认值。`style.scss` 交给桥接层按 Shadow DOM 投递，因此组件自身的样式都要写在那里；`<style>` 块不参与这条路，见上一节。

## 派发事件

```ts
import { useVueEmit } from '@ew/runtime'   // React 组件改为 useReactEmit

const emit = useVueEmit()
emit('select', { id: 1 })                      // → 派发 ew-select 事件
```

事件名必须出现在 `meta.ts` 的 `events` 数组里，否则开发态会打印警告。事件一律以 `ew-` 为前缀、`composed: true`，能穿透 shadow root。

## 元素隐藏时的后台任务

宿主为元素加上 `keep-alive` 后，元素被移出文档时不会卸载：组件仍在运行，但已不可见。轮询、
定时器这类后台动作需要在此时停止，否则页签不可见后仍会持续请求接口。用 `useVueActive()`
（React 组件改为 `useReactActive()`）读取这个信号，用法见[生命周期与状态保持](lifecycle.md#活跃状态信号)。

## 后续事项

不需要修改导航。构建脚本扫描目录生成构建入口，而 `package.json` 的 `exports` 是 pattern，本就覆盖任意组件名，不用改动；文档站同样扫描目录，重启后组件会出现在侧边栏与所属空间的 grid 中，卡片上带有框架图标。未编写独立页面的组件同样可以访问，会显示一个只含交互面板的页面。需要为其编写页面时，新建 `docs/workspaces/<空间名>/<组件名>.md`，下次构建即自动改用该页。

**新增组件目录后要重启 `docs:dev` 与 `pnpm dev`**，与工作空间同理：页面清单、侧边栏、grid 的 glob 都在启动时确定，运行时新增的目录不会被收录。修改已有组件的文件则不需要重启，保存即热更新。

## 组件卡片上的缩略图

空间页中每张卡片显示的不是实时组件，而是一张静态截图 `docs/public/snapshots/<空间>/<组件名>.png`：空间内组件较多时，页面上同时挂载十几个运行时既慢且没有必要。点击卡片进入详情页、或点击右上角全屏，挂载的才是真实元素。

截图由 `pnpm run snapshot` 生成，**要先跑过 `pnpm run build`**（它引用的正是 `dist/cdn/<空间>/index.js`）。修改组件样式或结构后需要重新生成，否则卡片仍显示旧图，卡片不会感知源码变化。图片提交进 git，因此生成是确定性的：脚本把 `Date.now()` 钉在固定时刻，`my-list` 那类实时计算的时间列不会每次运行都产生无意义的二进制 diff。
