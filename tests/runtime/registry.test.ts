import { describe, expect, it } from 'vitest'
import { registerElement, resetRegistry } from '../../src/runtime/registry'
import type { EwElementConstructor } from '../../src/runtime/types'

function makeCtor(): EwElementConstructor {
  const ctor = class extends HTMLElement {} as unknown as EwElementConstructor
  ctor.refresh = () => {}
  return ctor
}

describe('registerElement', () => {
  it('首次注册后可从 customElements 取到同一构造器', () => {
    resetRegistry()
    const ctor = makeCtor()
    const result = registerElement('ew-test-first', ctor)
    expect(result).toBe(ctor)
    expect(customElements.get('ew-test-first')).toBe(ctor)
  })

  it('同 tag 二次注册不抛错，返回已注册的构造器', () => {
    resetRegistry()
    const first = makeCtor()
    const second = makeCtor()
    registerElement('ew-test-dup', first)
    const result = registerElement('ew-test-dup', second)
    expect(result).toBe(first)
    expect(customElements.get('ew-test-dup')).toBe(first)
  })

  it('customElements 上已存在同 tag 时复用而不覆盖', () => {
    resetRegistry()
    const external = makeCtor()
    customElements.define('ew-test-external', external)
    const result = registerElement('ew-test-external', makeCtor())
    expect(result).toBe(external)
  })
})
