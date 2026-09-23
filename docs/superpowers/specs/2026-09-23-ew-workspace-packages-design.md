# easy-webcomp 按工作空间出包设计文档

## 1. 一句话定义

把 `dist/` 按工作空间切成若干**独立的包**：`@ew/demo`、`@ew/self-monitor`，各自带一份自陈依赖的 `package.json`，各自导出本空间的框架产物与 ESM 产物；根包 `easywebcomp` 收缩成「不分空间的那一半」（`tokens.css` + `element-plus.css` + CDN）。

## 2. 背景与动机

### 2.1 现状：空间只是源码目录，不是包边界

`src/workspaces/<空间>/components/<组件>/` 已经是文件的组织单位，但 `dist/` 里没有这层边界：

- `dist/framework/vue.js` 是**全仓库的桶**，`Component.vue` 写的组件无论属于哪个空间都塞在同一个模块里。
- 于是 `demo` 的 `HelloVue` 和 `self-monitor` 的 `MyList` 同处一室，而后者静态引了 `element-plus`、`pinia`、`element-plus/es/locale/lang/zh-cn`。
- 框架产物把这些当 external（`scripts/build.ts:308` 的 `frameworkExternals`），意味着**宿主的打包器必须解析得到 element-plus**。宿主只想要 `HelloVue`，却被迫能解析 `element-plus`，且一旦解析成功它的代码就会跟着进包。
- `dist/esm/` 同理：各组件虽然是一组件一文件，但桶 `dist/esm/index.js` 把三个空间的产物全拉上，`my-list` 那份 1.2 MB 的 chunk 也在其中。

### 2.2 用户诉求（2026-09-23）

> 我们能不能做到按工作空间打包 比如 @ew/self-monitor @ew/demo 这种 打完包 dist下按照工作空间划分包 每个包是一个带有package.json的包

### 2.3 已确认的两个取舍

| 取舍点 | 结论 |
|---|---|
| 包的身份 | **真·独立包**。每个空间一个 `@ew/<空间>`，各自 `package.json` 自陈依赖，而不是单包多入口（`easywebcomp/demo/vue`） |
| 拆分范围 | **framework + ESM**。CDN 不拆——它是 URL 寻址的，且 `ew-all.js` 按定义就是跨空间聚合 |

### 2.4 为什么 CDN 不拆

CDN 产物的消费方式是 `<script src="...">`，路径本身就是接口（`tests/e2e/fixture/index.html:13` 直接写 `/dist/cdn/hello-vue.js`）。`ew-all.js` 更是「一次引全部」的聚合产物，没有哪个空间是它的自然归属。把它挪进空间目录只会让路径变深、让既有测试与文档一起改，换不到任何东西。

## 3. 产物布局

```
dist/
├── cdn/                    ← 根包 easywebcomp（不动）
│   └── hello-vue.js  hello-react.js  my-list.js  ew-all.js
├── element-plus.css        ← 根包（从 dist/framework/ 提到根）
├── demo/                   ← @ew/demo
│   ├── package.json
│   ├── esm/                hello-vue.js  hello-react.js  index.js  <chunks>
│   └── framework/          vue.js  react.js  <chunks>
└── self-monitor/           ← @ew/self-monitor
    ├── package.json
    ├── esm/
    └── framework/          vue.js          ← 无 .tsx 组件，故不生成 react.js
```

`dist/esm/` 与 `dist/framework/` 两个目录整体消失。

根包的 `exports` 收缩为三条（`. / ./vue ./react 旧的 ./element-plus.css / ./*` 五个键删除）：

```json
{
  "./tokens.css": "./src/tokens/tokens.css",
  "./element-plus.css": "./dist/element-plus.css",
  "./cdn/*": "./dist/cdn/*.js"
}
```

**不保留聚合的 `easywebcomp/vue` / `easywebcomp/react`。** 它正是这次要消灭的那个桶；保留等于把「引 HelloVue 拖 element-plus」原封不动留在原地，还要多跑一遍构建。要哪个空间就装哪个包，没有第二条路径。

## 4. 包的身份

`dist/<空间>/package.json`，构建生成：

```json
{
  "name": "@ew/demo",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./esm/index.js",
    "./vue": "./framework/vue.js",
    "./react": "./framework/react.js",
    "./*": "./esm/*.js"
  },
  "peerDependencies": { "vue": "^3.5.0", "react": "^19.0.0", "react-dom": "^19.0.0" },
  "peerDependenciesMeta": {
    "vue": { "optional": true },
    "react": { "optional": true },
    "react-dom": { "optional": true }
  }
}
```

（上面是 `@ew/demo` 的实际形态。`@ew/self-monitor` 的 peerDependencies 是 `vue` / `element-plus` / `pinia`，同样三条全标 `optional`。）

