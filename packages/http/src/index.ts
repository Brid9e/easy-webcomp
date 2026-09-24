import { isAuthMethodKey, resolveAuthToken } from '@ew/auth'
import { getConfig, type EwConfig } from '@ew/runtime/config'
import axios, { type AxiosInstance } from 'axios'

/**
 * 组件共用的请求实例。拦截器是这层存在的全部理由：**打到哪、带什么身份**由宿主的运行时
 * 配置决定（见 docs/guide/config.md），组件里只管发请求。
 *
 * 放在包里而不是让每个组件各写一份：这段有三处细节（库默认头要按值比对、`timeout: 0`
 * 是假值、token 每次重解析），抄在 N 个 api.ts 里就是 N 份会各自漂移的拷贝。
 *
 * 为什么不是 @ew/runtime：运行时是每个产物的公共依赖，它引 axios 会让**不发请求的组件**
 * 也打进一份；引 @ew/auth 更是越界，runtime 不认鉴权这条边界是刻意的。组件按需引这个包，
 * 不需要请求层的就一点都不带。
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
 * 每次请求都解析、不缓存：token 会随登录/刷新换掉，缓存了宿主换完 token 就得重 configure。
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
//
// baseURL 兜底是 `/` 而不是某个网关前缀（早先是 `/api`）：组件源码里的路径已经是完整的
// 业务路径（`/selfmonitor/pollute/archive/...`），宿主的网关前缀只存在于宿主的部署里，
// 猜错一个字母就是整站请求 404。不配就是同源同前缀，配了就整条替换。
http.interceptors.request.use((config) => {
  const ew = getConfig()

  config.baseURL ??= ew.baseURL ?? '/'
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
