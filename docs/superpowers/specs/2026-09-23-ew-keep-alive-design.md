# keep-alive：断开时保住组件状态

## 背景

宿主用 KeepAlive + 路由做页签缓存时，切走再切回来组件会重新加载。现场是 self-monitor 的
`OutletList.vue`：模板里放了 `<ew-my-list>`，切页签回来列表必重新 loading。

根因在 `packages/runtime/src/element.ts`：`disconnectedCallback` 无条件 `adapter.unmount()`。
KeepAlive 停用一个页签的方式是**把整棵 DOM 搬进一个游离容器**（不是销毁），DOM 一离开文档，
自定义元素就吃到 `disconnectedCallback`，我们把内层 Vue app 和它那份 pinia 一起扔了。
切回来 `connectedCallback` 重新 mount，`my-list` 的 `onMounted` 里 `store.fetchRows()`
于是再跑一遍 —— 这就是那个 loading。

关键点是**元素对象本身没死**：KeepAlive 拽着它，shadow root 也还在，那份状态是被我们主动毁掉的。
`connectedCallback` 第一行本来就写着 `if (this._instance !== null) return`，只要断开时不卸载，
回来就直接复用。

## 方案

元素加一个 `keep-alive` 属性。带上它之后：

- `disconnectedCallback` 不卸载，改为 `adapter.setActive(instance, false)`
- `connectedCallback` 发现实例还在，`adapter.setActive(instance, true)` 后直接返回，不重新 mount

再配一对激活信号给组件作者：`useVueActive()` / `useReactActive()`。隐藏期间组件能自己停掉轮询、
取消请求 —— 否则状态保住了，后台却还在打接口，等于拿内存换资源泄漏。

### 为什么是元素属性，不是 `meta.ts` 字段

要不要保状态是**用方**的决定，不是组件作者的：同一个 `my-list` 在弹窗里就该销毁、在 KeepAlive 里
就该留着。这跟 `disable-shadow` 是同一类开关，挂在元素上，宿主模板改一个词：

```html
<ew-my-list keep-alive label="test" />
```

**默认关（opt-in）。** 默认开会让所有 `v-if` 场景悄悄泄漏内存 —— 那种场景元素再也不会回来，
我们却一直挂着它。

### 为什么 `setActive` 是可选方法

`ElementAdapter` 是公开类型。改成必填会破坏外部 adapter；可选则第三方 adapter 不实现也只是收不到
激活信号，状态照样保住 —— 降级方向是对的。

## API

| 名字 | 位置 | 用途 |
|---|---|---|
| `keep-alive` 属性 | 元素 | 宿主声明「断开不销毁」 |
| `setActive?(instance, active)` | `ElementAdapter` | 元素 → adapter 的激活通道 |
| `EW_ACTIVE_KEY` | `@ew/runtime` | Vue 侧 provide 的 symbol |
| `useVueActive(): Ref<boolean>` | `@ew/runtime` | Vue 组件读激活状态 |
| `EwActiveContext` | `@ew/runtime` | React 侧 context |
| `useReactActive(): boolean` | `@ew/runtime` | React 组件读激活状态 |

对称于现有的 `EW_EMIT_KEY` / `useVueEmit` 与 `EwEmitContext` / `useReactEmit`：Vue 给一个响应式
ref（组件用 `watch` 接副作用），React 给一个值（变化即重渲染），各自是那个框架里顺手的形态。

## 代价

被挂起的页签继续持着 Vue app + pinia + 整棵 DOM 树。这正是 KeepAlive 自己的语义 —— 宿主对他们自己的
Vue 组件也是这么干的，我们只是不再多毁一次。所以默认关，且写进文档。

## 边界

- **不提供 `meta.keepAlive`。** 组件级默认值会把「要不要保状态」这个用方的决定挪到作者手里，
  与上面那条理由矛盾。
- **不做空闲超时回收。** 可以给挂起的实例一个 TTL，超时再卸。本次不做：宿主的 KeepAlive 没写
  `:max`，不发生淘汰，加了只是凭空多一个可调参数。真要做时加在 `element.ts`，不动 API 面。
- **一个够不着的角落。** 元素被真销毁时（`v-if` 撤掉、KeepAlive 淘汰缓存），DOM 是从游离容器里被
  摘走的 —— 我们那时已经处于 disconnected 状态，收不到第二次信号，那份 app 会一直挂着。
  已知，本次不解决。
- **组件作者一行都不用改。** `my-list` 的 `onMounted` 照旧，只是不会再跑第二遍。
  加 `useVueActive()` 是可选的优化。
