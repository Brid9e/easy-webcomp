import { shallowRef, watch, type ShallowRef } from 'vue'

const PREFIX = 'ew-debug:'

/**
 * 调试页的选中项 / 尺寸存 localStorage，下次打开回到上次状态。
 * 读不到或解析失败一律回落默认值 —— 调试点坏了不该让页面打不开。
 */
export function usePersisted<T extends string | number | boolean>(
  key: string,
  fallback: T,
): ShallowRef<T> {
  let initial = fallback

  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw !== null) initial = JSON.parse(raw) as T
  } catch {
    initial = fallback
  }

  // Vue 3.5 里 shallowRef 的返回类型是 `Ref extends T ? … : ShallowRef<T>` 这个条件类型；
  // T 又是 `string | number | boolean` 联合约束，vue-tsc 会把它分发成
  // ShallowRef<string> | ShallowRef<number> | … 的联合，赋不回 ShallowRef<T>。
  // 运行时返回的确实是 shallowRef，这里只是把类型说清楚。
  const value = shallowRef<T>(initial) as ShallowRef<T>

  watch(value, (next) => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(next))
    } catch {
      // 隐私模式下 setItem 会抛。存不上就算了，不影响本次调试
    }
  })

  return value
}
