import type { OutletDetail, OutletRow } from './api'

/**
 * 预览与截图用的假数据，外加给文档站预览用的假适配器。
 *
 * **不进产物。** 构建只从 `index.ts` 出发，本文件不在那条链上；认得它的只有文档站与调试页
 * 的预览（`virtual:ew-wc/<name>`）和截图脚本。因此这里可以随便写死在真实实现里不该出现的东西。
 *
 * 假数据本身收在 `mockResponseOf` 里，两个调用方各接各的出口：预览走 axios 适配器，
 * 截图加载的是产物、适配器够不着，改从网络上拦。做法都不是改 `store.ts` ——
 * 组件源码保持「一律走真实接口」，真实接口换了，这里要跟着改的也只有两个 URL。
 */

/** 名字一律带「示例」二字：截图与演示里一眼能看出这不是真数据。 */
const ROWS: OutletRow[] = [
  {
    outletId: 'mock-01', outletCode: 'DA001', outletName: '1#废气排放口',
    psId: 'ps-01', psName: '示例华信热力有限公司', regionName: '天津市-市辖区-北辰区',
    monitorType: '2', monitorTypeName: '废气', productionStatus: '已投产',
    makeStatus: '正常生产', networkingStatus: '已联网',
    riskScore: 63.4, riskLevel: 20, riskLevelName: '中风险', validTransRate90: 13.87,
  },
  {
    outletId: 'mock-02', outletCode: 'DA002', outletName: '2#废气排放口',
    psId: 'ps-01', psName: '示例华信热力有限公司', regionName: '天津市-市辖区-北辰区',
    monitorType: '2', monitorTypeName: '废气', productionStatus: '已投产',
    makeStatus: '正常生产', networkingStatus: '未联网',
    riskScore: 63.4, riskLevel: 20, riskLevelName: '中风险', validTransRate90: null,
  },
  {
    outletId: 'mock-03', outletCode: 'DW001', outletName: '废水总排口',
    psId: 'ps-02', psName: '示例宏远化工有限公司', regionName: '辽宁省-锦州市-太和区',
    monitorType: '1', monitorTypeName: '废水', productionStatus: '已投产',
    makeStatus: '正常生产', networkingStatus: '已联网',
    riskScore: 88.6, riskLevel: 30, riskLevelName: '高风险', validTransRate90: 96.42,
  },
  {
    outletId: 'mock-04', outletCode: 'DW002', outletName: '车间排口',
    psId: 'ps-02', psName: '示例宏远化工有限公司', regionName: '辽宁省-锦州市-太和区',
    monitorType: '1', monitorTypeName: '废水', productionStatus: '未投产',
    commissionDate: '2026-11-01', commissionFormatDate: '2026-11-01',
    makeStatus: '停运', networkingStatus: '未联网',
    riskScore: null, riskLevel: null, riskLevelName: null, validTransRate90: null,
  },
  {
    outletId: 'mock-05', outletCode: 'DY001', outletName: '厂区雨水排口',
    psId: 'ps-03', psName: '示例新源能源科技有限公司', regionName: '黑龙江省-黑河市-嫩江县',
    monitorType: '3', monitorTypeName: '雨水', productionStatus: '已投产',
    makeStatus: '正常生产', networkingStatus: '已联网',
    riskScore: 52.1, riskLevel: 10, riskLevelName: '低风险', validTransRate90: 99.1,
  },
  {
    outletId: 'mock-06', outletCode: 'DA003', outletName: '燃煤锅炉烟囱',
    psId: 'ps-03', psName: '示例新源能源科技有限公司', regionName: '黑龙江省-黑河市-嫩江县',
    monitorType: '2', monitorTypeName: '废气', productionStatus: '已投产',
    makeStatus: '正常生产', networkingStatus: '已联网',
    riskScore: 71.2, riskLevel: 20, riskLevelName: '中风险', validTransRate90: 88.35,
  },
  {
    outletId: 'mock-07', outletCode: 'DW003', outletName: '生活污水排口',
    psId: 'ps-04', psName: '示例恒盛建材有限公司', regionName: '江苏省-南京市-江宁区',
    monitorType: '1', monitorTypeName: '废水', productionStatus: '已投产',
    makeStatus: '停运', networkingStatus: '未联网',
    riskScore: 44.8, riskLevel: 10, riskLevelName: '低风险', validTransRate90: 61.2,
  },
  {
    outletId: 'mock-08', outletCode: 'DA004', outletName: '破碎车间排气筒',
    psId: 'ps-04', psName: '示例恒盛建材有限公司', regionName: '江苏省-南京市-江宁区',
    monitorType: '2', monitorTypeName: '废气', productionStatus: '已投产',
    makeStatus: '正常生产', networkingStatus: '已联网',
    riskScore: 92.3, riskLevel: 30, riskLevelName: '高风险', validTransRate90: 42.6,
  },
  {
    outletId: 'mock-09', outletCode: 'DW004', outletName: '中水回用排口',
    psId: 'ps-05', psName: '示例通远纸业有限公司', regionName: '广东省-广州市-黄埔区',
    monitorType: '1', monitorTypeName: '废水', productionStatus: '已投产',
    makeStatus: '正常生产', networkingStatus: '已联网',
    riskScore: 58.9, riskLevel: 10, riskLevelName: '低风险', validTransRate90: 93.75,
  },
  {
    outletId: 'mock-10', outletCode: 'DY002', outletName: '西侧雨水口',
    psId: 'ps-05', psName: '示例通远纸业有限公司', regionName: '广东省-广州市-黄埔区',
    monitorType: '3', monitorTypeName: '雨水', productionStatus: '未投产',
    commissionDate: null, commissionFormatDate: null,
    makeStatus: '停运', networkingStatus: '未联网',
    riskScore: null, riskLevel: null, riskLevelName: null, validTransRate90: null,
  },
  {
    outletId: 'mock-11', outletCode: 'DA005', outletName: '烘干工序排气筒',
    psId: 'ps-06', psName: '示例金誉食品有限公司', regionName: '山东省-潍坊市-寒亭区',
    monitorType: '2', monitorTypeName: '废气', productionStatus: '已投产',
    makeStatus: '正常生产', networkingStatus: '已联网',
    riskScore: 76.5, riskLevel: 20, riskLevelName: '中风险', validTransRate90: 78.4,
  },
  {
    outletId: 'mock-12', outletCode: 'DW005', outletName: '屠宰废水排口',
    psId: 'ps-06', psName: '示例金誉食品有限公司', regionName: '山东省-潍坊市-寒亭区',
    monitorType: '1', monitorTypeName: '废水', productionStatus: '已投产',
    makeStatus: '正常生产', networkingStatus: '未联网',
    riskScore: 35.2, riskLevel: 10, riskLevelName: '低风险', validTransRate90: 100,
  },
]

