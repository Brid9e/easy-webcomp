import { computed, reactive, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { ComponentMeta, PropDefinition } from '@ew/runtime'

export interface EventEntry {
  name: string
  detail: unknown
  at: string
}

export interface PropControls {
  propDefs: ComputedRef<Array<[string, PropDefinition]>>
  values: Record<string, string>
  booleanValues: Record<string, boolean>
  model: ComputedRef<Record<string, unknown>>
}

/**
 * 属性面板的状态机。主区（渲染）与右栏（编辑）共用同一份，所以放在这里而不是各自持有。
 *
 * 只接受 meta 作为入参、不 import component-index —— 后者带 import.meta.glob，
 * 会把这条逻辑拖出可单测的范围。
 */
export function usePropControls(meta: Ref<ComponentMeta | undefined>): PropControls {
  const propDefs = computed(() => Object.entries(meta.value?.props ?? {}))

  const values = reactive<Record<string, string>>({})
  const booleanValues = reactive<Record<string, boolean>>({})

  // 已存在就不覆盖：切换组件再切回来时，用户改过的值要留着
  function initValue(name: string, type: string, fallback: unknown): void {
    if (type === 'boolean') {
      if (!(name in booleanValues)) booleanValues[name] = Boolean(fallback)
      return
    }
    if (!(name in values)) values[name] = fallback === undefined ? '' : String(fallback)
  }

  watch(
    propDefs,
    (defs) => {
      for (const [name, def] of defs) initValue(name, def.type, def.default)
    },
    { immediate: true },
  )

  // Vue 给自定义元素打 v-bind 时，只要该 key 在元素上是已定义的属性，就走 property 通道而不是
  // attribute 通道 —— 而桥接层给每个声明过的 prop 都装了 accessor。所以这里必须传**已定型**的值：
  // 传字符串会原样落进组件（`count` 变成 `'7'`，Vue 报 prop 类型警告），传 `''` 表示布尔为真更是
  // 直接失效（Vue 的 Boolean prop 转换把 `''` 一律当 false）。
  //
  // 只定型 string / number / boolean 三种。PropType 里的 object / array / function 走 `else`
  // 分支，会被当成文本框里的字符串原样传过去 —— 这三种属性目前在面板里没有可用的编辑方式，
  // 遇到时应当先补一个编辑控件（以及取值方式），而不是在这里猜测怎么解析。
  const model = computed<Record<string, unknown>>(() => {
    const result: Record<string, unknown> = {}
    for (const [name, def] of propDefs.value) {
      if (def.type === 'boolean') result[name] = booleanValues[name]
      else if (def.type === 'number') result[name] = Number(values[name] || 0)
      else result[name] = values[name]
    }
    return result
  })

  return { propDefs, values, booleanValues, model }
}

export interface EventLog {
  entries: Ref<EventEntry[]>
  wcHandlers: ComputedRef<Record<string, (e: Event) => void>>
}

/** 事件日志。`wcHandlers` 是 WC 模式要的 `v-on` 映射 —— 事件名得自己拼 `ew-` 前缀。 */
export function useEventLog(eventNames: Ref<string[] | undefined>): EventLog {
  const entries = ref<EventEntry[]>([])

  function log(name: string, detail: unknown): void {
    entries.value.unshift({ name, detail, at: new Date().toLocaleTimeString() })
    entries.value = entries.value.slice(0, 20)
  }

  // 事件必须在宿主元素上逐个绑 —— 不绑就没有监听者，这就是原来只写死 @ew-select 时
  // meta.events 里其他事件收不到的原因。
  const wcHandlers = computed<Record<string, (e: Event) => void>>(() =>
    Object.fromEntries(
      (eventNames.value ?? []).map((name) => [
        `ew-${name}`,
        (e: Event) => log(name, (e as CustomEvent).detail),
      ]),
    ),
  )

  return { entries, wcHandlers }
}
