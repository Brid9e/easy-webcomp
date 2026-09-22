import { describe, expect, it } from 'vitest'
import { toIdentifier } from '@ew/utils'

describe('toIdentifier（经 @ew/utils 包解析）', () => {
  it('连字符与下划线都按词边界切成大驼峰', () => {
    expect(toIdentifier('hello-vue')).toBe('HelloVue')
    expect(toIdentifier('hello_react')).toBe('HelloReact')
  })

  it('单词名首字母大写', () => {
    expect(toIdentifier('card')).toBe('Card')
  })

  it('数字开头的片段不炸', () => {
    expect(toIdentifier('chart-2d')).toBe('Chart2d')
  })
})
