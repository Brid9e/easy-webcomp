import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import '@src/tokens/tokens.css'
import './custom.css'

export default {
  extends: DefaultTheme,
} satisfies Theme
