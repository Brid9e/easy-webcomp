import {
  createApp,
  h,
  inject,
  shallowRef,
  type App,
  type Plugin,
  type ShallowRef,
} from 'vue'
import type { ElementAdapter } from './types'

export const EW_EMIT_KEY: unique symbol = Symbol('ew-emit')

export type EmitFn = (name: string, detail?: unknown) => void

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
}

export function vueAdapter(
  getComponent: () => unknown,
  options: VueAdapterOptions = {},
): ElementAdapter {
  return {
    mount(host, props, emit) {
      const propsRef = shallowRef<Record<string, unknown>>({ ...props })
      const app = createApp({
        render: () => h(getComponent() as never, propsRef.value),
      })
      app.provide(EW_EMIT_KEY, emit)
      // 必须装在 mount 之前：store 是在组件 setup 里就调用 useXxxStore() 的，晚装取不到
      for (const plugin of options.plugins?.() ?? []) app.use(plugin)
      app.mount(host as HTMLElement)
      const instance: VueInstance = { app, propsRef }
      return instance
    },
    update(instance, props) {
      ;(instance as VueInstance).propsRef.value = { ...props }
    },
    unmount(instance) {
      ;(instance as VueInstance).app.unmount()
    },
  }
}

export function useEmit(): EmitFn {
  const emit = inject<EmitFn | null>(EW_EMIT_KEY, null)
  if (!emit) {
    console.warn('[ew] useEmit() 在 EW_EMIT_KEY 未注入的上下文中被调用，事件不会被派发。')
    return () => {}
  }
  return emit
}
