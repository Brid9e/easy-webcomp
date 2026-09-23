# keep-alive 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让带上 `keep-alive` 属性的自定义元素在被移出文档时保住内层实例，回来直接复用，不再重新挂载、不再重新请求。

**Architecture:** `disconnectedCallback` 分流：带 `keep-alive` 就不 `unmount`，改调 `adapter.setActive(instance, false)` 通知组件失活；`connectedCallback` 发现实例还在就 `setActive(true)` 后直接返回。两个 adapter 各用自己的方式把布尔值送到组件（Vue 用 provide 一个 `shallowRef`，React 用 context）。

**Tech Stack:** TypeScript、Vitest + jsdom、Vue 3、React 19、Playwright。

**设计文档：** `docs/superpowers/specs/2026-09-23-ew-keep-alive-design.md`

---

### Task 1: element.ts —— 断开时按 `keep-alive` 分流

**Files:**
- Modify: `packages/runtime/src/types.ts:22-30`
- Modify: `packages/runtime/src/element.ts:40-74`
- Test: `tests/runtime/element.test.ts`

- [ ] **Step 1: 写失败的测试**

`tests/runtime/element.test.ts` 的 `StubInstance` 加一个字段，`stubAdapter` 加 `setActive`：

```ts
interface StubInstance {
  host: HTMLElement | ShadowRoot
  props: Record<string, unknown>
  emit: (name: string, detail: unknown) => void
  updates: number
  unmounted: boolean
  active: boolean
}

function stubAdapter(log: StubInstance[]): ElementAdapter {
  return {
    mount(host, props, emit) {
      const instance: StubInstance = {
        host,
        props,
        emit,
        updates: 0,
        unmounted: false,
        active: true,
      }
      log.push(instance)
      return instance
    },
    update(instance, props) {
      const i = instance as StubInstance
      i.props = props
      i.updates += 1
    },
    unmount(instance) {
      ;(instance as StubInstance).unmounted = true
    },
    setActive(instance, active) {
      ;(instance as StubInstance).active = active
    },
  }
}
```

在同文件 `describe('createElementClass')` 里、「断开后重新插入能再次挂载…」那条用例之后追加：

```ts
  it('带 keep-alive 的元素断开时不卸载，只通知失活', () => {
    const tag = uniqueTag()
    defineComponent({ tag })
    const el = mount(tag, { 'keep-alive': '' })
    document.body.removeChild(el)
    expect(log[0]?.unmounted).toBe(false)
    expect(log[0]?.active).toBe(false)
  })

  it('带 keep-alive 的元素重新插入复用同一个实例', () => {
    const tag = uniqueTag()
    defineComponent({ tag })
    const el = mount(tag, { 'keep-alive': '' })
    document.body.removeChild(el)
    document.body.appendChild(el)
    expect(log).toHaveLength(1)
    expect(log[0]?.active).toBe(true)
  })
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test -- tests/runtime/element.test.ts
```

预期：两条新用例 FAIL —— `unmounted` 为 `true`、`log` 长度为 2。

- [ ] **Step 3: 实现**

`packages/runtime/src/types.ts` 的 `ElementAdapter` 末尾加一个可选方法：

```ts
export interface ElementAdapter {
  mount(
    host: HTMLElement | ShadowRoot,
    props: Record<string, unknown>,
    emit: EmitFn,
  ): unknown
  update(instance: unknown, props: Record<string, unknown>): void
  unmount(instance: unknown): void
  /**
   * 元素被移出文档但选择保状态（keep-alive）时通知组件。
   *
   * 可选：不实现不会让元素失效，只是组件收不到激活信号 —— 状态照样保住。
   */
  setActive?(instance: unknown, active: boolean): void
}
```

`packages/runtime/src/element.ts` 的 `connectedCallback` 开头：

```ts
    connectedCallback(): void {
      // 元素被移出文档再放回来会走第二轮 connectedCallback（切页签、被宿主框架挪动、
      // v-if 重挂都会）。实例还在说明上一轮断开时我们把它挂起了（keep-alive）——
      // 直接唤回来，重新 mount 会把内层那份状态扔掉，而这正是挂起要保的东西。
      if (this._instance !== null) {
        adapter.setActive?.(this._instance, true)
        return
      }
```

`disconnectedCallback` 整段替换：

