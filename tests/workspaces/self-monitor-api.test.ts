import { beforeEach, describe, expect, it } from 'vitest'
import {
  emptyFilter,
  fetchOutletDetail,
  fetchOutletPage,
  http,
} from '../../packages/workspaces/self-monitor/components/my-list/api'

/**
 * 接口封装这一层：请求打到哪个路径、哪些筛选进 query、后端的非 0 code 怎么冒出来。
 *
 * 不在这里验筛选**算得对不对** —— 那是后端的事，假数据那份看
 * `tests/workspaces/self-monitor-mock.test.ts`。这里换掉 adapter 看真正发出的请求，
 * 所以也不需要装假数据。
 */
interface SentConfig {
  url?: string | undefined
  params?: Record<string, unknown> | undefined
}

let sent: SentConfig | undefined

beforeEach(() => {
  sent = undefined
})

/** 打桩成「后端回这个壳」；顺带记下这次请求发成了什么样 */
function replyWith(body: { code: number; data: unknown; msg: string }): void {
  http.defaults.adapter = async (config) => {
    sent = { url: config.url, params: config.params as Record<string, unknown> | undefined }
    return { data: body, status: 200, statusText: 'OK', headers: {}, config }
  }
}

describe('接口封装', () => {
  it('分页查询打到 outlet-page，空筛选不进 query', async () => {
    replyWith({ code: 0, data: { list: [], total: 0 }, msg: '' })
    await fetchOutletPage(emptyFilter(), 2, 5)

    expect(sent!.url).toBe('/selfmonitor/pollute/archive/outlet-page')
    // 空字符串与 null 都不带上：`riskLevel: ''` 在后端是 Integer 反序列化失败，
    // `keyword: ''` 则是一次没有意义的模糊匹配。
    expect(sent!.params).toEqual({ pageNo: 2, pageSize: 5 })
  })

  it('详情打到 outlet-detail，参数是 outletId', async () => {
    replyWith({ code: 0, data: {}, msg: '' })
    await fetchOutletDetail('mock-01')

    expect(sent!.url).toBe('/selfmonitor/pollute/archive/outlet-detail')
    expect(sent!.params).toEqual({ outletId: 'mock-01' })
  })

  it('后端非 0 的 code 抛错并带上 msg —— data 这时是无效的', async () => {
    replyWith({ code: 500, data: null, msg: '账号未登录' })
    await expect(fetchOutletPage(emptyFilter(), 1, 15)).rejects.toThrow('账号未登录')
  })

  it('msg 为空时也抛错，不静默返回一份空数据', async () => {
    replyWith({ code: 500, data: null, msg: '' })
    await expect(fetchOutletDetail('mock-01')).rejects.toThrow(/code 500/)
  })
})
