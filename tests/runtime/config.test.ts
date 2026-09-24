import { beforeEach, describe, expect, it } from 'vitest'
import { configure, getConfig, resetConfig, type EwConfig } from '@ew/runtime'

beforeEach(() => {
  resetConfig()
})

describe('configure / getConfig', () => {
  it('没配过时是空的', () => {
    expect(getConfig()).toEqual({})
  })

  it('顶层浅合并，后调的键压过前调的同名键', () => {
    configure({ baseURL: '/a' })
    configure({ timeout: 3_000 })
    expect(getConfig()).toEqual({ baseURL: '/a', timeout: 3_000 })
  })

  it('headers 整体替换，而不是逐键合并', () => {
    configure({ headers: { a: '1', b: '2' } })
    configure({ headers: { b: '9' } })
    expect(getConfig().headers).toEqual({ b: '9' })
  })

  it('undefined 的键不参与合并', () => {
    configure({ baseURL: '/a' })
    // 类型上就传不进来（exactOptionalPropertyTypes 下可选键只能是缺席），
    // 这里绕过类型测的是运行时那条 if —— CDN 侧没有类型挡着，写的是裸 JS。
    configure({ baseURL: undefined } as unknown as EwConfig)
    expect(getConfig().baseURL).toBe('/a')
  })
})

describe('getConfig 返的是副本', () => {
  it('改返回值不动存储，headers 也是', () => {
    configure({ baseURL: '/a', headers: { a: '1' } })
    const got = getConfig()
    got.baseURL = '/changed'
    got.headers!.a = 'changed'
    expect(getConfig()).toEqual({ baseURL: '/a', headers: { a: '1' } })
  })
})

describe('全局槽', () => {
  it('直接读写 globalThis.__ew_config__ 能被 getConfig 看见', () => {
    // 「多副本共享」在单测里唯一能表达的形式：另一个副本写的就是这个槽
    ;(globalThis as unknown as { __ew_config__?: unknown }).__ew_config__ = { baseURL: '/from-other' }
    expect(getConfig().baseURL).toBe('/from-other')
  })

  it('resetConfig 之后又回到空的', () => {
    configure({ baseURL: '/a' })
    resetConfig()
    expect(getConfig()).toEqual({})
  })
})

describe('@ew/runtime/config 子路径', () => {
  it('与桶是同一份实现，写的是同一个槽', async () => {
    const subpath = await import('@ew/runtime/config')
    subpath.configure({ baseURL: '/via-subpath' })
    expect(getConfig().baseURL).toBe('/via-subpath')
  })
})
