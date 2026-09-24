import { http } from '@ew/http'

/**
 * 请求实例来自 @ew/http：baseURL / timeout / headers / auth 四项由宿主的运行时配置决定，
 * 组件里只管发请求。这份文件因此只剩「这本组件有哪些接口」。
 */
export { http }

/** 后端统一响应壳：code 为 0 才是成功，此时 data 有效。 */
interface CommonResult<T> {
  code: number
  data: T
  msg: string
}

/** 分页接口的 data。注意字段是 `list` 不是 `rows`。 */
export interface PageResult<T> {
  list: T[]
  total: number
}

/**
 * 排放口清单行（`OutletItem`），字段与宿主 outlet-profile 的接口类型逐条对应。
 *
 * 中文列（monitorTypeName / productionStatus / makeStatus / networkingStatus /
 * riskLevelName）由后端直接给出，前端不再按 code 拼一遍 —— 两处各拼一份必然有一天对不上。
 * 后三个字段本身就是中文，筛选时也按中文原样回传。
 *
 * 评分类字段可空：没画像的排口 `riskScore` 为 null、`validTransRate90` 为 null，
 * 保留 null 而不是补 0：0 是一个真实存在的分值，与「没有数据」不是一回事。
 */
export interface OutletRow {
  outletId: string
  outletCode: string
  outletName: string
  psId: string
  psName?: string
  /** 省-市-区 */
  regionName?: string
  /** 监测类型 code（1 废水 / 2 废气 / 3 雨水） */
  monitorType: string
  monitorTypeName?: string
  /** 投产情况（已投产 / 未投产） */
  productionStatus?: string
  /** 生产情况（正常生产 / 停运） */
  makeStatus?: string
  commissionDate?: string | null
  /** 投产时间（格式化，后端返回） */
  commissionFormatDate?: string | null
  /** 联网情况（已联网 / 未联网） */
  networkingStatus?: string
  riskScore?: number | null
  /** 风险等级 code（10 / 20 / 30） */
  riskLevel?: number | null
  riskLevelName?: string | null
  /** 近 90 个生产日有效传输率（百分比） */
  validTransRate90?: number | null
}

/** 排放口详情（`OutletDetail`）。比列表行多出证件、行业、坐标与视频状态几组字段。 */
export interface OutletDetail {
  outletId: string
  outletCode: string
  outletName: string
  networkingStatus?: string
  productionStatus?: string
  commissionDate?: string
  commissionFormatDate?: string
  /** 排放口类型（主要 / 间接） */
  outletType?: string
  monitorType: string
  monitorTypeName?: string
  longitude?: string
  latitude?: string
  riskLevel?: number | null
  riskLevelName?: string | null
  riskScore?: number | null
  validTransRate90?: number | null
  psId: string
  psName?: string
  /** 视频监控平台企业 id（视频接口用，与主系统 psId 不同） */
  zdjkPsId?: string
  permitNo?: string
  regionName?: string
  mainSectorCode?: string
  mainSectorName?: string
  hbSectorCode?: string
  hbSectorName?: string
  opeaddress?: string
  /** 许可证有效期 */
  times?: string
  /** 站房视频状态：未安装 / 离线 / 在线 */
  stationVideoStatus: string
  /** 采样平台视频状态：未安装 / 离线 / 在线 */
  platformVideoStatus: string
  /** 自动监测设备联网状态：已联网 / 未联网 */
  deviceNetworkStatus?: string
  /** 超期未运维最大天数；无超期 = 0 */
  maxOpsOverdueDays: number
}

/** 风险等级 code，见接口文档。行里给的是名称，筛选传的是 code。 */
export const RISK_LEVELS = [
  { value: 10, label: '低风险' },
  { value: 20, label: '中风险' },
  { value: 30, label: '高风险' },
] as const

