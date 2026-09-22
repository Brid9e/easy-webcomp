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
├── style.scss        # 唯一样式来源，禁止用 <style> 块（选了 Tailwind 是 style.css）
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

`shadow: true` 是默认值。`style.scss` 交给桥接层按 Shadow DOM 投递，因此组件里不要写 `<style scoped>`，否则样式只存在于源码模式。

## 派发事件

```ts
import { useVueEmit } from '@ew/runtime'   // React 组件改为 useReactEmit

const emit = useVueEmit()
emit('select', { id: 1 })                      // → 派发 ew-select 事件
```

事件名必须出现在 `meta.ts` 的 `events` 数组里，否则开发态会打印警告。事件一律以 `ew-` 为前缀、`composed: true`，能穿透 shadow root。

## 加完之后

不用改导航。构建脚本扫目录生成构建入口，而 `package.json` 的 `exports` 是 pattern，本来就覆盖任意组件名，不用动；文档站同样扫目录 —— 重启后组件会出现在侧边栏与它所属空间的 grid 里，卡片上有框架图标。还没写散文的组件也点得进去，会看到一个只有交互面板的兜底页。想给它一页散文，新建 `docs/workspaces/<空间名>/<组件名>.md`，下次构建就自动改用那一页。

**新增组件目录后要重启 `docs:dev` 与 `pnpm dev`**，和工作空间同理：页面清单、侧边栏、grid 的 glob 都是在启动时定下的，运行时新建的目录不会被收进去。改已有组件的文件则不用重启，保存即热更新。
