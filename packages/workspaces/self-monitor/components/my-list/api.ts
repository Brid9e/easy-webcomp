import { isAuthMethodKey, resolveAuthToken } from '@ew/auth'
import axios, { type AxiosInstance } from 'axios'
import { getConfig, type EwConfig } from '@ew/runtime/config'

/**
 * 组件内共用的 axios 实例。拦截器是这层存在的理由：鉴权头、traceId、统一错误提示
 * 都往这里加，组件里只管发请求。
 *
 * **三项都不写在这份 create() 里。** 请求级、全局配置、组件兜底是三层，只有把兜底挪进
 * 拦截器才分得清「调用方设了」与「实例默认」—— 写在这儿的话，拦截器读到的 baseURL 永远
 * 非空，全局配置永远轮不到。
 */
export const http: AxiosInstance = axios.create()

// axios 在拦截器之前就把库默认头（Accept 等）并进了 config.headers，于是 has() 分不出
// 「调用方设的」与「库兜底的」—— Accept 那种库自带值会让全局配置静默失效。
// 按值把库兜底当成「没设」，这一层才真的只压过兜底、不压过调用方。
const libHeaders: Record<string, unknown> = Object.fromEntries(
  Object.entries(axios.defaults.headers.common).map(([key, value]) => [key.toLowerCase(), value]),
)

/**
 * 这次请求可以带的默认头：全局配的 `headers`，加上由 `auth` 解析出来的 `Authorization`。
 *
 * 两者合成一处是为了共用底下同一条规则 —— 只补调用方没设的键。于是显式配的
 * `headers.Authorization` 压过解析出来的，调用方逐次设的又压过两者。
 *
 * 解析失败（没命中 key、密钥不对、方式名打错）就**不带头照常发**，让后端的 401 原样回来：
 * 这与「压根没配鉴权」表现一致，不新增一种只在网络层出现的静默失败。
 *
 * 每次请求都解析、不缓存：token 会随登录/刷新换掉，缓存了调试页那个「重新解析」就没意义了。
 */
function defaultHeaders(ew: EwConfig): Record<string, string> {
  const headers: Record<string, string> = { ...ew.headers }
  const auth = ew.auth
  if (!auth || !isAuthMethodKey(auth.method)) return headers

  // 三元而不是直接 `{ secret: auth.secret }`：exactOptionalPropertyTypes 下可选键
  // 不接受显式的 undefined，而「没给 secret」正是要走 DEFAULT_SECRET 的那条路。
  const token = resolveAuthToken(
    auth.method,
    auth.secret === undefined ? {} : { secret: auth.secret },
  )
  if (token !== null && headers.Authorization === undefined) headers.Authorization = `Bearer ${token}`
  return headers
}

// 请求时读而不是创建时读，所以晚调 configure() 也生效，
// 也不要求宿主赶在组件加载之前配置。
http.interceptors.request.use((config) => {
  const ew = getConfig()

  config.baseURL ??= ew.baseURL ?? '/api'
  // 用假值判定而不是 undefined：axios 里 timeout: 0 意味着「不限时」，当作「没设」才对
  if (!config.timeout) config.timeout = ew.timeout ?? 15_000
  for (const [key, value] of Object.entries(defaultHeaders(ew))) {
    const current = config.headers.get(key)
    const fallback = libHeaders[key.toLowerCase()]
    if (current === undefined || current === fallback) config.headers.set(key, value)
  }

  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // 例：统一 toast、401 跳登录
    return Promise.reject(error)
  },
)

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
