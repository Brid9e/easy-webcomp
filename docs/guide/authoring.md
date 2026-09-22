# 新增一个组件

在 `src/components/` 下新建目录，放入五个文件即可，**不需要修改任何构建配置或路由**：

```
src/components/<组件名>/
├── Component.vue     # 或 Component.tsx，二者只能有一个
├── meta.ts           # 组件契约：tag、props、events
├── style.css         # 唯一样式来源，禁止用 <style> 块
├── index.ts          # 入口：导出构造器与 register()
└── define.ts         # 副作用入口，CDN 产物用
```

`Component.vue` 与 `Component.tsx` **必须且只能有一个**。两个都有或都没有，构建脚本与文档站扫描都会直接抛错。

## meta.ts

```ts
import { defineComponentMeta } from '../../runtime/types'

export default defineComponentMeta({
  tag: 'ctc-hello-vue',
  shadow: true,
  props: {
    name: { type: 'string', default: 'World' },
    count: { type: 'number', default: 0 },
    autoLoad: { type: 'boolean', attr: 'auto-load', default: false },
  },
  events: ['select'],
})
```

`props` 的 `type` 目前支持 `string` / `number` / `boolean`，交互面板按它渲染 text / number / checkbox 三种控件。布尔属性的 attribute 名用 `attr` 显式指定（不指定的话 `autoLoad` 会推导成 `auto-load`，结果一样，写出来更明确）。

`shadow: true` 是默认值。`style.css` 交给桥接层按 Shadow DOM 投递，因此组件里不要写 `<style scoped>`，否则样式只存在于源码模式。

## 派发事件

```ts
import { useEmit } from '../../runtime/vue'   // React 组件改为 '../../runtime/react'

const emit = useEmit()
emit('select', { id: 1 })                      // → 派发 ctc-select 事件
```

事件名必须出现在 `meta.ts` 的 `events` 数组里，否则开发态会打印警告。事件一律以 `ctc-` 为前缀、`composed: true`，能穿透 shadow root。

## 加完之后

不用改导航。构建脚本扫目录生成入口与 `package.json` 的 `exports`；文档站的侧边栏同样扫目录 —— 组件会立刻出现在左侧导航里，链接指向总览页上的那块面板。想给它一页散文，就新建 `docs/components/<组件名>.md`，侧边栏会自动指过去。
