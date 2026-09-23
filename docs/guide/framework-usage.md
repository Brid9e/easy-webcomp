# 在 Vue / React 项目里使用

宿主是 Vue 3 或 React 项目时，用框架产物比 Web Component 更顺手：props 是真 props、事件是 `@select` / `onSelect`、不经过自定义元素的边界。

## Vue

```vue
<script setup lang="ts">
import { MyList } from 'easy-webcomp/vue'
import 'easy-webcomp/element-plus.css'
import 'easy-webcomp/tokens.css'
</script>

<template>
  <MyList label="我的列表" @select="onSelect" />
</template>
```

## React

```tsx
import { MyList } from 'easy-webcomp/react'
import 'easy-webcomp/element-plus.css'
import 'easy-webcomp/tokens.css'

export function Page() {
  return <MyList label="我的列表" onSelect={(detail) => console.log(detail)} />
}
```

## 样式从哪来

三份，各管各的：

| 来源 | 谁提供 | 不引会怎样 |
|---|---|---|
| 组件自身样式 | 随模块自动注入 | 无 |
| `element-plus.css` | 消费方，宿主已有 EP 就不必引 | 组件里的 EP 组件没样式 |
| `tokens.css` | 消费方 | 退化成本内置的设计默认值，换肤失效 |

组件样式用 `@layer` 之外的普通规则注入，宿主针对组件写的高权重规则能正常覆盖。`element-plus.css` 则**裹在 `@layer ew` 里**：EP 的 `:root` 带一句 `color-scheme: light`，不降级会把宿主的深色主题翻成浅色。

## 顶层那层 div

每个包装组件在组件外面渲染一层 `<div class="ew-<组件名>-host">`，它的角色与 Web Component 形态下的自定义元素宿主等价 —— `:host` 规则就落在它上面。要设宽高：

```css
.ew-my-list-host { height: 600px; }
```

## 还没支持的

- **SSR**（Nuxt / Next）：产物在挂载时注入样式，服务端渲染没有 `document`。
- **Tailwind 组件**：Tailwind 的 preflight 是全局 reset，与 light DOM 下「不影响其他组件」冲突，这类组件只出 Web Component 形态。
