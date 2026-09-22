import { createElementClass } from '../../../../runtime/element'
import { registerElement } from '../../../../runtime/registry'
import { reactAdapter } from '../../../../runtime/react'
import Component from './Component'
import meta from './meta'
import css from './style.css?inline'

export { meta }
export const HelloReactElement = createElementClass(
  meta,
  reactAdapter(() => Component),
  css,
)
export function register(): void {
  registerElement(meta.tag, HelloReactElement)
}
