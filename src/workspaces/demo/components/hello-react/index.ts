import { createElementClass, reactAdapter, registerElement } from '@ew/runtime'
import Component from './Component'
import meta from './meta'
import css from './style.scss?inline'

export { meta }
export const HelloReactElement = createElementClass(
  meta,
  reactAdapter(() => Component),
  css,
)
export function register(): void {
  registerElement(meta.tag, HelloReactElement)
}
