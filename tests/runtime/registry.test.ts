import { describe, expect, it } from 'vitest'
import { registerElement, resetRegistry } from '../../src/runtime/registry'
import type { CtcElementConstructor } from '../../src/runtime/types'

function makeCtor(): CtcElementConstructor {
  const ctor = class extends HTMLElement {} as unknown as CtcElementConstructor
  ctor.refresh = () => {}
  return ctor
}

describe('registerElement', () => {
  it('首次注册后可从 customElements 取到同一构造器', () => {
    resetRegistry()
    const ctor = makeCtor()
    const result = registerElement('ctc-test-first', ctor)
    expect(result).toBe(ctor)
    expect(customElements.get('ctc-test-first')).toBe(ctor)
  })

  it('同 tag 二次注册不抛错，返回已注册的构造器', () => {
    resetRegistry()
    const first = makeCtor()
    const second = makeCtor()
    registerElement('ctc-test-dup', first)
    const result = registerElement('ctc-test-dup', second)
    expect(result).toBe(first)
    expect(customElements.get('ctc-test-dup')).toBe(first)
  })

  it('customElements 上已存在同 tag 时复用而不覆盖', () => {
    resetRegistry()
    const external = makeCtor()
    customElements.define('ctc-test-external', external)
    const result = registerElement('ctc-test-external', makeCtor())
    expect(result).toBe(external)
  })
})
