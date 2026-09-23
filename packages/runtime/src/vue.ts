import {
  createApp,
  h,
  inject,
  ref,
  shallowRef,
  type App,
  type Plugin,
  type Ref,
  type ShallowRef,
} from 'vue'
import type { ElementAdapter, EmitFn } from './types.ts'

export const EW_EMIT_KEY: unique symbol = Symbol('ew-emit')
export const EW_ACTIVE_KEY: unique symbol = Symbol('ew-active')

export interface VueAdapterOptions {
  /**
   * 插件工厂，每个元素实例 mount 时调用一次。
   *
   * 必须是工厂而不是数组：一个 WC 元素一份状态才是对的语义 —— 传数组会让同页两个
   * 同名元素共享同一个 Pinia，改一处两处全变。Pinia 的 install 会把实例 provide 给
   * 这个 app，所以组件 setup 里 useXxxStore() 拿到的是本元素的那份。
   */
  plugins?: () => Plugin[]
}

interface VueInstance {
  app: App
  propsRef: ShallowRef<Record<string, unknown>>
  activeRef: ShallowRef<boolean>
}

export function vueAdapter(
  getComponent: () => unknown,
  options: VueAdapterOptions = {},
): ElementAdapter {
  return {
    mount(host, props, emit) {
      const propsRef = shallowRef<Record<string, unknown>>({ ...props })
      // 断开不一定等于销毁（keep-alive），组件靠它区分「被藏起来」与「还在台上」
      const activeRef = shallowRef(true)
      const app = createApp({
        render: () => h(getComponent() as never, propsRef.value),
      })
      app.provide(EW_EMIT_KEY, emit)
      app.provide(EW_ACTIVE_KEY, activeRef)
      // 必须装在 mount 之前：store 是在组件 setup 里就调用 useXxxStore() 的，晚装取不到
      for (const plugin of options.plugins?.() ?? []) app.use(plugin)
      app.mount(host as HTMLElement)
      const instance: VueInstance = { app, propsRef, activeRef }
      return instance
    },
    update(instance, props) {
      ;(instance as VueInstance).propsRef.value = { ...props }
    },
    setActive(instance, active) {
      ;(instance as VueInstance).activeRef.value = active
    },
    unmount(instance) {
      ;(instance as VueInstance).app.unmount()
    },
  }
}

/**
 * 元素是否处于激活状态。
 *
 * 带 keep-alive 的元素被移出文档时转为 false —— 组件据此停掉轮询、取消请求。不带该属性
 * 的元素断开即卸载，组件根本不会被渲染到「失活」那一刻，用不上这个。
 */
export function useVueActive(): Ref<boolean> {
  const active = inject<ShallowRef<boolean> | null>(EW_ACTIVE_KEY, null)
  if (!active) {
    console.warn('[ew] useVueActive() 在 EW_ACTIVE_KEY 未注入的上下文中被调用，恒为 true。')
    return ref(true)
  }
  return active
}

export function useVueEmit(): EmitFn {
  const emit = inject<EmitFn | null>(EW_EMIT_KEY, null)
  if (!emit) {
    console.warn('[ew] useVueEmit() 在 EW_EMIT_KEY 未注入的上下文中被调用，事件不会被派发。')
    return () => {}
  }
  return emit
}
