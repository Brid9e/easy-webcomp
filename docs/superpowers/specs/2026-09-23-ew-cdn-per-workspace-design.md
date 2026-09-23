# CDN 产物按工作空间打包

## 背景

现在 CDN 侧是一堆平铺的单组件文件加一个跨空间的 `ew-all.js`：

```
dist/cdn/
├── hello-vue.js
├── hello-react.js
├── my-list.js
└── ew-all.js        ← 全仓库聚合
```

两个问题：

1. **`ew-all.js` 把跨空间的 runtime 揉进同一个 bundle。** 它等于让空间 A 的组件服从空间 B 的
   依赖版本 —— 空间拆分（`@ew/demo`、`@ew/self-monitor` 各自一个包）要避免的正是这件事，
   结果 CDN 侧又把它加回来了。一个空间升级 vue，另一个空间被动跟着走。
2. **用「一个空间的全部组件」没有合适的入口。** 只想用 demo 空间的两个组件，要么引两次单组件
   文件（runtime 各内联一份），要么引 `ew-all.js` 把 self-monitor 那 390 KB 也拖下来。

## 目标结构

```
dist/cdn/
├── demo/
│   ├── index.js          # demo 空间全部组件，import 即全部注册
│   ├── hello-vue.js      # 单组件
│   └── hello-react.js
└── self-monitor/
    ├── index.js
    ├── my-list.js
    └── my-list.css       # 有 <style> 块才出，没有就不存在
```

`ew-all.js` 与 `ew-all.css` 不再产出。

## 为什么 index.js 不违反「IIFE 不支持多入口」

那条约束说的是 **lib.entry 不能是对象**（多入口），逐组件构建正是为了绕开它。
空间 index 是**单入口** —— 一个生成文件 side-effect import 本空间全部组件的 `index.ts`，
每个都调一遍 `register()`。它跟 `ew-all` 是同一种东西，只是范围收在一个空间里。

## 构建

`scripts/build.ts`：

- 生成文件从一份 `all-define.ts`（跨空间）改成每空间一份 `all-define-<空间>.ts`。
  ESM 用的 `all-<空间>.ts`（`export * as X` 命名空间桶）不动 —— 那个不带副作用，是给
  `@ew/<空间>` 的 `.` 入口用的。
- `buildCdn` 外层循环从「每个组件」改成「每个空间」：空间内先逐组件构建，最后再构建一份 index。
- 每个空间一个 outDir（`dist/cdn/<空间>`），仍然 `emptyOutDir: false` —— 同一空间里后一个
  组件构建不能把前一个清掉。
- **进函数先 `rmSync` 整棵 `dist/cdn`。** 现在逐组件构建共用目录且都关着 `emptyOutDir`，
  删掉一个组件后它的 `.js` 会永远留在产物里。之前靠全量构建时 `rmSync(dist)` 兜着，
  但 `--only=cdn` 下那条路不走。
- IIFE 的全局名：单组件用 `toIdentifier(组件名)`（不变），空间 index 用
  `Ew${toIdentifier(空间名)}`（对齐原来的 `EwAll`）。

## 守卫

`scripts/check-artifacts.ts`：

| 对象 | 规则 |
|---|---|
| `<空间>/<组件>.js` | 自己那个框架的标记恰好 1 次，另一个框架 0 次（与今天一致，路径多一层） |
| `<空间>/index.js` | 该空间**真有的**每个框架标记 ≥1 次；**没有的**框架必须 0 次 |
| `dist/cdn/ew-all.js`、`dist/cdn/*.js` | 不得存在（残留守卫） |

第二条不同于 `ew-all` 的「两个框架都必须有」：`demo` 两个框架都有，`self-monitor` 只有 vue，
硬要 react 会假红。

exports 那条契约（`checkExports`）的期望清单跟着改：`${PKG}/cdn/${组件}` 变成
`${PKG}/cdn/${空间}/${组件}`，`${PKG}/cdn/ew-all` 变成每空间一个 `${PKG}/cdn/${空间}/index`。

根包 `exports` 的 `"./cdn/*": "./dist/cdn/*.js"` **一个字符都不用改** —— Node 的 subpath
pattern 里 `*` 能跨 `/`（实测：`probe/cdn/demo/hello-vue` 正确解析到
`dist/cdn/demo/hello-vue.js`）。

## 破坏性变更

`dist/cdn/hello-vue.js` → `dist/cdn/demo/hello-vue.js`。任何写死旧 URL 的 `<script src>` 会 404。

不做兼容层（不额外拷一份平铺的旧路径）：`ew-all.js` 本来就要删，这个版本对 CDN 使用者已经是
破坏性的，留一条半死的旧路径只会让「到底该引哪个」变得模糊。CDN 那栏的路径在 README 与
build.md 里都是显式列出来的，跟着改。

## 不做的事

- **不放松组件名的全局唯一性检查。** 文件名进了空间目录之后，理论上不同空间可以重名了，
  但自定义元素的 **tag 仍然全局唯一**（`customElements` 注册表是全局的），所以重名照样撞，
  检查留着。
- **不让单组件文件互相共享 runtime。** 每个 IIFE 自包含 —— 这是「单文件可拷走」的前提，
  也是空间 index 存在的理由（要共享 runtime 就引 index）。
