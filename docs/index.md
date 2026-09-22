---
layout: home

hero:
  name: easy-webcomp
  text: 写一个组件，交付一个 Web Component
  tagline: 用 Vue 3 或 React 编写业务组件，构建管线输出统一形态的自定义元素 —— npm 与 CDN 双通道，加组件零配置。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/
    - theme: alt
      text: 组件总览
      link: /components/

features:
  - title: Vue 或 React 任选
    details: 组件放 Component.vue 或 Component.tsx，构建脚本按文件名自动判别框架，最终产出一致的 &lt;ew-*&gt; 元素。
    link: /guide/authoring
    linkText: 新增一个组件
  - title: 自包含 Web Component
    details: 运行时内联进单文件产物，一个 &lt;script&gt; 标签即可使用；不依赖宿主框架，不怕样式冲突。
    link: /guide/theming
    linkText: 主题与隔离
  - title: npm 与 CDN 双通道
    details: ESM 多入口产物给打包器用，IIFE 单文件给 CDN 用，两种形态出自同一份源码。
    link: /guide/build
    linkText: 构建与产物
  - title: meta.ts 驱动零配置
    details: tag、props、events 写在 meta.ts 里；构建入口、package exports、文档站导航全部自动生成。
    link: /components/
    linkText: 看组件总览
---
