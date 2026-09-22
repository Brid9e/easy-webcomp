# hello-react

用 React 19 写的示例组件。点击按钮会派发一次 `ew-select` 事件。

<ComponentDemo name="hello-react" />

## 用法

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/hello-react.js"></script>

<ew-hello-react name="World" count="3"></ew-hello-react>
```

npm ESM：

```ts
import 'easy-webcomp/hello-react/define'
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
| `ew-select` | `{ source: 'hello-react', name: string }` |

事件带 `composed: true`，能穿透 shadow root 冒泡到 `window`。

## 说明

组件源码在 `src/components/hello-react/Component.tsx`。注意 React 项目里传对象属性必须走 property 通道（React ≤18 会把对象属性序列化），具体见[构建与产物](/guide/build)的「引入方式」。
