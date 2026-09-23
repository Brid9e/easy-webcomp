# hello-vue

用 Vue 3 写的示例组件。点击按钮会派发一次 `ew-select` 事件。

<ComponentDemo name="hello-vue" />

## 用法

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/demo/hello-vue.js"></script>

<ew-hello-vue name="World" count="3"></ew-hello-vue>
```

npm ESM：

```ts
import '@ew/demo/hello-vue/define'
```

## 属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `name` | `string` | `World` | 显示在按钮文案里的名字 |
| `count` | `number` | `0` | 显示在按钮文案里的计数 |
| `auto-load` | `boolean` | `false` | 布尔属性，出现即真 |

## 事件

| 事件 | `detail` |
|---|---|
| `ew-select` | `{ source: 'hello-vue', name: string }` |

事件带 `composed: true`，能穿透 shadow root 冒泡到 `window`。

## 说明

组件源码位于 `src/workspaces/demo/components/hello-vue/Component.vue`。框架选择不影响交付形态：Vue 与 React 组件产出的都是 `<ew-hello-vue>` 自定义元素。
