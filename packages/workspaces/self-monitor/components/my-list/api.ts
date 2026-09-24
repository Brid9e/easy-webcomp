import axios, { type AxiosInstance } from 'axios'
import { getConfig } from '@ew/runtime/config'

/**
 * 组件内共用的 axios 实例。拦截器是这层存在的理由：鉴权头、traceId、统一错误提示
 * 都往这里加，组件里只管发请求。
 *
 * **三项都不写在这份 create() 里。** 请求级、全局配置、组件兜底是三层，只有把兜底挪进
 * 拦截器才分得清「调用方设了」与「实例默认」—— 写在这儿的话，拦截器读到的 baseURL 永远
 * 非空，全局配置永远轮不到。
 */
export const http: AxiosInstance = axios.create()

// 请求时读而不是创建时读，所以晚调 configure() 也生效，
// 也不要求宿主赶在组件加载之前配置。
http.interceptors.request.use((config) => {
  const ew = getConfig()

  config.baseURL ??= ew.baseURL ?? '/api'
  // 用假值判定而不是 undefined：axios 里 timeout: 0 意味着「不限时」，当作「没设」才对
  if (!config.timeout) config.timeout = ew.timeout ?? 15_000
  for (const [key, value] of Object.entries(ew.headers ?? {})) {
    if (!config.headers.has(key)) config.headers.set(key, value)
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

export type MyListStatus = 'enabled' | 'disabled'

export interface MyListItem {
  id: string
  name: string
  owner: string
  status: MyListStatus
  updatedAt: string
}

export interface MyListQuery {
  keyword?: string
  status?: MyListStatus | ''
  dateRange?: [string, string] | null
  page?: number
  pageSize?: number
}

export interface PageResult<T> {
  rows: T[]
  total: number
}

const OWNERS = ['张伟', '李娜', '王强', '刘洋']
const SITES = ['城东', '城西', '城南', '城北', '高新', '经开']
const TOTAL = 42

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 时间取「距今每 7 小时一条」，而不是写死年月：否则过一段时间后查看，日期筛选将永远筛不出结果。
const MOCK_ROWS: MyListItem[] = Array.from({ length: TOTAL }, (_, i) => {
  const seq = String(i + 1).padStart(3, '0')
  return {
    id: `SM-${seq}`,
    name: `${SITES[i % SITES.length]}监测点 ${seq}`,
    owner: OWNERS[i % OWNERS.length],
    status: i % 3 === 0 ? 'disabled' : 'enabled',
    updatedAt: formatTime(new Date(Date.now() - i * 7 * 3_600_000)),
  }
})

/** 模拟网络往返，让 loading 有东西可演。 */
function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 400 + Math.random() * 500))
}

/**
 * 列表查询（当前是 mock）。
 *
 * 接真实接口时只换这个函数体，调用方一行不用动：
 *   return (await http.get<PageResult<MyListItem>>('/self-monitor/list', { params: query })).data
 */
export async function fetchMyList(query: MyListQuery = {}): Promise<PageResult<MyListItem>> {
  await delay()

  const keyword = query.keyword?.trim().toLowerCase() ?? ''
  const { status, dateRange } = query
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 10

  const matched = MOCK_ROWS.filter((row) => {
    if (keyword && !`${row.name} ${row.id}`.toLowerCase().includes(keyword)) return false
    if (status && row.status !== status) return false
    if (dateRange) {
      const day = row.updatedAt.slice(0, 10)
      if (day < dateRange[0] || day > dateRange[1]) return false
    }
    return true
  })

  const start = (page - 1) * pageSize
  return { rows: matched.slice(start, start + pageSize), total: matched.length }
}