```ts
    disconnectedCallback(): void {
      liveInstances.delete(this)
      if (this._instance === null) return

      // keep-alive：宿主（Vue 的 KeepAlive、或任何「把 DOM 挪走而不是销毁」的容器）只是把
      // 元素移进了一个游离容器，元素会回来。这时不卸载 —— 一卸，内层 app 与它那份 pinia 就
      // 没了，回来是新实例、必然重新请求。改为通知组件失活，让它自己停掉隐藏期间的轮询与请求。
      if (this.hasAttribute('keep-alive')) {
        adapter.setActive?.(this._instance, false)
        return
      }

      adapter.unmount(this._instance)
      this._instance = null
    }
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm run test -- tests/runtime/element.test.ts
```

预期：PASS（含原有的「断开后重新插入能再次挂载…」与「refresh() 不影响已卸载实例」—— 无 `keep-alive` 的路径没变）。

- [ ] **Step 5: 提交**

```bash
git add packages/runtime/src/types.ts packages/runtime/src/element.ts tests/runtime/element.test.ts
git commit -m "feat(runtime): keep-alive 属性让元素断开时不销毁实例"
```

---

### Task 2: Vue adapter 的激活信号

**Files:**
- Modify: `packages/runtime/src/vue.ts`
- Modify: `packages/runtime/src/index.ts:26-27`
- Test: `tests/runtime/vue-adapter.test.ts`

- [ ] **Step 1: 写失败的测试**

`tests/runtime/vue-adapter.test.ts` 顶部 import 改成：

```ts
import { defineComponent, h, inject, watch, type Plugin } from 'vue'
import {
  createElementClass,
  resetRegistry,
  resetStyleCache,
  useVueActive,
  useVueEmit,
  vueAdapter,
} from '@ew/runtime'
```

在 `describe('vueAdapter')` 末尾追加：

```ts
  it('keep-alive 元素断开时组件读到失活，回来后读到激活，且实例没换', async () => {
    const tag = uniqueTag()
    let mounts = 0
    const ActiveProbe = defineComponent({
      setup() {
        mounts += 1
        const active = useVueActive()
        return () => h('span', { class: 'active' }, String(active.value))
      },
    })
    const ctor = createElementClass({ tag }, vueAdapter(() => ActiveProbe), '')
    customElements.define(tag, ctor)

    const el = document.createElement(tag)
    el.setAttribute('keep-alive', '')
    document.body.appendChild(el)
    await tick()
    expect(el.shadowRoot?.querySelector('.active')?.textContent).toBe('true')

    document.body.removeChild(el)
    await tick()
    expect(el.shadowRoot?.querySelector('.active')?.textContent).toBe('false')

    document.body.appendChild(el)
    await tick()
    expect(el.shadowRoot?.querySelector('.active')?.textContent).toBe('true')
    // 关键：整段过程只 setup 过一次，证明复用而不是重建
    expect(mounts).toBe(1)
  })

  it('注入不存在时 useVueActive 恒为 true 并告警', async () => {
    let value: boolean | undefined
    const Bare = defineComponent({
      setup() {
        value = useVueActive().value
        return () => h('span')
      },
    })
    const host = document.createElement('div')
    vueAdapter(() => Bare).mount(host, {}, () => {})
    await tick()
    expect(value).toBe(true)
  })
```

> 第二条不 spy `console.warn`：警告内容不是契约，恒为 true 才是。

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test -- tests/runtime/vue-adapter.test.ts
```

预期：FAIL —— `useVueActive` 尚未导出（TS 报错）／`.active` 元素找不到。

- [ ] **Step 3: 实现**

`packages/runtime/src/vue.ts`：

```ts
import {
  createApp,
  h,
  inject,
  ref,
  shallowRef,
  type App,
  type Plugin,
  type Ref,
  type ShallowRef,
} from 'vue'
import type { ElementAdapter, EmitFn } from './types.ts'

export const EW_EMIT_KEY: unique symbol = Symbol('ew-emit')
export const EW_ACTIVE_KEY: unique symbol = Symbol('ew-active')
```

`VueInstance` 加一个字段：

```ts
interface VueInstance {
  app: App
  propsRef: ShallowRef<Record<string, unknown>>
  activeRef: ShallowRef<boolean>
}
```

`mount` 里 provide 两份，并把它放进 instance：

```ts
    mount(host, props, emit) {
      const propsRef = shallowRef<Record<string, unknown>>({ ...props })
      // 断开不一定等于销毁（keep-alive），组件靠它知道自己是「被藏起来」还是「还在台上」
      const activeRef = shallowRef(true)
      const app = createApp({
        render: () => h(getComponent() as never, propsRef.value),
      })
      app.provide(EW_EMIT_KEY, emit)
      app.provide(EW_ACTIVE_KEY, activeRef)
      // 必须装在 mount 之前：store 是在组件 setup 里就调用 useXxxStore() 的，晚装取不到
      for (const plugin of options.plugins?.() ?? []) app.use(plugin)
      app.mount(host as HTMLElement)
      const instance: VueInstance = { app, propsRef, activeRef }
      return instance
    },