/**
 * 详情字段的宽松形状：键名与类型都跟着 `OutletDetail` 走，只是每个可选键额外认 `undefined`。
 *
 * 列表行里那几项（networkingStatus / commissionDate / …）本身就是可选的，取出来是
 * `string | undefined`；而 exactOptionalPropertyTypes 下可选键只认「值」或「键不存在」，
 * 直接写 `networkingStatus: row.networkingStatus` 是不合法的。这里先把它们收下，
 * 值确实缺的那些由 `detailOf` 摘掉 —— 摘完全部键就都是实值，才成为 OutletDetail。
 */
type DetailFields = { [K in keyof OutletDetail]?: OutletDetail[K] | undefined }

/**
 * 详情比清单多证件、行业、坐标与视频那几组，这里照着列表行推算出来。
 * 取不到值的键整个不写：页面把缺席显示成 `--`，与后端给空值一个样。
 */
function detailOf(fields: DetailFields): OutletDetail {
  const detail: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) detail[key] = value
  }
  // 这一跳类型系统跟不过去：摘掉 undefined 之后剩下的键都是实值，可它看不出来。
  // 键名与取值类型在上面的 `fields` 上已经查过一遍，这里认下的是「缺席 = 键不存在」。
  return detail as unknown as OutletDetail
}

const DETAILS: Record<string, OutletDetail> = Object.fromEntries(
  ROWS.map((row, i) => [
    row.outletId,
    detailOf({
      outletId: row.outletId,
      outletCode: row.outletCode,
      outletName: row.outletName,
      networkingStatus: row.networkingStatus,
      productionStatus: row.productionStatus,
      commissionDate: row.commissionDate ?? undefined,
      commissionFormatDate: row.commissionFormatDate ?? undefined,
      outletType: row.monitorType === '3' ? '间接' : '主要',
      monitorType: row.monitorType,
      monitorTypeName: row.monitorTypeName,
      longitude: (117.2 + i * 0.37).toFixed(6),
      latitude: (39.1 - i * 0.21).toFixed(6),
      riskLevel: row.riskLevel,
      riskLevelName: row.riskLevelName,
      riskScore: row.riskScore,
      validTransRate90: row.validTransRate90,
      psId: row.psId,
      psName: row.psName,
      zdjkPsId: `zdjk-${row.psId}`,
      permitNo: `9131${String(10_000_000 + i * 137)}MA00${i}X`,
      regionName: row.regionName,
      mainSectorCode: 'C26',
      mainSectorName: '化学原料和化学制品制造业',
      hbSectorCode: 'HB04',
      hbSectorName: '化学原料和化学制品制造业',
      opeaddress: '示例工业园区纬三路 18 号',
      times: '2024-03-01 至 2029-02-28',
      stationVideoStatus: i % 3 === 2 ? '未安装' : '在线',
      platformVideoStatus: i % 4 === 3 ? '离线' : '在线',
      deviceNetworkStatus: row.networkingStatus,
      maxOpsOverdueDays: i % 5 === 4 ? 12 : 0,
    }),
  ]),
)

