# 快速开始

用 Vue 3 或 React 编写业务组件，构建管线输出统一形态的 Web Component。支持 npm ESM 引入与 CDN 单文件引入。

使用哪个框架由作者决定：Vue 组件放 `Component.vue`，React 组件放 `Component.tsx`。构建脚本按文件名自动判别，两者最终产出一致的 `<ew-*>` 自定义元素。

组件必须属于某个**工作空间**，不存在隐式的默认空间，详见[新增一个组件](/guide/authoring)。

## 安装

```bash
pnpm install
```

## 本地开发

```bash
pnpm dev            # 调试页：http://localhost:5273
pnpm docs:dev       # 文档站：http://localhost:5173
```

**调试页**每次只渲染一个组件并占满视口。容器可拖拽，也可按 375 / 768 / 1024 / 铺满 取预设，右上角显示实时像素读数，用于调试自适应布局与移动端场景。左栏选择组件，右栏修改属性、查看事件。

文档站的每个组件页上也有一个交互面板，使用与消费方完全一致的 `createElementClass` 路径，可验证属性传递、事件冒泡与 Shadow 隔离。

属性面板与事件日志都由 `meta.ts` 驱动，不用手写。

## 后续章节

- [新增一个组件](/guide/authoring)
- [主题与 token](/guide/theming)
- [构建与产物](/guide/build)
- [运行时配置](/guide/config)
