import { beforeEach, describe, expect, it } from 'vitest'
import { configure, resetConfig } from '@ew/runtime/config'
import { http } from '../../packages/workspaces/self-monitor/components/my-list/api'

/**
 * 假 adapter 截住**最终真正发出**的那份 config —— 拦截器跑完之后的样子。
 * 这里不 import axios 的类型：axios 只是 self-monitor 那个包的依赖，没装在仓库根上，
 * 从这里 import 解析不到，所以就地描一个够用的形状。
 */
interface SentConfig {
  baseURL?: string | undefined
  timeout?: number | undefined
  headers: { get(name: string): unknown }
}

let sent: SentConfig | undefined

beforeEach(() => {
  resetConfig()
  // 鉴权那几条读的是宿主的 localStorage，jsdom 里跨用例是同一份，得清
  localStorage.clear()
  sent = undefined
  http.defaults.adapter = async (config) => {
    sent = config
    return { data: null, status: 200, statusText: 'OK', headers: {}, config }
  }
})

describe('my-list http 的配置优先级（请求级 > 全局配置 > 组件兜底）', () => {
  it('没有全局配置时落回 /api 与 15 秒', async () => {
    await http.get('/x')
    expect(sent!.baseURL).toBe('/api')
    expect(sent!.timeout).toBe(15_000)
  })

  it('全局配置压过组件兜底', async () => {
    configure({ baseURL: 'https://api.example.com', timeout: 3_000 })
    await http.get('/x')
    expect(sent!.baseURL).toBe('https://api.example.com')
    expect(sent!.timeout).toBe(3_000)
  })

  it('请求级压过全局配置', async () => {
    configure({ baseURL: 'https://api.example.com', timeout: 3_000 })
    await http.get('/x', { baseURL: '/request', timeout: 1_000 })
    expect(sent!.baseURL).toBe('/request')
    expect(sent!.timeout).toBe(1_000)
  })

  it('请求级 timeout: 0 当作「没设」—— axios 里它意味着不限时', async () => {
    configure({ timeout: 3_000 })
    await http.get('/x', { timeout: 0 })
    expect(sent!.timeout).toBe(3_000)
  })

  it('全局 headers 只补请求上没有的键', async () => {
    configure({ headers: { 'x-tenant': 'a', 'x-trace': 'global' } })
    await http.get('/x', { headers: { 'x-trace': 'request' } })
    expect(sent!.headers.get('x-tenant')).toBe('a')
    expect(sent!.headers.get('x-trace')).toBe('request')
  })

  it('晚调 configure 也生效 —— 拦截器是请求时读的', async () => {
    await http.get('/x')
    expect(sent!.baseURL).toBe('/api')
    configure({ baseURL: 'https://late.example.com' })
    await http.get('/x')
    expect(sent!.baseURL).toBe('https://late.example.com')
  })

  it('全局 headers 盖得住 axios 自带的 Accept，但盖不过请求级', async () => {
    configure({ headers: { Accept: 'application/vnd.ew+json' } })
    await http.get('/x')
    expect(sent!.headers.get('Accept')).toBe('application/vnd.ew+json')

    await http.get('/x', { headers: { Accept: 'text/plain' } })
    expect(sent!.headers.get('Accept')).toBe('text/plain')
  })
})

describe('鉴权头（由 config.auth 解析出来）', () => {
  // 存的是明文的 JSON 那条路（secure-ls.ts 的步骤 1），省掉在测试里造密文
  function seedHostToken(token: string): void {
    localStorage.setItem('x-core-access', JSON.stringify({ accessToken: token }))
  }

  it('没配 auth 就不带 Authorization', async () => {
    await http.get('/x')
    expect(sent!.headers.get('Authorization')).toBeUndefined()
  })

  it('配了就解析出 token，拼成 Bearer 带上', async () => {
    seedHostToken('tok-1')
    configure({ auth: { method: 'SELF_MONITOR_TOKEN' } })
    await http.get('/x')
    expect(sent!.headers.get('Authorization')).toBe('Bearer tok-1')
  })

  it('解不出来也不阻断请求，只是不带头', async () => {
    // localStorage 里没有那个 key —— 调试页的常态
    configure({ auth: { method: 'SELF_MONITOR_TOKEN' } })
    await http.get('/x')
    expect(sent!.headers.get('Authorization')).toBeUndefined()
    expect(sent!.baseURL).toBe('/api')
  })

  it('方式名打错字退化成不带鉴权头，而不是抛', async () => {
    seedHostToken('tok-1')
    configure({ auth: { method: 'SELF_MONITOR_TYPO' } })
    await http.get('/x')
    expect(sent!.headers.get('Authorization')).toBeUndefined()
  })

  it('显式配的、请求级的 Authorization 都压过解析结果', async () => {
    seedHostToken('tok-1')
    configure({
      headers: { Authorization: 'Bearer configured' },
      auth: { method: 'SELF_MONITOR_TOKEN' },
    })
    await http.get('/x')
    expect(sent!.headers.get('Authorization')).toBe('Bearer configured')

    await http.get('/x', { headers: { Authorization: 'Bearer per-request' } })
    expect(sent!.headers.get('Authorization')).toBe('Bearer per-request')
  })

  it('每次请求都重新解析 —— token 换了不用重 configure', async () => {
    seedHostToken('tok-1')
    configure({ auth: { method: 'SELF_MONITOR_TOKEN' } })
    await http.get('/x')
    expect(sent!.headers.get('Authorization')).toBe('Bearer tok-1')

    seedHostToken('tok-2')
    await http.get('/x')
    expect(sent!.headers.get('Authorization')).toBe('Bearer tok-2')
  })
})
