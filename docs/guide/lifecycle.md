# 生命周期与状态保持

## 挂载与销毁时机

自定义元素进入文档时挂载内层框架组件，离开文档时销毁。这与普通 Vue / React 组件相同，
但有一个例外：被宿主框架移出文档的元素**同样会触发销毁**。

Vue 的 `<KeepAlive>` 在停用一个页签时并不销毁 DOM，而是把整棵子树移入一个游离容器。对
自定义元素而言，这等同于离开文档，断开生命周期照常触发。默认行为下，桥接层会在那一刻卸载
内层组件并销毁其 pinia，切回页签时得到的是一个全新实例，`onMounted` 中的请求与列表状态
全部重来。

## keep-alive

为元素加上 `keep-alive`，断开时即不卸载：元素对象、shadow root、内层框架实例及其状态全部
保留，放回文档时直接复用。

```html
<ew-my-list keep-alive label="test" />
```

```ts
document.body.innerHTML = '<ew-my-list keep-alive></ew-my-list>'
```

该属性默认关闭，仅在元素确实会被恢复（页签缓存、拖拽换位）时启用。对于会被真正销毁的场景
（`v-if` 撤掉、路由不再缓存），启用它只会让那份状态一直驻留。

### 代价

挂起的页签继续持有框架实例、pinia 与整棵 DOM。这与 KeepAlive 对宿主自身 Vue 组件的语义
一致，桥接层只是不再额外销毁一次。若不接受这份代价，不要启用该属性。

## 活跃状态信号

只保留状态而不通知组件，会产生另一种浪费：页签已经不可见，其中的轮询与定时器仍在持续请求
接口。组件可以读取一个激活信号，在隐藏期间自行停止。

```ts
import { useVueActive } from '@ew/runtime'   // React 组件改为 useReactActive

const active = useVueActive()

watch(active, (on) => {
  if (on) startPolling()
  else stopPolling()
})
```

React 侧是一个普通布尔值，变化即触发重渲染：

```tsx
const active = useReactActive()
useEffect(() => {
  if (!active) return
  const timer = setInterval(poll, 5000)
  return () => clearInterval(timer)
}, [active])
```

未使用 `keep-alive` 的元素用不到它：这类元素断开即被卸载，组件不会被渲染到失活状态。

## 已知边界

元素被真正销毁时（`v-if` 撤掉、KeepAlive 淘汰缓存），DOM 是从游离容器中被摘走的。此时
桥接层已处于断开状态，收不到第二次信号，那份实例会一直驻留。因此 `keep-alive` 的语义是
元素会被放回，而不是桥接层会自行回收。
