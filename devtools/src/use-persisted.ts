import { shallowRef, watch, type ShallowRef } from 'vue'

const PREFIX = 'ew-debug:'

/**
 * 调试页的选中项 / 尺寸存 localStorage，下次打开回到上次状态。
 * 读不到、解析失败或类型对不上，一律回落默认值 —— 调试点坏了不该让页面打不开。
 *
 * T 不写约束是有意的：约束成 `string | number | boolean` 会让 TS 把 `320` 推成字面量
 * `320`，于是 `width.value = 400` 编译不过。不约束才会推成 `number`。
 */
export function usePersisted<T>(key: string, fallback: T): ShallowRef<T> {
  function read(): T {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      if (raw === null) return fallback

      const parsed: unknown = JSON.parse(raw)
      // JSON.parse 对类型错误是静默的：数字键下存着 `"wide"` 照样解析成功。
      // 类型对不上就当没存过，否则宽度这类值会一路流进 style。
      // `parsed !== null` 不是多余的：typeof null 也是 'object'，对象/数组型默认值
      // 光靠 typeof 拦不住存进去的 null。
      return parsed !== null && typeof parsed === typeof fallback ? (parsed as T) : fallback
    } catch {
      return fallback
    }
  }

  const value = shallowRef<T>(read())

  watch(value, (next) => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(next))
    } catch {
      // 隐私模式下 setItem 会抛。存不上就算了，不影响本次调试
    }
  })

  return value
}
