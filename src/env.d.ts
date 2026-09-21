/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module 'virtual:ctc-wc-index' {
  const modules: Record<string, { Element: CustomElementConstructor }>
  export default modules
}