function pageOf(params: Record<string, unknown>): { list: OutletRow[]; total: number } {
  const text = (key: string): string => String(params[key] ?? '')

  const matched = ROWS.filter((row) => {
    const keyword = text('keyword').trim()
    if (keyword && !`${row.outletCode} ${row.outletName}`.includes(keyword)) return false
    if (params.riskLevel !== undefined && row.riskLevel !== Number(params.riskLevel)) return false
    if (text('monitorType') && row.monitorType !== text('monitorType')) return false
    if (text('productionStatus') && row.productionStatus !== text('productionStatus')) return false
    if (text('makeStatus') && row.makeStatus !== text('makeStatus')) return false
    if (text('networkingStatus') && row.networkingStatus !== text('networkingStatus')) return false
    // 传输率没值的排口不算「小于 N」：它到底是 0 还是缺数据，接口那边也是欠着的
    if (params.validTransRate90Lt !== undefined) {
      const limit = Number(params.validTransRate90Lt)
      if (row.validTransRate90 == null || row.validTransRate90 >= limit) return false
    }
    return true
  })

  const pageNo = Number(params.pageNo ?? 1)
  const pageSize = Number(params.pageSize ?? 15)
  const start = (pageNo - 1) * pageSize
  return { list: matched.slice(start, start + pageSize), total: matched.length }
}

/** 后端那层响应壳：judge 成不成功看 `code`，认不出来的请求回 404。 */
export interface MockBody {
  code: number
  msg: string
  data: unknown
}

/**
 * 一条请求 → 一份响应壳。**假数据本身全在这里**，两个调用方各取所需：
 *
 * - 文档站预览：`installMock()` 把它装进 `http` 的适配器（组件自己的 axios 实例）；
 * - 截图（`pnpm run snapshot`）：那边加载的是 dist 产物，适配器够不着内联的那份 axios，
 *   改从网络上拦，由 `scripts/snapshot.ts` 直接调这个函数。
 *
 * `url` 只看路径、不带 query（query 在 `params` 里）：两个调用方给的都是这样的形状 ——
 * 适配器拿到的是 axios 的 `config.url`，路由那边给的是 `url.pathname`。
 *
 * 认不出来时回一份 404 壳而不是抛异常：`api.ts` 会把 `msg` 显示在表格的空状态里，
 * 一眼能看出是「mock 少了一条接口」，而不是一个没头没尾的网络错误。
 */
export function mockResponseOf(url: string, params: Record<string, unknown>): MockBody {
  if (url.endsWith('/outlet-page')) {
    const { list, total } = pageOf(params)
    return { code: 0, msg: '', data: { list, total } }
  }
  if (url.endsWith('/outlet-detail')) {
    // 认不出的 id 走 404 壳而不是 `data: null`：`fetchOutletDetail` 声明的是非空返回，
    // 给 null 等于让那份声明变成谎话，失败该从 code 那条路出去。
    const found = DETAILS[String(params.outletId)]
    return found
      ? { code: 0, msg: '', data: found }
      : { code: 404, msg: `mock 里没有这个排放口：${params.outletId}`, data: null }
  }
  return { code: 404, msg: `mock 里没有这条接口：${url}`, data: null }
}

/** 假网络往返，让 `loading` 与弹框里的转圈有东西可演。 */
function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 300))
}

let installed = false

/**
 * 把 `http` 的适配器换成假数据。重复调用只生效一次 —— 文档站的卡片与详情页都会注册元素，
 * 各调一次是很正常的事。
 */
export async function installMock(): Promise<void> {
  if (installed) return
  installed = true

  // 动态 import 而不是写在文件头上：截图脚本要在 Node 里裸着 import 本文件取假数据，
  // 而 './api' 一路拉进 @ew/auth → lz-string，那条 CJS 链的名字导出 Node 的 ESM 认不出来
  // （与 docs:build 栽在 lodash 上是同一类事）。只静态引类型，那个 import 会被整个擦掉。
  const { http } = await import('./api')

  http.defaults.adapter = async (config) => {
    // 这一段假延迟只在预览里有意义（截图那边不等它，也不该等），所以留在适配器里，
    // 不进 mockResponseOf。
    await delay()
    const body = mockResponseOf(config.url ?? '', (config.params ?? {}) as Record<string, unknown>)
    return { data: body, status: 200, statusText: 'OK', headers: {}, config }
  }
}
