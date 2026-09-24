# 运行时配置

组件跑在宿主的页面里，请求要打到宿主的后端。`baseURL` / `timeout` / `headers` 这三项由宿主在运行时设置一次，组件读它 —— 换一个宿主不必改组件源码、重新发一次包。

## 三种产物怎么设置

| 产物 | 入口 |
|---|---|
| CDN | 引 `config.js`，调全局函数 `ewConfig({ ... })` |
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

`ewConfig` 是个**函数**，不是对象 —— 填对象那种写法不被支持，它没法表达「合并」。`configure` 返回合并后的快照，**想读当前值就用它的返回值**（CDN 那条路只有这一个函数）。

ESM 与 framework 另外多一个 `getConfig()` 用于只读地取一份副本，排查时方便。两个函数都是**顶层浅合并**，`headers` 整体替换而不是逐键合并：逐键合并会引出「怎么删掉一个头」的歧义，整替换的答案很清楚 —— 给全量。没有清掉单项的入口，传 `undefined` 也不会生效。

## 三项的含义

| 键 | 类型 | 兜底 | 说明 |
|---|---|---|---|
| `baseURL` | `string` | `/api` | 请求的基地址 |
| `timeout` | `number` | `15_000` | 毫秒 |
| `headers` | `Record<string, string>` | 无 | 每个请求都带上的头 |

兜底值写在组件里，所以**宿主不调 `configure` 时行为与不加这层配置完全一样**。

## 优先级：请求级 > 全局 > 组件兜底

组件发请求时可以逐条覆盖全局配置：

```ts
http.get('/self-monitor/list', { baseURL: 'https://other.example.com' })  // 只有这次走 other
```

判定方式：

- `baseURL` 与 `timeout` 请求级没给就用全局的，全局也没有才落回兜底。
- `headers` 只补**调用方没设**的那些键，同名的以请求级为准。

### 两条容易踩的细节

- **请求级的 `timeout: 0` 不是「不限时」。** axios 把这个 `0` 与「没设」混在同一层，分不出来，于是它被当成没设、落回全局或 15 秒兜底。要「本次不限时」就 `configure({ timeout: 0 })` —— 全局那一侧的 `0` 仍是「不限时」。
- **全局 `headers` 盖得住 axios 自带的默认头。** 库默认值（如 `Accept`）属于「兜底」那一层，全局配置本就该压过它，所以 `configure({ headers: { Accept: 'application/json' } })` 会生效。代价是调用方显式把某个头设成**与库默认逐字相同**的字符串时会被全局盖掉；这个值没人会故意写。

## 配置是整个页面一份，不按空间分

同页引两个空间，也只能打同一个后端。这不是妥协：三项描述的都是「怎么到达宿主的后端」，那是**页面**的属性（一个页面一个 origin）；真正按空间分的那一截 —— `/self-monitor/list` 这种路径前缀 —— 已经写在各自的 `api.ts` 里。

**但 API 面看不出这一点。** `@ew/<空间>/config` 带空间名，那是发布形态的产物（`@ew/runtime` 不发包，每个空间包必须自带一份入口），不是「配置按空间分」。后果是同页有人引两个空间各配一次，**后一次会静默盖掉前一次**，没有任何提示。

另外两点：

- **配置读写的是 `globalThis.__ew_config__` 这一个槽**，所以同一个页面里混用 CDN、ESM、framework 三种产物，它们仍然共享同一份配置 —— 这几份产物各自内联了一份完整的运行时，模块级变量本来互不相通，槽是唯一能让它们对上话的位置。排查时可以在 devtools 里直接敲这个键。
- **同时引多个 easy-webcomp 版本也共用同一个槽**，版本 A 写的配置版本 B 读得到。

## 什么时候读

**请求时读**，不是创建实例时读。所以晚调 `configure()` 也生效，宿主不必赶在组件加载之前配置；同页后加载的组件自然就读到已经设好的值。

## 没做的部分

- **鉴权不在这一层。** 键集留着口子，将来按 `auth: { method, secret }` 的形状加。
- **`fetchMyList` 仍是 mock。** 配置对组件的 axios 实例生效（`tests/workspaces/self-monitor-api.test.ts` 用假 adapter 断言过），但当前没有真实请求可打，所以文档站与调试页里看不出差别。
