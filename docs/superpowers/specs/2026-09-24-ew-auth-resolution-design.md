# 鉴权解析方式（@ew/auth + 调试页面板）

## 背景

组件跑在宿主系统里，请求要带 `authorization` 头，而 token 存在宿主自己的 `localStorage`
里、还是加密存的。每个宿主系统的存法不一样，组件不该各自去认。所以需要一层「鉴权解析」：
把「从宿主哪儿、按什么方式取出 token」收敛成一张注册表，按 KEY 选。

现在有一份已经跑通的解析实现（自行监测系统 self-monitor），它的来历值得记一笔：主系统用
SecureLS 持久化，但生产环境下元数据可能没写进去，官方 secure-ls 库会因为元数据校验拒绝解密
缺失元数据的 key。那份实现改用 CryptoJS + LZString 手动做无状态解密，绕开校验，任何环境都能
解出来。这段逻辑要原样保留。

同期，调试页（devtools）需要一个入口来切换鉴权方式，否则每验一种都要改源码。

## 交付边界

**本次只做到「能解析出 token」**，不接请求。

- 做：`@ew/auth` 包（注册表 + 解析实现）、devtools 右栏的鉴权面板。
- 不做：改 `packages/workspaces/self-monitor/components/my-list/api.ts` 的请求拦截器。
  那处保持现在的注释占位；等真有后端可打时再挂。

理由：没有后端可验，接了也只能靠 mock 断言 header，却提前把 axios 拦截器与调试页状态耦合上。
解析层独立交付即可验收。

## 目标结构

```
packages/auth/
├── package.json          # name: @ew/auth，源码包（无构建步骤），与 @ew/utils 同形
└── src/
    ├── secure-ls.ts      # 通用层：DEFAULT_SECRET / decrypt / encrypt / getDecryptedStorageItem
    ├── resolvers.ts      # 各鉴权方式的实现（当前只有 self-monitor）
    ├── registry.ts       # AUTH_METHODS / AuthMethodKey / resolveAuthToken / probeAuthMethod
    └── index.ts          # 对外只从这里出
```

`package.json` 照抄 `packages/utils` 的形状：`private`、`type: module`、`sideEffects: false`、
`types` 与 `exports` 直指 `./src/index.ts`。**没有 build 脚本** —— 消费者（现在是 devtools，
将来是各空间）自己打包源码。依赖 `crypto-js` 与 `lz-string`。

## 通用层与方言层

那份代码里混着两种东西，搬过来时按这条线切开：

| 归属 | 内容 | 理由 |
|---|---|---|
| 通用层 `secure-ls.ts` | `DEFAULT_SECRET`、`decrypt`、`encrypt`、`getDecryptedStorageItem` | 单纯是「secure-ls 无状态兼容的加解密」，换一个也用 SecureLS 存 token 的宿主照样能用 |
| 方言层 `resolvers.ts` | `STORE_KEY_SUFFIX = '-core-access'` 的后缀扫描、从解出的数据里取 `accessToken` | 这是 self-monitor 的存储方言，别的宿主没有这条约定 |

`DEFAULT_SECRET` 是 `'please-replace-me-with-your-own-key'` 这个占位值，必须与宿主的
`VITE_APP_STORE_SECURE_KEY` 一致才有意义 —— 这也是 devtools 面板要把 secret 做成可覆盖的原因。

搬运时的三处调整：

1. **去掉 `/* eslint-disable no-console */` 与 `/* eslint-disable prettier/prettier */`。**
   本仓库没有 eslint 配置、也没有 lint 脚本，那两行搬过来就是死注释。
2. **补类型窄化。** 原代码是 JS，`return data?.accessToken || null` 在 `data` 为 `unknown`
   时过不了 `strict`。按原行为补一个小函数：字符串先 `JSON.parse` 再取 `accessToken`（原逻辑
   就有这层二次解析），对象则直接取，取到的不是 string 一律返回 `null`。
3. **无用的 catch 绑参改成可选绑定**（`catch {` 而不是 `catch (_)`），避开 `noUnusedLocals`。

## 注册表契约

```ts
export const AUTH_METHODS = {
  SELF_MONITOR_TOKEN: { label: '自行监测系统 token 解析', resolve: resolveSelfMonitorToken },
} as const

export type AuthMethodKey = keyof typeof AUTH_METHODS

export function resolveAuthToken(key: AuthMethodKey, options?: { secret?: string }): string | null
export function probeAuthMethod(key: AuthMethodKey, options?: { secret?: string }): AuthProbe
```

- KEY 用大写下划线（`SELF_MONITOR_TOKEN`），就是「选择用哪种鉴权方式」的那个选择器。
- `label` 直接喂给 devtools 下拉，省得在 UI 里再维护一份中文名。
- `resolve` 返回**裸 token**，不是整个 header 值。`Bearer ` 前缀怎么拼是调用方的事
  （将来接拦截器时按那边的需要拼）。
