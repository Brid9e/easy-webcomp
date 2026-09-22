import { createElementClass, registerElement, vueAdapter } from '@ew/runtime'
import Component from './Component.vue'
import meta from './meta'
import css from './style.css?inline'

export { meta }
export const HelloVueElement = createElementClass(meta, vueAdapter(() => Component), css)
export function register(): void {
  registerElement(meta.tag, HelloVueElement)
}