```

`adapter` 里加 `setActive`：

```ts
    setActive(instance, active) {
      ;(instance as VueInstance).activeRef.value = active
    },
```

文件末尾追加：

```ts
/**
 * 元素是否处于激活状态。带 keep-alive 的元素被移出文档时转为 false —— 组件据此停掉轮询、
 * 取消请求；不带该属性的元素断开即卸载，组件根本不会再被渲染，用不上这个。
 */
export function useVueActive(): Ref<boolean> {
  const active = inject<ShallowRef<boolean> | null>(EW_ACTIVE_KEY, null)
  if (!active) {
    console.warn('[ew] useVueActive() 在 EW_ACTIVE_KEY 未注入的上下文中被调用，恒为 true。')
    return ref(true)
  }
  return active
}
```

`packages/runtime/src/index.ts` 那两行改成：

```ts
export { vueAdapter, useVueActive, useVueEmit, EW_ACTIVE_KEY, EW_EMIT_KEY } from './vue.ts'
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm run test -- tests/runtime/vue-adapter.test.ts && pnpm run typecheck
```

预期：PASS，且 typecheck 不报（`ShallowRef<boolean>` 可赋给 `Ref<boolean>`）。

- [ ] **Step 5: 提交**

```bash
git add packages/runtime/src/vue.ts packages/runtime/src/index.ts tests/runtime/vue-adapter.test.ts
git commit -m "feat(runtime): Vue 侧 useVueActive 激活信号"
```

---

### Task 3: React adapter 的激活信号

**Files:**
- Modify: `packages/runtime/src/react.ts`
- Modify: `packages/runtime/src/index.ts:29`
- Test: `tests/runtime/react-adapter.test.tsx`

- [ ] **Step 1: 写失败的测试**

`tests/runtime/react-adapter.test.tsx` 的 import 改成：

```tsx
import { useRef } from 'react'
import {
  createElementClass,
  reactAdapter,
  resetRegistry,
  resetStyleCache,
  useReactActive,
  useReactEmit,
} from '@ew/runtime'
```

在 `describe('reactAdapter')` 末尾追加：

```tsx
  it('keep-alive 元素断开时组件读到失活，回来后读到激活，且没重建', async () => {
    const tag = uniqueTag()
    let seq = 0
    function ActiveProbe() {
      // 只在首次渲染时取号；重建会换号，号不变即证明是同一个组件实例
      const id = useRef(++seq).current
      const active = useReactActive()
      return <span className="active">{`${id}:${active}`}</span>
    }
    const ctor = createElementClass({ tag }, reactAdapter(() => ActiveProbe), '')
    customElements.define(tag, ctor)

    const el = document.createElement(tag)
    el.setAttribute('keep-alive', '')
    await connect(el)
    await tick()
    expect(el.shadowRoot?.querySelector('.active')?.textContent).toBe('1:true')

    await act(async () => {
      document.body.removeChild(el)
    })
    await tick()
    expect(el.shadowRoot?.querySelector('.active')?.textContent).toBe('1:false')

    await act(async () => {
      document.body.appendChild(el)
    })
    await tick()
    expect(el.shadowRoot?.querySelector('.active')?.textContent).toBe('1:true')
  })
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm run test -- tests/runtime/react-adapter.test.tsx
```

预期：FAIL —— `useReactActive` 尚未导出；`active` 为 `true` 一路到底。

- [ ] **Step 3: 实现**

`packages/runtime/src/react.ts` 整份改成：

```ts
import { createContext, createElement, useContext, type Context, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ElementAdapter, EmitFn } from './types.ts'

export const EwEmitContext: Context<EmitFn> = createContext<EmitFn>(() => {})

/** 元素是否激活。带 keep-alive 的元素被移出文档时转 false，组件据此停掉后台动作。 */
export const EwActiveContext: Context<boolean> = createContext<boolean>(true)

interface ReactInstance {
  root: Root
  update: (props: Record<string, unknown>) => void
  setActive: (active: boolean) => void
}

