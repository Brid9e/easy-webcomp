# 构建与产物

```bash
pnpm run build      # ESM + CDN 全部产物
pnpm run build:esm  # 只出 ESM
pnpm run build:cdn  # 只出 CDN
```

| 路径 | 用途 |
|---|---|
| `dist/esm/*.js` | npm ESM 引入，无副作用，需显式调 `register()` |
| `dist/esm/*/define.js` | npm ESM 引入，import 即注册 |
| `dist/cdn/<组件>.js` | CDN 单文件，运行时内联，import 即注册 |
| `dist/cdn/ew-all.js` | CDN 全量单文件 |

ESM 一次多入口构建、允许代码分割（消费方是打包器，整目录解析）；IIFE 每个组件单独构建一次 —— Rollup 的 IIFE 格式不支持多入口，这是唯一能产出「单文件可拷走」的方式。

构建结束会打印每个产物的 gzip 体积。`package.json` 的 `exports` 字段由构建脚本扫描组件目录自动生成，加组件后重新构建即自动多出对应子路径，不用手改。

## 引入方式

CDN：

```html
<link rel="stylesheet" href="https://your-cdn/tokens.css" />
<script src="https://your-cdn/hello-vue.js"></script>

<ew-hello-vue name="World" count="3"></ew-hello-vue>
```

ESM：

```ts
import 'easy-webcomp/hello-vue/define'

document.body.innerHTML = '<ew-hello-vue name="World"></ew-hello-vue>'
```

React 项目里传对象属性：

```tsx
const ref = useRef<HTMLElement>(null)
useEffect(() => {
  if (ref.current) (ref.current as any).payload = { id: 1 }
}, [])
return <ew-hello-vue ref={ref} name="World" />
```

React ≤18 会把对象属性序列化，必须走 property 通道；`<ew-hello-vue>` 需要在自己的 `d.ts` 里补充 JSX 类型声明。

Vue 项目里用 `v-bind` 要注意：**只要 prop 名在元素上已定义，Vue 就走 property 通道而不是 attribute 通道**，值不会经过字符串化与类型强转。所以数字要传数字、布尔要传真布尔 —— 传 `''` 表示布尔为真会被 Vue 的 Boolean prop 转换一律当成 `false`。文档站的交互面板就是按这条规则写的。

## 体积基线

最近一次构建（gzip）——后续构建应与这张表对比，某个产物突然变大说明引入了未察觉的大依赖：

| 产物 | gzip |
|---|---|
| `dist/cdn/hello-vue.js` | 26.8 KB |
| `dist/cdn/hello-react.js` | 69.3 KB |
| `dist/cdn/ew-all.js` | 95.2 KB |

ESM 产物体积随打包器而定，不在基线对比范围内。

## 已知约束

- **不要用 `:host` 写变量默认值。** 优先级高于宿主继承来的值，换肤会静默失效。
- **事件必须带 `composed: true`。** 漏了事件出不了 shadow root，且不报错。桥接层已统一处理，手写事件时注意。
- **CDN 产物必须静态替换 `process.env.NODE_ENV`。** Vite lib 模式默认不替换（留给宿主打包器），但 IIFE 没有宿主打包器。构建脚本已处理。
- **`customElements.define` 同 tag 重复注册直接抛错。** 桥接层的 `registerElement` 做了两层去重（模块级 Map + `customElements.get()` 兜底），后者是跨 bundle 场景下唯一有效的防线。
- **IIFE 不支持多入口。** 因此 CDN 侧是逐组件构建，不是一次多入口。