/** 监测类型。值就是接口里的 code 字符串。 */
export const MONITOR_TYPES = [
  { value: '1', label: '废水' },
  { value: '2', label: '废气' },
  { value: '3', label: '雨水' },
] as const

/**
 * 投产情况 / 生产情况 / 联网情况三组的**值与标签逐字相同**。
 * 接口收的就是这几个中文词，不是枚举 code，所以这里没有「值 → 标签」的翻译，
 * 也就没有翻译错位的余地。
 */
export const PRODUCTION_STATUSES = [
  { value: '已投产', label: '已投产' },
  { value: '未投产', label: '未投产' },
] as const

export const MAKE_STATUSES = [
  { value: '正常生产', label: '正常生产' },
  { value: '停运', label: '停运' },
] as const

export const NETWORKING_STATUSES = [
  { value: '已联网', label: '已联网' },
  { value: '未联网', label: '未联网' },
] as const

/**
 * 筛选条件。只覆盖筛选面板上有的七项；接口还收 psId / outletId / provinceCode /
 * cityCode / areaCode / directCode 六个联动参数（宿主是左侧层级树在用），
 * 这里没有那棵树，需要时再往上加。
 *
 * 字符串项的「未选」是空串而不是 null：接口对这几项的判断是「假值即不过滤」，
 * 空串正好落在那条路上，不必再加一层转换。
 */
export interface OutletFilter {
  keyword: string
  riskLevel: number | null
  monitorType: string
  productionStatus: string
  makeStatus: string
  networkingStatus: string
  /** 近 90 个生产日有效传输率**小于**该值 */
  validTransRate90Lt: number | null
}

export function emptyFilter(): OutletFilter {
  return {
    keyword: '',
    riskLevel: null,
    monitorType: '',
    productionStatus: '',
    makeStatus: '',
    networkingStatus: '',
    validTransRate90Lt: null,
  }
}

const BASE = '/selfmonitor/pollute/archive'

/**
 * 筛选项 → query。只带非空的键：`keyword: ''` 在后端也是一次模糊匹配，
 * `riskLevel: ''` 更会让 Integer 反序列化失败。
 */
function toParams(
  filter: OutletFilter,
  page: { pageNo: number; pageSize: number },
): Record<string, string | number> {
  const params: Record<string, string | number> = { pageNo: page.pageNo, pageSize: page.pageSize }
  if (filter.keyword.trim()) params.keyword = filter.keyword.trim()
  if (filter.riskLevel !== null) params.riskLevel = filter.riskLevel
  if (filter.monitorType) params.monitorType = filter.monitorType
  if (filter.productionStatus) params.productionStatus = filter.productionStatus
  if (filter.makeStatus) params.makeStatus = filter.makeStatus
  if (filter.networkingStatus) params.networkingStatus = filter.networkingStatus
  if (filter.validTransRate90Lt !== null) params.validTransRate90Lt = filter.validTransRate90Lt
  return params
}

/** 分页查询。GET 到 query 上，不是 POST 到 body —— 这一条与别的列表接口不同。 */
export async function fetchOutletPage(
  filter: OutletFilter,
  pageNo: number,
  pageSize: number,
): Promise<PageResult<OutletRow>> {
  const res = await http.get<CommonResult<PageResult<OutletRow>>>(`${BASE}/outlet-page`, {
    params: toParams(filter, { pageNo, pageSize }),
  })
  const result = res.data
  if (result.code !== 0) throw new Error(result.msg || `查询失败（code ${result.code}）`)
  return result.data
}

/** 排放口详档。列表行只带清单要用的那十几列，证件、行业、坐标、视频状态得单取。 */
export async function fetchOutletDetail(outletId: string): Promise<OutletDetail> {
  const res = await http.get<CommonResult<OutletDetail>>(`${BASE}/outlet-detail`, {
    params: { outletId },
  })
  const result = res.data
  if (result.code !== 0) throw new Error(result.msg || `查询失败（code ${result.code}）`)
  return result.data
}
