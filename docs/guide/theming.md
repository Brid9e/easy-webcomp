# 主题与 token

所有设计 token 定义在 `src/tokens/tokens.css`，前缀 `--ctc-`。

## 换肤

覆盖任意 `--ctc-*` 变量即可，无需 `::part()`：

```css
:root {
  --ctc-color-primary: #ff4d4f;
}
```

组件内部一律用 `var(--ctc-color-primary, 兜底值)` 取用。**不要在 `:host` 上写变量默认值** —— 它的优先级高于宿主继承来的值，会让换肤静默失效。这是最容易踩的坑：写了不报错，只是换肤不起作用。

## 降级到 light DOM

默认每个组件挂 shadow root。给元素加 `disable-shadow` 属性即降级到 light DOM，样式改为注入 `document.head`（相同 CSS 只注入一次）：

```html
<ctc-hello-vue name="World" disable-shadow></ctc-hello-vue>
```

降级后宿主页面的样式可以直接作用到组件内部，代价是失去 Shadow 隔离。

## 文档站自己也吃这套 token

`docs/.vitepress/theme/custom.css` 把 `--vp-c-brand-*` 指向 `--ctc-color-primary`，所以文档站与组件的视觉是同一份来源。方向是 `--ctc-*` → `--vp-c-*` 而不是反过来：token 是一等公民（消费方也要用），VitePress 的变量只是文档站私有的皮肤。
