import { defineComponentMeta } from '@ew/runtime'

export default defineComponentMeta({
  tag: 'ew-my-list',
  // 关掉 Shadow DOM 是 UI 库逼的：Element Plus 的主题变量在 :root 上、浮层 Teleport 到
  // document.body，antd / Ant Design Vue 的样式运行时注入 document.head —— 都够不到 shadow
  // root 里面。代价是本组件样式不再隔离，会落到 document.head 影响整页。

  shadow: false,
  props: {
    // 面板标题，也是验证「attribute → property」这条通道的活体属性
    label: { type: 'string', default: '我的列表' },
  },
  events: ['select'],
})
