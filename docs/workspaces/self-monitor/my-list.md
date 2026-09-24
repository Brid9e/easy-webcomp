<ComponentHeader name="my-list" />

自行监测系统的**排放口清单**。带排放口关键字 / 风险等级 / 监测类型 / 投产情况 / 生产情况 / 联网情况 / 有效传输率七组筛选、分页，以及每行的「查看档案」详情弹框。数据来自后端真实接口（`GET /selfmonitor/pollute/archive/outlet-page`）。

**下面的演示走的是组件自带的假数据**，不请求后端 —— 演示要看的是这个组件长什么样，不该取决于那边的数据库里有什么、这台机器能不能解出 token。真实后端由宿主在[运行时配置](/guide/config)里指向。

<ComponentDemo name="my-list" />

## 用法

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/self-monitor/my-list.js"></script>

<ew-my-list label="城东监测点"></ew-my-list>
```

npm ESM：

```ts
import '@ew/self-monitor/my-list/define'
```

## 属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `label` | `string` | `排放口清单` | 列表标题 |

## 事件

| 事件 | 回调 |
|---|---|
| `ew-select` | `{ source: 'my-list', id: string, name: string }` |

点某一行的「查看档案」时派发，`id` 与 `name` 取自该行数据（即 `outletId` 与 `outletName`）。事件带 `composed: true`，能穿透 shadow root 冒泡到 `window`。

派发不等详情请求：这两个值列表行上就有，等一次网络往返只会让宿主的响应慢一拍。

## 说明

组件源码位于 `packages/workspaces/self-monitor/components/my-list/`。它带齐了脚手架支持的三样配套设施，可以作为组合使用的参考：

- **状态按元素实例隔离。** `index.ts` 里的 `createPinia()` 是每个元素构造时各跑一次，同页放两个 `<ew-my-list>` 得到两份互不相干的状态。
- **Element Plus 的样式进了 shadow root。** 与脚手架默认相反（选 UI 库时默认关掉 shadow），这里保持 `shadow: true`：`packages/runtime` 会把同一份 CSS 额外往 `document.head` 放一份，`--el-*` 变量因此能定义在真实 `<html>` 上再继承进树里，Teleport 到 `body` 的弹框也命中得到。理由见 `packages/runtime/src/style.ts`。
- **两个接口都在 `api.ts`**：`GET /selfmonitor/pollute/archive/outlet-page` 分页查询，`GET /selfmonitor/pollute/archive/outlet-detail` 取单个排口的档案。两条都是 GET、参数走 query，响应是 `{ code, msg, data: { list, total } }`（详情那条 `data` 是单个对象），非 0 的 code 会抛错。
- **详情是点开才拉的，而且每次都重拉。** 列表行只带清单要用的十几列，排污许可证编号、行业、经纬度、视频状态那几组明细得单取；档案会被改，缓存一份就得回答「什么时候失效」，不如不缓存。代价是每次点开都有一次请求，弹框里先转圈。
- **风险等级与监测类型是 code**（`10/20/30`、`'1'/'2'/'3'`），行里的中文名一律用后端返回的字段（`riskLevelName` / `monitorTypeName`），前端不按 code 再拼一遍。投产情况 / 生产情况 / 联网情况三组不同：**值与标签逐字相同**，接口收的就是「已投产」「正常生产」这几个中文词，因此没有「值 → 标签」的翻译，也就没有翻译错位的余地。
- **空值与 0 分开。** 没有画像的排口 `riskScore` 与 `validTransRate90` 是 `null`，显示成 `--` 而不补 0 —— 0 分是一个真实存在的分值。
- **演示用的假数据在 `mock.ts`。** 12 行假清单加一份假适配器，`<ComponentDemo>` 注册元素时装上它，本页与卡片回退的真实元素因此都不打后端；形态与写法见[新增组件](/guide/authoring)。组件源码没有为它让路：`api.ts` / `store.ts` 里一律走真实接口，假数据只接管出口。因此演示里点「查看档案」也是假的，改的是假数据不是档案。
- **请求打到哪里、带什么身份，由宿主在运行时说了算。** `baseURL` / `timeout` / `headers` / `auth` 四项不在组件源码里写死，宿主 `configure()` 一次即可（不配就是 `/` 与 15 秒、不带鉴权头），见[运行时配置](/guide/config)。这四项连同那套拦截器都在 `@ew/http` 里，`api.ts` 只把它引过来、再补上本组件的两个接口。调试页（`pnpm dev`）里配的是真后端，但 **token 读的是当前页面自己那一个 origin 的 localStorage**，调试页这个 `localhost` 底下通常没有那条 `*-core-access`，所以解不出 token、后端回「账号未登录」—— 属预期。

## 尚未支持

- **导出。** 宿主那套排放口清单没有对应的导出接口，所以这里也没有导出按钮。
- **左侧的层级树。** 接口还收 `psId` / `outletId` / `provinceCode` / `cityCode` / `areaCode` / `directCode` 六个联动参数，宿主用「一口一档」那棵树在驱动；本组件不含那棵树，这六个参数没有接。
