import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { ComponentMeta } from '@ew/runtime'
import { useEventLog, usePropControls } from '../../devtools/shared/preview-state'

describe('usePropControls', () => {
  it('首帧 model 就是声明里的默认值', () => {
    const meta = ref<ComponentMeta | undefined>({
      tag: 'ew-demo',
      props: {
        name: { type: 'string', default: 'World' },
        count: { type: 'number', default: 3 },
        autoLoad: { type: 'boolean', default: false },
      },
    })

    const { model } = usePropControls(meta)

    expect(model.value).toEqual({ name: 'World', count: 3, autoLoad: false })
  })

  it('值是已定型的：boolean 真布尔、number 走 Number()、string 原样', () => {
    const meta = ref<ComponentMeta | undefined>({
      tag: 'ew-demo',
      props: {
        name: { type: 'string', default: 'World' },
        count: { type: 'number', default: 0 },
        autoLoad: { type: 'boolean', default: false },
      },
    })

    const { values, booleanValues, model } = usePropControls(meta)
    values.name = 'Hi'
    values.count = '7'
    booleanValues.autoLoad = true

    // 走 property 通道，传字符串会原样落进组件（count 变成 '7'）：
    // 这条断言就是那个坑的守门人
    expect(model.value).toEqual({ name: 'Hi', count: 7, autoLoad: true })
  })

  it('number 输入框清空时回落 0，而不是 NaN', () => {
    const meta = ref<ComponentMeta | undefined>({
      tag: 'ew-demo',
      props: { count: { type: 'number', default: 3 } },
    })

    const { values, model } = usePropControls(meta)
    values.count = ''

    expect(model.value).toEqual({ count: 0 })
  })

  it('组件切走再切回来，用户改过的值不被默认值覆盖', async () => {
    const meta = ref<ComponentMeta | undefined>({
      tag: 'ew-a',
      props: { name: { type: 'string', default: 'World' } },
    })
    const { values, model } = usePropControls(meta)
    values.name = 'Mine'

    meta.value = { tag: 'ew-b', props: { other: { type: 'string', default: 'x' } } }
    await nextTick()
    meta.value = { tag: 'ew-a', props: { name: { type: 'string', default: 'World' } } }
    await nextTick()

    expect(model.value).toEqual({ name: 'Mine' })
  })
})

describe('useEventLog', () => {
  it('wcHandlers 按 meta.events 生成 ew- 前缀的键', () => {
    const names = ref<string[] | undefined>(['select', 'change'])
    const { wcHandlers } = useEventLog(names)

    expect(Object.keys(wcHandlers.value)).toEqual(['ew-select', 'ew-change'])
  })

  it('handler 从 CustomEvent 取 detail 记进日志，事件名不带前缀', () => {
    const names = ref<string[] | undefined>(['select'])
    const { entries, wcHandlers } = useEventLog(names)

    wcHandlers.value['ew-select']!(new CustomEvent('ew-select', { detail: { id: 1 } }))

    expect(entries.value).toHaveLength(1)
    expect(entries.value[0]).toMatchObject({ name: 'select', detail: { id: 1 } })
  })

  it('meta.events 缺失时没有 handler，也不报错', () => {
    const names = ref<string[] | undefined>(undefined)
    const { wcHandlers } = useEventLog(names)

    expect(wcHandlers.value).toEqual({})
  })
})
