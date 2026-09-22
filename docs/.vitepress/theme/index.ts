import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import '@src/tokens/tokens.css'
import ComponentDemo from './components/ComponentDemo.vue'
import ComponentDetail from './components/ComponentDetail.vue'
import WorkspaceGrid from './components/WorkspaceGrid.vue'
import WorkspaceIndex from './components/WorkspaceIndex.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ComponentDemo', ComponentDemo)
    app.component('ComponentDetail', ComponentDetail)
    app.component('WorkspaceGrid', WorkspaceGrid)
    app.component('WorkspaceIndex', WorkspaceIndex)
  },
} satisfies Theme