- **name** 取 `@ew/<空间目录名>`。与既有的 `@ew/runtime`、`@ew/utils` 同一个 scope，语义一致。
- **version** 继承根包版本，锁步。一次构建内所有空间包同版本，不引入多版本矩阵。
- **private** 继承根包的值。
- **`./vue` / `./react` 条件生成**：只有该空间真有该框架的组件时才出这个键。`self-monitor` 没有 `Component.tsx`，出一个空的 `framework/react.js` 会让守卫误报「external 没生效」（空模块里没有 `import "react"`）。
- `./*` → `./esm/*.js` 沿用根包今天的口径，`*` 跨 `/`，所以 `<组件>/define` 天然被覆盖，键不随组件增减而变动。
- 这些 `package.json` 落在 `dist/` 下，**被 `.gitignore` 忽略，不入库**。根 `package.json` 仍是提交的，构建只重写它的 `exports` 字段——与今天 `writeExportsField()` 的做法一致。

## 5. 依赖声明：从产物反推

**不手写空间包的依赖表**，而是扫 `dist/<空间>/framework/*.js` 里的裸说明符反推：

1. 抓 `from "x"` 与 `import "x"` 两种形态；
2. 取包名——scoped 取前两段（`@scope/name`），非 scoped 取首段（`react-dom/client` → `react-dom`）；
3. 与 `frameworkExternals` 求交（产物里的裸说明符理论上必然来自这张表，求交是防御）；
4. 版本从根 `package.json` 的 `peerDependencies` ⊕ `dependencies` 里取。

于是 `@ew/demo` 拿到 `vue` / `react` / `react-dom`，`@ew/self-monitor` 拿到 `vue` / `element-plus` / `pinia`。这不是「猜」，产物里那句 `import ... from "element-plus"` 就是证据。

**为什么是 peerDependencies 而不是 dependencies：** `frameworkExternals` 这张表的判据就是「宿主必须带同一份实例」（见 `scripts/build.ts:300-307` 的注释）。两份 Vue 的 `provide`/`inject` 对不上，两份 pinia 是两个 active store，两份 EP 的 `ElConfigProvider` 与主题配置够不到组件里那一份。声明成 dependency 会让包管理器自动装第二份，正好制造该表要防的事故。一律标 `optional`——Vue 项目不该因为没装 React 而告警。

**`axios` 不在表里**，它被故意打进产物（组件自己的取数依赖，宿主没有也不该被要求装），因此也不出现在任何包声明里。

**ESM 那一半不产生依赖声明。** 它自带整套框架运行时（`dist/esm/hello-vue.js` 今天就 import 了 `vue-B8EUc_1_.js`），这是 Web Component「黑盒自洽」的既定口径，跟宿主装没装 Vue 无关。

## 6. 构建管线改动

`scripts/build.ts`：

- **`buildEsm`** 从「一次构建出 `dist/esm`」改成按空间循环，`outDir: dist/<空间>/esm`，`emptyOutDir: true`。每个空间的 entry 只有本空间的组件：`index`（本空间的桶）+ 每组件 `<name>` 与 `<name>/define`。
- **`buildFramework`** 同样按空间循环，`outDir: dist/<空间>/framework`。entry 只放该空间真有组件的框架，故需先算出「该空间有 vue 吗 / 有 react 吗」。
- **`buildCdn`** 一行不动。
- **生成入口**：新增 `src/.generated/all-<空间>.ts` 与 `src/.generated/framework/index-<空间>-{vue,react}.ts`。全局的 `all-define.ts` **保留**——`ew-all.js` 是跨空间聚合，仍归 CDN。
- **`writeElementPlusCss()`** 写到 `dist/element-plus.css` 而不是 `dist/framework/element-plus.css`。
- **`writeExportsField()`** 扩成 `writePackages()`：重写根 `package.json` 的 `exports`，再写每个空间的 `package.json`。**只给真有组件的空间出包**——`discoverComponents()` 会跳过没有 `components/` 目录的空间，一个空目录不该换回一个空包。
- `--only=esm|cdn|framework` 语义不变，仍是「只跑这一类」。但空间包的依赖要从 framework 产物反推，`--only` 时产物不全，所以那一步（`writeWorkspacePackages`）只在全量构建时跑；根 exports 不需要任何产物，照旧每次都写 —— 与拆分前 `writeExportsField` 的行为一致。
- `reportSizes()` 递归扫 `dist/`，天然覆盖新路径，不用改。

`element-plus.css` 归根包的理由：它是 EP 的**全量**样式（361 KB），与空间无关。放进某个空间是错位（否则将来第二个空间用 EP 时要么复制两份、要么再抽一个包），留根包则消费方多引一行。等真被两个以上空间用到时再抽 `@ew/element-plus.css` 独立包，那时才有依据。

