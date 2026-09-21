import { createElementClass } from '../../runtime/element'
import { registerElement } from '../../runtime/registry'
import { vueAdapter } from '../../runtime/vue'
import Component from './Component.vue'
import meta from './meta'
import css from './style.css?inline'

export { meta }
export const HelloVueElement = createElementClass(meta, vueAdapter(() => Component), css)
export function register(): void {
  registerElement(meta.tag, HelloVueElement)
}