export function reactAdapter(getComponent: () => unknown): ElementAdapter {
  return {
    mount(host, props, emit) {
      const root = createRoot(host as unknown as Element | DocumentFragment)
      // 改 props 与改激活状态都只是重渲染，两份状态都留在闭包里
      let current: Record<string, unknown> = { ...props }
      let active = true

      const paint = (): void => {
        root.render(
          createElement(
            EwEmitContext.Provider,
            { value: emit },
            createElement(
              EwActiveContext.Provider,
              { value: active },
              createElement(getComponent() as never, current),
            ) as ReactNode,
          ),
        )
      }
      paint()

      const instance: ReactInstance = {
        root,
        update(next) {
          current = { ...next }
          paint()
        },
        setActive(next) {
          active = next
          paint()
        },
      }
      return instance
    },
    update(instance, props) {
      ;(instance as ReactInstance).update(props)
    },
    setActive(instance, active) {
      ;(instance as ReactInstance).setActive(active)
    },
    unmount(instance) {
      ;(instance as ReactInstance).root.unmount()
    },
  }
}

export function useReactEmit(): EmitFn {
  return useContext(EwEmitContext)
}

export function useReactActive(): boolean {
  return useContext(EwActiveContext)
}
```

> 顺带把 `mount` 里那段渲染挪进 `paint()`：现在有三处要重渲染（挂载、改 props、改激活），
> 再抄一遍就是三份。`update` 的对外行为与改动前一致。

`packages/runtime/src/index.ts` 最后一行改成：

```ts
export { reactAdapter, useReactActive, useReactEmit, EwActiveContext, EwEmitContext } from './react.ts'
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm run test -- tests/runtime/react-adapter.test.tsx && pnpm run typecheck
```

预期：PASS（原有的「卸载后不再渲染」也过 —— 无 `keep-alive` 时仍然 unmount）。

- [ ] **Step 5: 提交**

```bash
git add packages/runtime/src/react.ts packages/runtime/src/index.ts tests/runtime/react-adapter.test.tsx
git commit -m "feat(runtime): React 侧 useReactActive 激活信号"
```

---

### Task 4: e2e —— 真实产物上验证复用

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: 写测试**

在 `tests/e2e/smoke.spec.ts` 末尾追加：

```ts
test('keep-alive：移出文档再放回来复用同一个实例', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const el = document.createElement('ew-hello-vue')
    el.setAttribute('keep-alive', '')
    el.setAttribute('name', 'KA')
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 0))

    const shadow = el.shadowRoot
    const inner = shadow!.querySelector('.ew-hello-vue')

    el.remove()
    document.body.appendChild(el)
    await new Promise((r) => setTimeout(r, 0))

    return {
      sameRoot: el.shadowRoot === shadow,
      sameNode: el.shadowRoot!.querySelector('.ew-hello-vue') === inner,
      styleSheets: el.shadowRoot!.adoptedStyleSheets.length,
      text: el.shadowRoot!.textContent,
    }
  })

  expect(result.sameRoot).toBe(true)
  expect(result.sameNode).toBe(true)
  expect(result.styleSheets).toBe(1)
  expect(result.text).toContain('KA')
})
```

> `sameNode` 是这条用例的核心：卸载重挂会让 Vue 换一批 DOM 节点，节点同一性只有「没重挂」才成立。

- [ ] **Step 2: 跑测试**

```bash
pnpm run build && pnpm run test:e2e
```

预期：PASS（需要 `dist/cdn/hello-vue.js` 是刚构建的）。

- [ ] **Step 3: 提交**

```bash
git add tests/e2e/smoke.spec.ts
git commit -m "test(e2e): keep-alive 断开重连复用同一实例"
```

---

### Task 5: 文档

**Files:**
- Create: `docs/guide/lifecycle.md`
- Modify: `docs/.vitepress/config.mts:83-92`
- Modify: `README.md:159-166`
- Modify: `docs/guide/authoring.md`（派发事件一节之后）

- [ ] **Step 1: 新建 `docs/guide/lifecycle.md`**

````markdown
# 生命周期与状态保持

## 什么时候挂载，什么时候销毁

自定义元素一进入文档就挂载内层框架组件，离开文档就销毁。这跟普通 Vue / React 组件没区别，
但有一个地方容易踩：**被宿主框架「挪走」的元素也会走销毁**。

Vue 的 `<KeepAlive>` 停用一个页签时并不销毁 DOM，而是把整棵子树搬进一个游离容器 ——
从自定义元素的角度看，这就是「离开文档」，`disconnectedCallback` 照常触发。默认行为下
我们会在那一刻卸载内层组件、扔掉它的 pinia，于是切回来时是一个全新的实例，
`onMounted` 里的请求、列表状态全部重来。

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

挂起的页签继续持着框架实例、pinia 和整棵 DOM。这正是 KeepAlive 自己的语义 —— 宿主对他们自己的
Vue 组件也是这么干的 —— 我们只是不再多毁一次。不想要这份代价就不要加这个属性。

## 知道自己是「被藏起来了」还是「还在台上」

只保状态不通知组件，会出现另一种浪费：页签已经看不见了，里面的轮询和定时器还在打接口。
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

没有 `keep-alive` 的元素用不上它 —— 那种元素断开就被卸载了，组件不会被渲染到「失活」那一刻。

## 一个够不着的角落

元素被真正销毁时（`v-if` 撤掉、KeepAlive 淘汰缓存），DOM 是从游离容器里被摘走的 ——
我们那时已经处于断开状态，收不到第二次信号，那份实例会一直挂着。所以 `keep-alive` 的承诺是
「你会被搬回来」，不是「我会自己回收」。
````

- [ ] **Step 2: 侧边栏加一项**

`docs/.vitepress/config.mts` 的 `'/guide/'` 数组里，`主题与 token` 之后插一行：

```ts
            { text: '生命周期与状态保持', link: '/guide/lifecycle' },