## 7. 守卫改动

`scripts/check-artifacts.ts` 的两条契约都从「一个包」改成「每个包」，`element-plus.css` 的存在性检查也跟着从 `dist/framework/element-plus.css` 挪到 `dist/element-plus.css`。

**`checkFramework`**：对每个空间、每个该空间真有组件的框架，校验 `dist/<空间>/framework/<框架>.js` 存在、且含对框架的裸导入（external 生效的证据）；再扫该目录**全部** `.js`（含 Rollup 提上来的共享 chunk），要求剥离说明符后标记字面量为 0。扫描范围与判据都不变，只是目录从一个变成 N 个。

**`checkExports`**：按包各起一次解析子进程。探针的 `cwd` 设成**包目录**——Node 的 self-reference 只在引用方位于包内时生效，现在正是靠 `cwd=root` 认 `easywebcomp/vue`，换成 `cwd=dist/demo` 才认 `@ew/demo/vue`。根包照旧用 root。

**新增第三条契约：产物里的裸导入必须有对应声明。** 第 5 节的推导如果写错（正则漏了 `import "x"` 这种仅副作用形态、包名截取出错），产物能跑但包声明是错的，没有任何测试会红。所以守卫独立地再读一遍产物、再读一遍写出来的 `package.json`，两边对不上就报错。这条不能省——推导与校验来自同一份代码就是自证，必须由守卫重新验。

## 8. 测试与文档的路径改动

| 文件 | 改动 |
|---|---|
| `tests/integration/framework.test.ts:5-6` | `../../dist/framework/{vue,react}.js` → `../../dist/demo/framework/{vue,react}.js`（两个组件都是 demo 的） |
| `tests/e2e/fixture/framework.html:23` | `/dist/framework/vue.js` → `/dist/demo/framework/vue.js` |
| `vitest.integration.config.ts:7`、`playwright.config.ts:35` | 注释里的路径说法 |
| `docs/guide/build.md` | 路径表、体积基线表、框架产物一节的 import 行 |
| `docs/guide/framework-usage.md` | 两个 import 块 + 样式来源表 |
| `docs/workspaces/demo/hello-{vue,react}.md:21` | `easy-webcomp/<组件>/define` → `@ew/demo/<组件>/define` |
| `README.md` | 路径表、exports 那段说明、示例 import |
| `playwright.config.ts` 的 webServer | **不动**——root 仍指向仓库根，fixture 路径没变，只是 fixture 内容里的 import 变了 |

CDN 相关的 `tests/e2e/fixture/index.html`、`smoke.spec.ts:127` **不动**。

`docs/.vitepress/workspaces.ts` 与 `devtools/shared/wc-mode.ts` 都扫 `src/workspaces/<空间>/components`，与 `dist/` 布局无关，**不动**。

## 9. 已知代价与硬约束

- **ESM 自带的框架运行时从「全仓库共享一份」变成「每包一份」。** 今天 `dist/esm/` 里 `vue-B8EUc_1_.js`（185 KB）被 `hello-vue` 与 `my-list` 共用；拆开后 demo 与 self-monitor 各带一份。同时装两个包时 Vue 从一份变两份（各约 60 KB gzip）。这是 WC 自洽换取来的，与 CDN 每个文件各带一份是同一笔账，不打算优化。
- **框架产物的体积含义变了。** `demo/framework/vue.js` 只剩 `hello-vue`，`self-monitor/framework/vue.js` 只剩 `my-list`（仍引 EP / pinia）。`docs/guide/build.md` 的体积基线必须重测后重写，否则基线失去意义。
- **组件名全局唯一仍是硬约束。** `scripts/build.ts:57-64` 那条构建期报错一个字不改——拆包之后两个包定义同一个 tag 是**运行期**炸（`customElements.define` 抛错），比现在更晚、更难查，所以这条检查更不能松。
- **根包 `files: ["dist", ...]` 会把嵌套的空间 `package.json` 一起发出去。** 目前 `private: true`、无任何发布动作，不处理；真发布时再决定是排除还是就让它们跟着走。

## 10. 不做的事

- 不动 CDN 产物路径，不动 `ew-all.js`。
- 不做空间之间的样式共享（`styles/index.scss` 仍只服务本空间）。
- 不给空间包做独立版本号，一律锁步继承根包。
- 不把 `@ew/runtime` / `@ew/utils` 变成空间包的依赖——它们被 inline 进产物，消费方不需要。
- 不设计发布流程（私有 registry / `file:` 安装 / 版本发布顺序），留到真发的时候定。
