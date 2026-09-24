import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encrypt, probeAuthMethod } from '@ew/auth'

// 主系统的 key 前缀带版本号，所以实现是扫后缀 —— 这条用真实前缀，防实现退化成写死全名
const KEY = 'self-monitor-sys-5.7.0-prod-core-access'

describe('SELF_MONITOR_TOKEN 探测', () => {
  beforeEach(() => localStorage.clear())

  it('没扫到 -core-access 结尾的 key：no-storage-key', () => {
    localStorage.setItem('unrelated', 'x')
    const probe = probeAuthMethod('SELF_MONITOR_TOKEN')
    expect(probe.status).toBe('no-storage-key')
    expect(probe.token).toBeNull()
    expect(probe.storageKey).toBeNull()
  })

  it('扫到了但没解出 accessToken：no-token，并带上命中的 key', () => {
    localStorage.setItem(KEY, encrypt({ user: 'someone' }))
    const probe = probeAuthMethod('SELF_MONITOR_TOKEN')
    expect(probe.status).toBe('no-token')
    expect(probe.storageKey).toBe(KEY)
  })

  it('密钥不对：no-token 而不是抛出', () => {
    localStorage.setItem(KEY, encrypt({ accessToken: 'tok-1' }, 'right-secret'))
    const probe = probeAuthMethod('SELF_MONITOR_TOKEN', { secret: 'wrong-secret' })
    expect(probe.status).toBe('no-token')
    expect(probe.token).toBeNull()
  })

  it('正常解出：resolved + 裸 token', () => {
    localStorage.setItem(KEY, encrypt({ accessToken: 'tok-42' }, 'my-secret'))
    const probe = probeAuthMethod('SELF_MONITOR_TOKEN', { secret: 'my-secret' })
    expect(probe.status).toBe('resolved')
    expect(probe.token).toBe('tok-42')
    expect(probe.storageKey).toBe(KEY)
  })

  it('解出来是字符串也要再解析一次（主系统两种存法都有）', () => {
    localStorage.setItem(KEY, encrypt(JSON.stringify({ accessToken: 'tok-str' })))
    expect(probeAuthMethod('SELF_MONITOR_TOKEN').token).toBe('tok-str')
  })

  it('开发环境的明文 JSON 也能解出', () => {
    localStorage.setItem(KEY, JSON.stringify({ accessToken: 'tok-plain' }))
    expect(probeAuthMethod('SELF_MONITOR_TOKEN').token).toBe('tok-plain')
  })

  it('读取过程抛异常：error', () => {
    localStorage.setItem(KEY, 'x')
    // findStorageKey 走的是 localStorage.key(i)，把它打瘸来走 error 分支
    const spy = vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('boom')
    })
    try {
      const probe = probeAuthMethod('SELF_MONITOR_TOKEN')
      expect(probe.status).toBe('error')
      expect(probe.token).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})
