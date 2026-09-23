# 生命周期与状态保持

## 什么时候挂载，什么时候销毁

自定义元素一进入文档就挂载内层框架组件，离开文档就销毁。这跟普通 Vue / React 组件没区别，
但有一个地方容易踩：**被宿主框架「挪走」的元素也会走销毁**。

Vue 的 `<KeepAlive>` 停用一个页签时并不销毁 DOM，而是把整棵子树搬进一个游离容器 ——
从自定义元素的角度看，这就是「离开文档」，断开生命周期照常触发。默认行为下我们会在那一刻
卸载内层组件、扔掉它的 pinia，于是切回来是一个全新的实例，`onMounted` 里的请求、列表状态
全部重来。

## `keep-alive`：断开不销毁

给元素加上 `keep-alive`，断开时就不卸载了 —— 元素对象、shadow root、内层框架实例与它的状态
原样留着，被搬回来直接复用：

```html
<ew-my-list keep-alive label="test" />
```

```ts
document.body.innerHTML = '<ew-my-list keep-alive></ew-my-list>'
```

**默认关。** 只有明确知道自己会被搬回来（页签缓存、拖拽换位）才加。元素被真正销毁的场景
（`v-if` 撤掉、路由不再缓存）加上它只会把那份状态永远挂着。

### 代价

挂起的页签继续持着框架实例、pinia 和整棵 DOM。这正是 KeepAlive 自己的语义 —— 宿主对他们
自己的 Vue 组件也是这么干的 —— 我们只是不再多毁一次。不想要这份代价就别加这个属性。

## 知道自己是「被藏起来了」还是「还在台上」

只保状态而不通知组件，会出现另一种浪费：页签已经看不见了，里面的轮询和定时器还在打接口。
组件可以读一个激活信号，隐藏期间自己停掉：

```ts
import { useVueActive } from '@ew/runtime'   // React 组件改为 useReactActive

const active = useVueActive()

watch(active, (on) => {
  if (on) startPolling()
  else stopPolling()
})
```

React 侧是一个普通布尔值，变化即重渲染：

```tsx
const active = useReactActive()
useEffect(() => {
  if (!active) return
  const timer = setInterval(poll, 5000)
  return () => clearInterval(timer)
}, [active])
```

没有 `keep-alive` 的元素用不上它 —— 那种元素断开就被卸载，组件不会被渲染到「失活」那一刻。

## 一个够不着的角落

元素被真正销毁时（`v-if` 撤掉、KeepAlive 淘汰缓存），DOM 是从游离容器里被摘走的 ——
我们那时已经处于断开状态，收不到第二次信号，那份实例会一直挂着。所以 `keep-alive` 的承诺是
「你会被搬回来」，不是「我会自己回收」。
