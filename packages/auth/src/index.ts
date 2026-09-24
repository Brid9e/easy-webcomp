import { resolveSelfMonitorToken, type AuthProbe } from './resolvers'

export { DEFAULT_SECRET, decrypt, encrypt, getDecryptedStorageItem } from './secure-ls'
export type { AuthProbe, AuthResolver, AuthResolverOptions } from './resolvers'

// 临时：Task 4 会用 registry.ts 里的真货替掉这段
export function probeAuthMethod(
  _key: 'SELF_MONITOR_TOKEN',
  options?: { secret?: string },
): AuthProbe {
  return resolveSelfMonitorToken(options)
}
