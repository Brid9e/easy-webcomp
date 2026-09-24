import { describe, expect, it } from 'vitest'
import { AUTH_METHODS, AUTH_METHOD_KEYS, isAuthMethodKey, resolveAuthToken } from '@ew/auth'

describe('AUTH_METHODS', () => {
  it('KEY 都是大写下划线 —— 以后加方式也得守这条', () => {
    for (const key of AUTH_METHOD_KEYS) expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/)
  })

  it('每项都有非空 label 与可调用的 resolve', () => {
    for (const key of AUTH_METHOD_KEYS) {
      const method = AUTH_METHODS[key]
      expect(method.label.length).toBeGreaterThan(0)
      expect(typeof method.resolve).toBe('function')
    }
  })

  it('默认那一种在清单里', () => {
    expect(AUTH_METHOD_KEYS).toContain('SELF_MONITOR_TOKEN')
  })
})

describe('isAuthMethodKey', () => {
  it('清单里的 KEY 认，清单外的不认', () => {
    for (const key of AUTH_METHOD_KEYS) expect(isAuthMethodKey(key)).toBe(true)
    expect(isAuthMethodKey('')).toBe(false)
    expect(isAuthMethodKey('SELF_MONITOR_TYPO')).toBe(false)
  })

  it('原型链上的属性名不算 —— 靠的是 Object.hasOwn 而不是 in', () => {
    // `'toString' in AUTH_METHODS` 是 true，而 AUTH_METHODS['toString'].resolve 会抛
    expect(isAuthMethodKey('toString')).toBe(false)
    expect(isAuthMethodKey('constructor')).toBe(false)
  })
})

describe('resolveAuthToken', () => {
  it('解析不出来时返回 null（调用方拿到的是裸 token，拼不拼 Bearer 是它的事）', () => {
    localStorage.clear()
    expect(resolveAuthToken('SELF_MONITOR_TOKEN')).toBeNull()
  })
})
