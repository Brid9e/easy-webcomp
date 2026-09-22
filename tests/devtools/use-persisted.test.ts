import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersisted } from '../../devtools/src/use-persisted'

const KEY = 'probe'
const STORAGE_KEY = `ew-debug:${KEY}`

beforeEach(() => {
  localStorage.clear()
})

describe('usePersisted', () => {
  it('没存过时用默认值', () => {
    expect(usePersisted(KEY, 'first').value).toBe('first')
  })

  it('改值后写回 localStorage', async () => {
    const value = usePersisted(KEY, 0)
    value.value = 42
    await nextTick()

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')).toBe(42)
  })

  it('下次打开读回存过的值，而不是默认值', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(768))

    expect(usePersisted(KEY, 0).value).toBe(768)
  })

  it('JSON 解析不了时回落默认值', () => {
    localStorage.setItem(STORAGE_KEY, '{ 不是 json')

    expect(usePersisted(KEY, 0).value).toBe(0)
  })

  // JSON.parse 对类型错误是静默的：数字键下存着 "wide" 也能解析成功。
  // 放过去的话，宽度这类值会一路流进 style。
  it('类型对不上时回落默认值', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('wide'))

    expect(usePersisted(KEY, 0).value).toBe(0)
  })

  it('布尔键存了数字也回落默认值', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(1))

    expect(usePersisted(KEY, false).value).toBe(false)
  })

  it('setItem 抛异常（隐私模式）时本次仍然可用', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    const value = usePersisted(KEY, 'a')
    value.value = 'b'
    await nextTick()

    expect(value.value).toBe('b')
    spy.mockRestore()
  })
})
