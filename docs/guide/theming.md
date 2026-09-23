# 主题与 token

所有设计 token 定义在 `src/tokens/tokens.css`，前缀 `--ew-`。

## 换肤

覆盖任意 `--ew-*` 变量即可，无需 `::part()`：

```css
:root {
  --ew-color-primary: #ff4d4f;
}
```

组件内部一律用 `var(--ew-color-primary, 兜底值)` 取用。**不要在 `:host` 上写变量默认值**：它的优先级高于宿主继承来的值，会使换肤静默失效。该写法不会报错，只是换肤不再起作用。

## 降级到 light DOM

默认每个组件挂 shadow root。给元素加 `disable-shadow` 属性即降级到 light DOM，样式改为注入 `document.head`（相同 CSS 只注入一次）：

```html
<ew-hello-vue name="World" disable-shadow></ew-hello-vue>
```

降级后宿主页面的样式可以直接作用到组件内部，代价是失去 Shadow 隔离。

## 文档站的主题来源

`docs/.vitepress/theme/custom.css` 把 `--vp-c-brand-*` 指向 `--ew-color-primary`，因此文档站与组件共用同一份视觉来源。映射方向是 `--ew-*` → `--vp-c-*`，而非反向：token 同时供消费方使用，是一等公民；VitePress 的变量仅服务于文档站自身。
