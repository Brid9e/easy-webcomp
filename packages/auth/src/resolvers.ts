import { getDecryptedStorageItem } from './secure-ls'

/**
 * 一次解析的结果。比裸 token 多带一份原因 —— 调试页读的是自己 origin 的 localStorage，
 * 宿主那套数据默认不在，「解不出来」是常态，只给 null 等于什么都没说。
 */
export type AuthProbe = {
  /**
   * no-token 是个宽桶：key 下没值、解出来没有 accessToken、accessToken 不是字符串、
   * 以及密钥不对，全落在这里。再细分就得让通用层回传解密失败码，而它该对宿主一无所知。
   */
  status: 'resolved' | 'no-storage-key' | 'no-token' | 'error'
  token: string | null
  /** 命中的那个 localStorage key。no-storage-key 时为 null，其余情况指向实际读的那个。 */
  storageKey: string | null
  error?: unknown
}

export type AuthResolverOptions = { secret?: string }
export type AuthResolver = (options?: AuthResolverOptions) => AuthProbe

/** 主系统的存储键约定：数据落在某个以它结尾的 key 下，但前缀里带版本号，写不死。 */
const STORE_KEY_SUFFIX = '-core-access'

/**
 * 取第一个匹配的 key。升级后新旧两版可能同时在，这时按的是 localStorage 的插入顺序
 * （旧的通常在前），不是版本号最大的那个 —— 光看后缀分不出来，认了。命中哪个会在调试页显示。
 */
export function findStorageKey(): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.endsWith(STORE_KEY_SUFFIX)) return key
  }
  return null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** 主系统两种存法都有：解出来就是对象，或者是一层字符串要再解析一次。 */
function accessTokenOf(data: unknown): string | null {
  const parsed = typeof data === 'string' ? parseJson(data) : data
  if (!parsed || typeof parsed !== 'object' || !('accessToken' in parsed)) return null
  const token = (parsed as { accessToken?: unknown }).accessToken
  return typeof token === 'string' ? token : null
}

export const resolveSelfMonitorToken: AuthResolver = ({ secret } = {}) => {
  try {
    const storageKey = findStorageKey()
    if (!storageKey) return { status: 'no-storage-key', token: null, storageKey: null }
    const token = accessTokenOf(getDecryptedStorageItem(storageKey, secret))
    if (!token) return { status: 'no-token', token: null, storageKey }
    return { status: 'resolved', token, storageKey }
  } catch (error) {
    return { status: 'error', token: null, storageKey: null, error }
  }
}
