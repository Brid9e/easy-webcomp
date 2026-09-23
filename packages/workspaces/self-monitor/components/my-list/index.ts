import { createElementClass, registerElement, vueAdapter } from '@ew/runtime'
import { createPinia } from 'pinia'
import Component from './Component.vue'
import meta from './meta'
import libCss from 'element-plus/dist/index.css?inline'
import css from './style.scss?inline'

export { meta }
export const MyListElement = createElementClass(meta, vueAdapter(() => Component, { plugins: () => [createPinia()] }), libCss + '\n' + css)
export function register(): void {
  registerElement(meta.tag, MyListElement)
}