```

- [ ] **Step 3: README 加一节**

`README.md` 的「降级到 light DOM」一节之后追加：

````markdown
## 保持状态（keep-alive）

组件被移出文档时默认销毁。宿主用 KeepAlive 缓存页签、或只是把它挪个位置时，这会让状态白白丢掉
（切回来必重新请求）。给元素加 `keep-alive` 即断开不销毁：

```html
<ew-my-list keep-alive></ew-my-list>
```

组件可读激活信号，在隐藏期间停掉轮询与请求：`useVueActive()`（Vue）/ `useReactActive()`（React）。
代价是挂起的元素继续持着框架实例与整棵 DOM，所以默认关。细节见
[docs/guide/lifecycle.md](docs/guide/lifecycle.md)。
````

- [ ] **Step 4: `authoring.md` 补一句交叉引用**

`docs/guide/authoring.md` 的「派发事件」一节末尾追加：

```markdown
组件被隐藏时的工作（停轮询、取消请求）见
[生命周期与状态保持](lifecycle.md#知道自己是「被藏起来了」还是「还在台上」) ——
宿主给元素加了 `keep-alive` 时它才不会被卸载。
```

- [ ] **Step 5: 确认文档站能构建**

```bash
pnpm run docs:build
```

预期：绿，侧边栏出现「生命周期与状态保持」。

- [ ] **Step 6: 提交**

```bash
git add docs/guide/lifecycle.md docs/.vitepress/config.mts docs/guide/authoring.md README.md
git commit -m "docs: 生命周期与状态保持（keep-alive / useVueActive / useReactActive）"
```

---

### Task 6: 全量验证

- [ ] **Step 1: 跑 verify**

```bash
pnpm run verify
```

预期：`typecheck` → `test` → `build` → `check:artifacts` → `docs:build` → `test:e2e` 六个阶段全绿。

- [ ] **Step 2: 确认体积基线没动**

构建末尾打印的 gzip 体积应与 `docs/guide/build.md` 的表持平。本次只往运行时加了几行分支与两个
context，`dist/cdn/hello-vue.js` 若有可见增长（超过 0.3 KB）说明打进了不该进的东西。

---

## 人工验证（交给用户）

本机跑不通 KeepAlive，上面全是单元与产物层面的证据。真正的验收在宿主项目里：

1. 在本仓库 `pnpm run build`，宿主项目重新安装 `@ew/self-monitor`（`file:` 装的要重装，
   `link:` 装的不用）。
2. `OutletList.vue` 的模板改成 `<ew-my-list keep-alive label="test" />`。
3. 切走页签再切回来 —— 列表不应再重新 loading。
4. 反向验证：把 `keep-alive` 去掉，loading 应该回来。这一条能证明看到的差异确实来自本次改动。

## 不做的事

- 不给 `meta.ts` 加 `keepAlive`（组件级默认值把用方的决定挪到了作者手里）。
- 不做空闲超时回收、不做 `dispose()`。
- 不动 `src/workspaces/self-monitor/`（在制品）。
