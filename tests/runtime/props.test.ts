import { describe, expect, it } from 'vitest'
import { attrNameFor, coerceAttr, isAttributeChannel } from '@ew/runtime'

describe('attrNameFor', () => {
  it('camelCase 属性名默认转 kebab-case', () => {
    expect(attrNameFor('autoLoad', { type: 'boolean' })).toBe('auto-load')
  })

  it('显式 attr 优先', () => {
    expect(attrNameFor('endpoint', { type: 'string', attr: 'data-endpoint' })).toBe(
      'data-endpoint',
    )
  })

  it('全小写属性名保持不变', () => {
    expect(attrNameFor('name', { type: 'string' })).toBe('name')
  })
})

describe('isAttributeChannel', () => {
  it('标量走 attribute 通道', () => {
    expect(isAttributeChannel('string')).toBe(true)
    expect(isAttributeChannel('number')).toBe(true)
    expect(isAttributeChannel('boolean')).toBe(true)
  })

  it('对象与函数不走 attribute 通道', () => {
    expect(isAttributeChannel('object')).toBe(false)
    expect(isAttributeChannel('array')).toBe(false)
    expect(isAttributeChannel('function')).toBe(false)
  })
})

describe('coerceAttr', () => {
  it('null 转 undefined', () => {
    expect(coerceAttr(null, 'string')).toBeUndefined()
  })

  it('boolean 存在即为 true', () => {
    expect(coerceAttr('', 'boolean')).toBe(true)
    expect(coerceAttr('true', 'boolean')).toBe(true)
  })

  it('boolean 显式 false 字符串为 false', () => {
    expect(coerceAttr('false', 'boolean')).toBe(false)
  })

  it('number 正常解析', () => {
    expect(coerceAttr('42', 'number')).toBe(42)
    expect(coerceAttr('-1.5', 'number')).toBe(-1.5)
  })

  it('number 非法值转 undefined', () => {
    expect(coerceAttr('abc', 'number')).toBeUndefined()
  })

  it('string 原样返回', () => {
    expect(coerceAttr('hello', 'string')).toBe('hello')
  })
})
