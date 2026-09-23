<ComponentHeader name="my-list" />

自行监测系统的监测点列表。带关键字 / 状态 / 更新时间三组筛选、分页，以及每行的「查看」详情弹框。数据目前来自 `api.ts` 里的 mock。

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
| `label` | `string` | `我的列表` | 列表标题 |

## 事件

| 事件 | 回调 |
|---|---|
| `ew-select` | `{ source: 'my-list', id: string, name: string }` |

点某一行的「查看」时派发，`id` 与 `name` 取自该行数据。事件带 `composed: true`，能穿透 shadow root 冒泡到 `window`。

## 说明

组件源码位于 `packages/workspaces/self-monitor/components/my-list/`。它带齐了脚手架支持的三样配套设施，可以作为组合使用的参考：

- **状态按元素实例隔离。** `index.ts` 里的 `createPinia()` 是每个元素构造时各跑一次，同页放两个 `<ew-my-list>` 得到两份互不相干的状态。
- **Element Plus 的样式进了 shadow root。** 与脚手架默认相反（选 UI 库时默认关掉 shadow），这里保持 `shadow: true`：`packages/runtime` 会把同一份 CSS 额外往 `document.head` 放一份，`--el-*` 变量因此能定义在真实 `<html>` 上再继承进树里，Teleport 到 `body` 的弹框也命中得到。理由见 `packages/runtime/src/style.ts`。
- **`api.ts` 现在是 mock。** 接真实接口只需替换 `fetchMyList` 的函数体，`store.ts` 与组件一行都不用动。
