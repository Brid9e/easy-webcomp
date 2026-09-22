# 快速开始

用 Vue 3 或 React 编写业务组件，构建管线输出统一形态的 Web Component。支持 npm ESM 引入与 CDN 单文件引入。

组件写哪个框架由你决定：Vue 组件放 `Component.vue`，React 组件放 `Component.tsx`。构建脚本按文件名自动判别，两者最终产出一致的 `<ew-*>` 自定义元素。

组件必须住在某个**工作空间**下，没有隐式的默认空间 —— 见[新增一个组件](/guide/authoring)。

## 安装

```bash
pnpm install
```

## 本地开发

```bash
pnpm dev            # 调试页：http://localhost:5273
pnpm docs:dev       # 文档站：http://localhost:5173
```

**调试页**一次只渲染一个组件，占满视口。容器可以拖拽，也可以按 375 / 768 / 1024 / 铺满 取预设，右上角有实时像素读数——调自适应与移动端场景用它。左栏选组件，右栏改属性、看事件。

文档站的每个组件页上也有一个交互面板，两种模式：

- **WC 模式**（默认）—— 走真实的 `createElementClass` 路径，验证属性传递、事件冒泡、Shadow 隔离。这是消费方实际拿到的东西。
- **源码模式** —— 组件源码直接挂载，用于组件作者调试，可获得原生 HMR 与框架 devtools。

两种模式下属性面板与事件日志都由 `meta.ts` 驱动，不用手写。

## 从这里继续

- [新增一个组件](/guide/authoring)
- [主题与 token](/guide/theming)
- [构建与产物](/guide/build)
