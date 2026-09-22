import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import '@src/tokens/tokens.css'
import ComponentDemo from './components/ComponentDemo.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ComponentDemo', ComponentDemo)
  },
} satisfies Theme
