# 运行时配置

组件跑在宿主的页面里，请求要打到宿主的后端，并带上宿主的身份。`baseURL` / `timeout` / `headers` / `auth` 四项由宿主在运行时设置一次，组件读它 —— 换一个宿主不必改组件源码、重新发一次包。

## 三种产物的入口

| 产物 | 入口 |
|---|---|
| CDN | 引入 `config.js` 后调用全局函数 `ewConfig({ ... })` |
| ESM | `import { configure } from '@ew/<空间>/config'` |
| framework | 同上，同一个文件 |

CDN：

```html
<script src="https://your-cdn/config.js"></script>
<script>
  ewConfig({ baseURL: 'https://api.example.com' })
</script>
```

ESM 与 framework：

```ts
import { configure } from '@ew/self-monitor/config'

configure({ baseURL: 'https://api.example.com', timeout: 30_000 })
```

`ewConfig` 是**函数**而不是对象。对象写法表达不了「合并」，因此不被支持。`configure` 返回合并后的快照，读当前值取它的返回值即可 —— CDN 那条路只有这一个函数；ESM 与 framework 另有 `getConfig()`，用于只读地取一份副本。

两者都是**顶层浅合并**，`headers` 与 `auth` 整体替换而非逐键合并。逐键合并要额外回答「怎么删掉一个头」，整替换不用回答 —— 给全量即可。代价是没有清掉单项的入口，传 `undefined` 也不生效。

## 四项的含义

| 键 | 类型 | 兜底 | 说明 |
|---|---|---|---|
| `baseURL` | `string` | `/api` | 请求的基地址 |
| `timeout` | `number` | `15_000` | 毫秒 |
| `headers` | `Record<string, string>` | 无 | 每个请求都带上的头 |
| `auth` | `{ method, secret? }` | 无 | 鉴权 token 的解析方式 |

兜底值写在组件里，因此**宿主不调 `configure` 时，行为与不加这层配置完全一样**。

### 鉴权

`auth.method` 取 `@ew/auth` 注册表里的 KEY，当前只有 `SELF_MONITOR_TOKEN` 一个。组件按它从**宿主页面的 localStorage** 里解出 token —— 自行监测系统那套数据由 SecureLS 加密存放，官方实现在缺元数据的环境下会拒绝解密，因此这里用 CryptoJS + LZString 手动做无状态解密，见 `packages/auth/src/secure-ls.ts`。

```ts
configure({
  baseURL: 'https://api.example.com',
  auth: { method: 'SELF_MONITOR_TOKEN', secret: '宿主那串 VITE_APP_STORE_SECURE_KEY' },
})
```

`secret` 不给则落回 `DEFAULT_SECRET`。解出的 token 拼成 `Authorization: Bearer <token>`，与全局 `headers` 走同一条规则（只补调用方没设的键），因此显式配的 `headers.Authorization` 压过它，调用方逐次设的又压过两者。

**解不出来不阻断请求。** 没命中 key、密钥不对、方式名打错，都只表现为这一次不带鉴权头，后端的 401 原样返回 —— 与「压根没配鉴权」表现一致，不新增一种只在网络层出现的失败。

`@ew/runtime` 只存这个值，**不依赖 `@ew/auth`**。运行时是所有产物的公共依赖，依赖它会把 crypto-js 打进每一个组件产物，包括不做鉴权的那些；`method` 因此在类型上只是 `string`，认不认得交给真正使用它的一侧判断。

## 三层优先级

组件发请求时可以逐条覆盖全局配置：

```ts
http.get('/self-monitor/list', { baseURL: 'https://other.example.com' })  // 只有这次走 other
```

优先级为请求级 > 全局配置 > 组件兜底：

- `baseURL` 与 `timeout`：请求级没给就用全局的，全局也没有才落回兜底。
- `headers`：只补**调用方没设**的那些键，同名的以请求级为准。

## 配置的作用域

同页引两个空间，也只能打同一个后端。这几项描述的都是「怎么到达宿主的后端」，属于**页面**的属性（一个页面一个 origin）；按空间分的那一截 —— `/self-monitor/list` 这种路径前缀 —— 已经写在各自的 `api.ts` 里。

**API 面看不出这一点。** `@ew/<空间>/config` 带空间名是发布形态所致（`@ew/runtime` 不发包，每个空间包必须自带一份入口），不是配置按空间分。后果是同页有人引两个空间各配一次，后一次会静默盖掉前一次。

配置读写的是 `globalThis.__ew_config__` 这一个槽。同一个页面里混用 CDN、ESM、framework 三种产物时，它们各自内联了一份完整的运行时，模块级变量本就互不相通，槽是唯一能让它们对上话的位置；同时引多个 easy-webcomp 版本也共用这一个槽。排查时可以在 devtools 里直接敲这个键。

## 读取时机

**请求时读**，不是创建实例时读。晚调 `configure()` 也生效，宿主不必赶在组件加载之前配置；同页后加载的组件自然读到已经设好的值。

`auth` 还多一层：**每个请求都重新解析一遍 token**，不在模块加载时算一次存着。登录或刷新换了 token 不必重调 `configure`，下次请求即是新的。

## 已知约束

- **请求级的 `timeout: 0` 不是「不限时」。** axios 把这个 `0` 与「没设」混在同一层，分不出来，于是它被当成没设、落回全局或 15 秒兜底。要本次不限时得写成 `configure({ timeout: 0 })`，全局那一侧的 `0` 仍是「不限时」。
- **全局 `headers` 盖得住 axios 自带的默认头。** 库默认值（如 `Accept`）属于「兜底」那一层，全局配置本就该压过它。代价是调用方显式把某个头设成**与库默认逐字相同**的字符串时会被盖掉，而那个值没有写出来的理由。

## 尚未支持

- **token 的静默刷新与 401 跳登录。** 鉴权目前只做到「解析出 token 拼成 `Bearer`」，那两件事要改各空间自己的 axios 实例，不属这一层。
- **`my-list` 之外的组件。** 只有它的列表与详情走那个 axios 实例，所以 `baseURL` 配错会直接表现为查询失败（原因显示在表格的空状态里）。别的工作空间尚未接真实请求，要鉴权也得各自在 `api.ts` 里接一次。
