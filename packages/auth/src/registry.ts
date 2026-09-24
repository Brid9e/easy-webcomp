import { resolveSelfMonitorToken, type AuthProbe, type AuthResolver } from './resolvers'

/**
 * 按大写下划线的 KEY 选鉴权方式。KEY 是对外契约（宿主与组件按它挑），label 只服务界面文案。
 *
 * 不做 registerAuthMethod() 这类运行时注册：现在没有第二个来源。等真有宿主自带的方式要挂进来，
 * 那时才知道接口该长什么样。
 */
export const AUTH_METHODS = {
  SELF_MONITOR_TOKEN: {
    label: '自行监测系统 token 解析',
    resolve: resolveSelfMonitorToken,
  },
} as const satisfies Record<string, { label: string; resolve: AuthResolver }>

export type AuthMethodKey = keyof typeof AUTH_METHODS

/**
 * 全 KEY 列表，顺序即清单顺序 —— 下拉与守卫都从这里取。
 * readonly 不是装饰：谁就地 sort 一下顺序就变了，而清单顺序就是下拉显示的顺序。
 */
export const AUTH_METHOD_KEYS: readonly AuthMethodKey[] = Object.keys(
  AUTH_METHODS,
) as AuthMethodKey[]

export function probeAuthMethod(key: AuthMethodKey, options?: { secret?: string }): AuthProbe {
  return AUTH_METHODS[key].resolve(options)
}

/**
 * 运行时守卫。KEY 到了运行时就是一段宿主给的字符串（配置里的 `auth.method`），
 * 打错字原本会一路走到 `AUTH_METHODS[key].resolve` 那个 TypeError 上。挡在这里，
 * 未知方式就退化成「这次不带鉴权头」，与压根没配鉴权的表现一致。
 *
 * 用 Object.hasOwn 而不是 `in`：`'toString' in AUTH_METHODS` 是 true，而它取不到 resolve。
 */
export function isAuthMethodKey(value: string): value is AuthMethodKey {
  return Object.hasOwn(AUTH_METHODS, value)
}

/** 只要结果的那条路。与 probeAuthMethod 共用一个真相，失败即 null。 */
export function resolveAuthToken(key: AuthMethodKey, options?: { secret?: string }): string | null {
  return probeAuthMethod(key, options).token
}