- **不做 `registerAuthMethod()` 这类运行时注册。** 现在没有第二个来源；等真有宿主自带的方式
  要挂进来再加，那时也才知道接口该长什么样。

## 为什么要一并导出 probe

调试页跑在 `localhost:5273`，读的是**自己 origin** 的 `localStorage` —— 宿主那套
`-core-access` 数据默认不在。于是「解析不出来」是调试页的常态，只给一个 `null` 等于什么都没说。
所以解析之外再给一个带原因的探测：

```ts
export type AuthProbe = {
  status: 'resolved' | 'no-storage-key' | 'no-token' | 'error'
  token: string | null
  storageKey: string | null   // 命中的那个 key，排查时要看
  error?: unknown
}

export function probeAuthMethod(key: AuthMethodKey, options?: { secret?: string }): AuthProbe
```

四个状态分别对应：扫到并以 token 解出 / `localStorage` 里没有 `-core-access` 结尾的 key /
扫到了但这个 key 下没有值、或解出来没有 `accessToken` / 过程里抛了异常。
`resolveAuthToken` 就是 `probeAuthMethod(...).token` 的薄封装，保证两条路只有一个真相。

注意 `error?: unknown` 是可选的，而本仓库开着 `exactOptionalPropertyTypes` —— 构造返回对象时
要在错误分支里才把 `error` 写进去，不能一律写 `error: undefined`（那样连类型都过不去）。

## devtools 面板

新增 `devtools/src/AuthPanel.vue`。`App.vue` 的 `<aside class="side">` 现在是
`PropPanel` + `EventLog` 两个平级的 `<section class="panel">`，面板按同样形状插在最前。

内容：

- **方式下拉**，选项由 `AUTH_METHODS` 生成，值存在 `usePersisted('authMethod', 'SELF_MONITOR_TOKEN')`。
- **secret 输入框**，默认填 `DEFAULT_SECRET`，存在 `usePersisted('authSecret', DEFAULT_SECRET)`。
- **结果区**：`resolved` 显示 token；其余三个状态显示对应的中文原因，并带上命中的 `storageKey`。
- **「重新解析」按钮**：localStorage 可能在面板外被改，选完方式不是终点。

## 接线

- `packages/auth` 落在既有的 `packages/*` glob 下，pnpm 自动认它是工作空间包。
- 根 `package.json` 的 `devDependencies` 加 `"@ew/auth": "workspace:*"` —— 与
  `@ew/runtime`、`@ew/utils` 同一套路。devtools 自己没有 `package.json`，靠根 `node_modules`
  下那个符号链接解析 `@ew/auth`（`devtools/shared/wc-mode.ts:4` 引 `@ew/utils` 走的就是这条路）。
  加完要跑一次 `pnpm install` 把链接建出来。
- `scripts/` 下的构建与守卫**不受影响**：`build.ts:39`、`check-artifacts.ts:52`、`icons.ts:24`
  枚举的都是 `packages/workspaces/*`，不是 `packages/*`。
- 文档站（VitePress）本次不引 `@ew/auth`，因此 `docs/.vitepress/config.mts` 不动。

## 测试

`tests/auth/` 下的单测（jsdom 环境自带 `localStorage`）：

- `secure-ls`：`encrypt` → `decrypt` 往返；明文 JSON 直读；空值/垃圾串返回 `null`；
  `getDecryptedStorageItem` 走真实 `localStorage`。
- `resolvers`：造 `x-core-access` 数据，验 `resolved`；不造数据验 `no-storage-key`；
  造一个解不出 `accessToken` 的值验 `no-token`；换错 secret 也要落进 `no-token` 而不是抛出。
- `registry`：每个 KEY 匹配 `/^[A-Z][A-Z0-9_]*$/`，且每项都有非空 `label` 与 `resolve`
  —— 这条是给「以后加方式」立的规矩，加了不合规的 KEY 当场红。

`tests/e2e/debug-page.spec.ts` 补一条：右栏出现「鉴权」面板、下拉默认项是
「自行监测系统 token 解析」。这条**不碰**拖拽那几条的 `test.use({ viewport })` 设置。

## 破坏性变更

无。新包、新面板，不动任何既有导出与产物路径。

## 不做的事

- **不接请求拦截器**（见「交付边界」）。
- **不做运行时注册 API**（见「注册表契约」）。
- **不在面板里放出「读哪个 storage key」的输入框。** 后缀扫描是这套方言的一部分，放出来
  等于把调试页变成半个配置界面；命中的 key 会在结果区显示，排查够用。
- **不为 secret 输入框做加密存储。** 它存在 `ew-debug:` 前缀的 `localStorage` 里是明文，
  但调试页整体就是这个语境。真要填生产密钥的人风险自负，值得在输入框旁写一句提示。
