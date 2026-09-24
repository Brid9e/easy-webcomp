import { beforeAll, describe, expect, it } from 'vitest'
import {
  emptyFilter,
  fetchOutletDetail,
  fetchOutletPage,
  http,
  type OutletFilter,
} from '../../packages/workspaces/self-monitor/components/my-list/api'
import { installMock } from '../../packages/workspaces/self-monitor/components/my-list/mock'

/**
 * 文档站预览那份假数据。组件源码本身一律走真实接口，假数据只在适配器那一层接管出口，
 * 所以能这样直接调 api 来验它 —— 不必挂元素、也不必造 axios 的请求环境。
 *
 * 关注的是「筛选与分页算得对不对」：它是这一层唯一有分支的东西。字段取值本身看着 fixture 写就行。
 */
beforeAll(async () => {
  await installMock()
})

function filter(patch: Partial<OutletFilter> = {}): OutletFilter {
  return { ...emptyFilter(), ...patch }
}

describe('假数据的分页查询', () => {
  it('不带筛选返回全部 12 条', async () => {
    const page = await fetchOutletPage(filter(), 1, 15)
    expect(page.total).toBe(12)
    expect(page.list).toHaveLength(12)
    expect(page.list[0]!.outletId).toBe('mock-01')
  })

  it('total 是命中数而不是本页条数', async () => {
    const page = await fetchOutletPage(filter(), 2, 5)
    expect(page.total).toBe(12)
    expect(page.list).toHaveLength(5)
    expect(page.list[0]!.outletId).toBe('mock-06')
  })

  it('翻过头返回空页而不是最后那页', async () => {
    const page = await fetchOutletPage(filter(), 9, 5)
    expect(page.total).toBe(12)
    expect(page.list).toEqual([])
  })

  it('keyword 同时匹配编号与名称', async () => {
    const byCode = await fetchOutletPage(filter({ keyword: 'DW001' }), 1, 15)
    expect(byCode.list.map((row) => row.outletId)).toEqual(['mock-03'])

    const byName = await fetchOutletPage(filter({ keyword: '燃煤锅炉' }), 1, 15)
    expect(byName.list.map((row) => row.outletId)).toEqual(['mock-06'])
  })

  it('风险等级按 code 过滤，不按中文名', async () => {
    const high = await fetchOutletPage(filter({ riskLevel: 30 }), 1, 15)
    expect(high.list.map((row) => row.outletId)).toEqual(['mock-03', 'mock-08'])
    expect(high.list.every((row) => row.riskLevelName === '高风险')).toBe(true)
  })

  it('监测类型按 code 字符串过滤', async () => {
    const waste = await fetchOutletPage(filter({ monitorType: '2' }), 1, 15)
    expect(waste.list.map((row) => row.outletId)).toEqual([
      'mock-01',
      'mock-02',
      'mock-06',
      'mock-08',
      'mock-11',
    ])
  })

  it('投产 / 生产 / 联网三组按中文原样过滤', async () => {
    async function ids(patch: Partial<OutletFilter>): Promise<string[]> {
      const page = await fetchOutletPage(filter(patch), 1, 15)
      return page.list.map((row) => row.outletId)
    }

    expect(await ids({ productionStatus: '未投产' })).toEqual(['mock-04', 'mock-10'])
    expect(await ids({ makeStatus: '停运' })).toEqual(['mock-04', 'mock-07', 'mock-10'])
    expect(await ids({ networkingStatus: '已联网' })).toHaveLength(7)
  })

  it('传输率「小于 N」不算没值的排口 —— 它到底是 0 还是缺数据，接口那边也是欠着的', async () => {
    const page = await fetchOutletPage(filter({ validTransRate90Lt: 90 }), 1, 15)
    expect(page.list.map((row) => row.outletId)).toEqual([
      'mock-01',
      'mock-06',
      'mock-07',
      'mock-08',
      'mock-11',
    ])
    expect(page.list.some((row) => row.validTransRate90 === null)).toBe(false)
  })

  it('多项之间是「与」', async () => {
    const page = await fetchOutletPage(
      filter({ monitorType: '1', networkingStatus: '已联网' }),
      1,
      15,
    )
    expect(page.list.map((row) => row.outletId)).toEqual(['mock-03', 'mock-09'])
  })
})

describe('假数据的详情', () => {
  it('列表行上没有的那几组字段从行数据推出来', async () => {
    const detail = await fetchOutletDetail('mock-05')
    expect(detail.outletCode).toBe('DY001')
    // 雨水不算主要排放口
    expect(detail.outletType).toBe('间接')
    // i = 4，是 5 的倍数一档
    expect(detail.maxOpsOverdueDays).toBe(12)
  })

  it('未投产带预计投产月份，未联网照实说', async () => {
    const detail = await fetchOutletDetail('mock-04')
    expect(detail.productionStatus).toBe('未投产')
    expect(detail.commissionFormatDate).toBe('2026-11-01')
    expect(detail.networkingStatus).toBe('未联网')
  })

  it('没有画像的排口保留 null，不补 0', async () => {
    const detail = await fetchOutletDetail('mock-10')
    expect(detail.riskScore).toBeNull()
    expect(detail.validTransRate90).toBeNull()
  })

  it('认不出的 id 报错并带上 id，而不是回一份 null', async () => {
    await expect(fetchOutletDetail('mock-99')).rejects.toThrow(/mock-99/)
  })
})

describe('假数据没覆盖到的接口', () => {
  it('回一个 404 壳，msg 里带上 URL —— 一眼看出是 mock 少了一条', async () => {
    const res = await http.get('/not-in-mock')
    expect(res.data).toMatchObject({ code: 404, data: null })
    expect(res.data.msg).toContain('/not-in-mock')
  })
})
