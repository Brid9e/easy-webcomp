import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import '@src/tokens/tokens.css'
import ComponentDemo from './components/ComponentDemo.vue'
import ComponentDetail from './components/ComponentDetail.vue'
import ComponentHeader from './components/ComponentHeader.vue'
import WorkspaceGrid from './components/WorkspaceGrid.vue'
import WorkspaceIndex from './components/WorkspaceIndex.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ComponentDemo', ComponentDemo)
    app.component('ComponentDetail', ComponentDetail)
    // 散文页（docs/workspaces/<空间>/<组件>.md）用它出标题，与兜底页共用同一颗头
    app.component('ComponentHeader', ComponentHeader)
    app.component('WorkspaceGrid', WorkspaceGrid)
    app.component('WorkspaceIndex', WorkspaceIndex)
  },
} satisfies Theme
