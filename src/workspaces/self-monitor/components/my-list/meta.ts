import { defineComponentMeta } from '@ew/runtime'

export default defineComponentMeta({
  tag: 'ew-my-list',
  // shadow 打开：本组件样式进 shadow root，不再落到整页。
  // 但同一份 CSS 还会被 runtime 往 document.head 再放一份，这不是冗余，而是必需的：
  // `:root` 在 shadow 树里匹配不到元素，Element Plus 的 --el-* 变量得靠 head 那份定义在
  // 真实 <html> 上再继承进来；下拉、日期面板、弹框这些 Teleport 到 body 的浮层也落在
  // 树外，只有 head 那份能命中。详见 packages/runtime/src/style.ts。

  shadow: true,
  props: {
    // 面板标题，也是验证「attribute → property」这条通道的实例属性
    label: { type: 'string', default: '我的列表' },
  },
  events: ['select'],
})
