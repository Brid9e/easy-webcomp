# CDN 按工作空间打包 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CDN 产物从「平铺的单组件 + 跨空间 `ew-all.js`」改成「每个工作空间一个目录，目录里一份 `index.js`（该空间全部组件）加各自的单组件文件」，并删掉 `ew-all`。

**Architecture:** `buildCdn` 的外层循环从组件改成空间；空间 index 是一个生成文件的**单入口** IIFE（side-effect import 本空间全部组件的 `index.ts` 并各调一次 `register()`），所以不触碰「IIFE 不支持多入口」那条约束。

**Tech Stack:** TypeScript、Vite 7 lib 模式、Vitest、Playwright。

**设计文档：** `docs/superpowers/specs/2026-09-23-ew-cdn-per-workspace-design.md`

---

### Task 1: 生成文件改成按空间

**Files:**
- Modify: `scripts/build.ts:189-194`

- [ ] **Step 1: 替换跨空间的 `all-define.ts`**

`scripts/build.ts` 里这段（约 189-194 行）：

```ts
  // ew-all 仍是跨空间聚合，全局那一份保留
  const defineLines = components.map(
    (c, i) => `import { register as r${i} } from '${entryPath(c)}'`,
  )
  defineLines.push('', components.map((_, i) => `r${i}()`).join('\n'), '')
  writeFileSync(join(generatedDir, 'all-define.ts'), `${defineLines.join('\n')}\n`)
```

替换为：

```ts
  // 每个空间一份 side-effect 桶，CDN 的 `<空间>/index.js` 拿它当单入口。
  // 跨空间那份（原来的 ew-all）不再生成 —— 把两个空间的运行时揉进同一个 bundle，
  // 等于让一个空间的 vue / element-plus 版本服从另一个空间，正是空间拆分要避免的事。
  for (const workspace of workspacesOf(components)) {
    const mine = components.filter((c) => c.workspace === workspace)
    const lines = mine.map((c, i) => `import { register as r${i} } from '${entryPath(c)}'`)
    lines.push('', mine.map((_, i) => `r${i}()`).join('\n'), '')
    writeFileSync(join(generatedDir, `all-define-${workspace}.ts`), `${lines.join('\n')}\n`)
  }
```

- [ ] **Step 2: 确认 `dist/cdn/ew-all.js` 不再生成**

```bash
pnpm run build:cdn && ls dist/cdn/
```

预期：`ls` 仍列出旧的平铺文件（这一步还没改 `buildCdn`），但**没有新写的 `ew-all.js`** —— 也就是说 `ew-all.js` 是上一次构建留下的旧文件。不用手动删，Task 2 会加清理。

- [ ] **Step 3: 提交**

```bash
git add scripts/build.ts
git commit -m "refactor(build): 生成按空间的 CDN side-effect 桶，去掉跨空间那份"
```

---

### Task 2: `buildCdn` 按空间输出

**Files:**
- Modify: `scripts/build.ts:290-337`

- [ ] **Step 1: 整段替换 `buildCdn`**

把 `scripts/build.ts` 现在的 `async function buildCdn(...)` 整个函数（约 290-337 行）替换为：

```ts
async function buildCdn(components: ComponentInfo[]): Promise<void> {
  // 进函数先把整棵 CDN 树清掉。下面每个空间、每个组件都共用 outDir 且关着 emptyOutDir
  // （关了才对 —— 否则同一空间里后一个构建会把前一个清掉），代价是删掉的组件会留尸。
  // 全量构建时 main() 已经清过 dist，但 --only=cdn 不走那条路，所以这里必须自己清。
  rmSync(join(root, 'dist', 'cdn'), { recursive: true, force: true })

  for (const workspace of workspacesOf(components)) {
    const mine = components.filter((c) => c.workspace === workspace)
    const outDir = `dist/cdn/${workspace}`

    for (const c of mine) {
      await build({
        root,
        configFile: false,
        define: cdnDefine,
        resolve: { alias: vueAlias },
        css: cssConfig,
        plugins: sharedPlugins(),
        build: {
          target: 'es2020',
          outDir,
          emptyOutDir: false,
          minify: 'esbuild',
          lib: {
            entry: join(c.dir, 'define.ts'),
            formats: ['iife'],
            name: toIdentifier(c.name),
            fileName: () => `${c.name}.js`,
            // 同空间内逐组件构建共用 outDir 且 emptyOutDir: false，不按组件名分会互相覆盖
            cssFileName: c.name,
          },
        },
      })
    }

    // 空间入口：单入口 IIFE，import 即本空间全部组件都注册上。
    // 它相对「逐个引单组件文件」的价值就是共享的运行时只内联一份。
    await build({
      root,
      configFile: false,
      define: cdnDefine,
      resolve: { alias: vueAlias },
      css: cssConfig,
      plugins: sharedPlugins(),
      build: {
        target: 'es2020',
        outDir,
        emptyOutDir: false,
        minify: 'esbuild',
        lib: {
          entry: join(generatedDir, `all-define-${workspace}.ts`),
          formats: ['iife'],
          name: `Ew${toIdentifier(workspace)}`,
          fileName: () => 'index.js',
          cssFileName: 'index',
        },
      },
    })
  }
}
```

- [ ] **Step 2: 构建并看产物**

```bash
pnpm run build
find dist/cdn -type f | sort
```

预期：

```
dist/cdn/demo/hello-react.js
dist/cdn/demo/hello-vue.js
dist/cdn/demo/index.js
dist/cdn/self-monitor/index.js
dist/cdn/self-monitor/my-list.css
dist/cdn/self-monitor/my-list.js
```

没有 `ew-all.js`，没有平铺文件。体积（gzip）在构建末尾打印，记下来给 Task 4 用。

- [ ] **Step 3: 顺手改掉 `writeRootExports` 的注释**

`scripts/build.ts` 约 456 行那句：

```ts
 * 各键由 Node 的 exports 解析规则兜底，不需要额外顺序：精确键（`./tokens.css`）优先于
 * pattern，pattern 之间比 `*` 之前那段 base 的长短。`./cdn/ew-all` 落 `./cdn/*`。
```

改成：

```ts
 * 各键由 Node 的 exports 解析规则兜底，不需要额外顺序：精确键（`./tokens.css`）优先于
 * pattern，pattern 之间比 `*` 之前那段 base 的长短。`./cdn/<空间>/<组件>` 落 `./cdn/*`
 * —— subpath pattern 里的 `*` 能跨 `/`，所以多一层目录不用加规则。
```

- [ ] **Step 4: 提交**

```bash
git add scripts/build.ts
git commit -m "feat(build): CDN 按工作空间出目录，index.js 加逐组件文件，删掉 ew-all"
```

---

### Task 3: 产物守卫跟到新路径

**Files:**
- Modify: `scripts/check-artifacts.ts`

- [ ] **Step 1: 加 `statSync` 导入**

第 2 行改成：

```ts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
```

- [ ] **Step 2: 新的 CDN 守卫函数**

在 `function main(): void {` 之前插入：

```ts
/**
 * CDN 产物的框架隔离守卫。两种产物两种规则：
 *
 * - 单组件文件只含自己那个框架，且标记**恰好 1 次**（0 = 自己的没打进去，>1 = 装了两份）
 * - 空间 index 含本空间**真有的**每个框架（至少 1 次），且**不含没有的**框架 ——
 *   demo 两个框架都有、self-monitor 只有 vue，对后者硬要 react 标记会假红
 */
function checkCdn(components: DiscoveredComponent[], failures: string[]): void {
  // 残留守卫：跨空间的 ew-all 与被平铺到 dist/cdn 根下的文件都不该存在了
  for (const entry of readdirSync(cdnDir)) {
    if (!statSync(join(cdnDir, entry)).isDirectory()) {
      failures.push(`dist/cdn/${entry} 不该存在 —— CDN 产物一律落在 dist/cdn/<空间>/ 下`)
    }
  }

  const byWorkspace = new Map<string, DiscoveredComponent[]>()
  for (const c of components) {
    byWorkspace.set(c.workspace, [...(byWorkspace.get(c.workspace) ?? []), c])
  }

  const frameworks = Object.entries(MARKER) as Array<[Framework, string]>

  for (const [workspace, mine] of byWorkspace) {
    const dir = join(cdnDir, workspace)
    if (!existsSync(dir)) {
      failures.push(`缺少 CDN 空间目录 dist/cdn/${workspace}`)
      continue
    }

    for (const c of mine) {
      const rel = `dist/cdn/${workspace}/${c.name}.js`
      const file = join(dir, `${c.name}.js`)
      if (!existsSync(file)) {
        failures.push(`缺少 CDN 产物 ${rel}`)
        continue
      }
      const code = readFileSync(file, 'utf8')
      for (const [fw, marker] of frameworks) {
        const hits = count(code, marker)
        if (fw === c.framework && hits !== 1) {
          failures.push(
            `${rel} 里 ${fw} 标记 ${marker} 出现 ${hits} 次，应为 1 次（0 = 自己的框架没打进去，>1 = 装了两份）`,
          )
        }
        if (fw !== c.framework && hits !== 0) {
          failures.push(`${rel} 是 ${c.framework} 组件，却含 ${fw} 标记 ${marker} ${hits} 次 —— 桶没被摇干净`)
        }
      }
    }

    const rel = `dist/cdn/${workspace}/index.js`
    const file = join(dir, 'index.js')
    if (!existsSync(file)) {
      failures.push(`缺少 CDN 空间入口 ${rel}`)
      continue
    }
    const code = readFileSync(file, 'utf8')
    const present = new Set(mine.map((c) => c.framework))
    for (const [fw, marker] of frameworks) {
      const hits = count(code, marker)
      if (present.has(fw) && hits < 1) {
        failures.push(`${rel} 里找不到 ${fw} 标记 ${marker}，该空间有 ${fw} 组件，它应当在`)
      }
      if (!present.has(fw) && hits !== 0) {
        failures.push(`${rel} 含 ${fw} 标记 ${marker} ${hits} 次，但该空间没有 ${fw} 组件 —— 桶没被摇干净`)
      }
    }
  }
}
```

- [ ] **Step 3: `main()` 里换成调它**

把 `scripts/check-artifacts.ts` 里这段（约 391-422 行，从 `for (const file of readdirSync(cdnDir)...` 到那个 `}` 结束）整段删掉，换成一行：

```ts
  checkCdn(components, failures)
```

放在 `const frameworkOf = ...` 那行**之后**（`frameworkOf` 现在没人用了，一并删掉那行）。改完 `main` 开头是：

```ts
function main(): void {
  const failures: string[] = []
  const components = discoverComponents()

  checkCdn(components, failures)
  checkFramework(components, failures)
  checkPackages(components, failures)
  checkDeclarations(components, failures)
  checkExports(components, failures)
```

- [ ] **Step 4: exports 期望清单改路径**

`checkExports` 里根包那段的期望清单（约 342-348 行）改成：

```ts
  // 根包：ESM 与 framework 都按空间搬走了，只剩 tokens.css / element-plus.css / CDN
  verifySpecs(
    [
      `${PKG}/tokens.css`,
      `${PKG}/element-plus.css`,
      ...components.map((c) => `${PKG}/cdn/${c.workspace}/${c.name}`),
      ...[...new Set(components.map((c) => c.workspace))].map((w) => `${PKG}/cdn/${w}/index`),
    ],
    root,
    failures,
  )
```

- [ ] **Step 5: 守卫必须真能拦住 —— 负向验证**

```bash
pnpm run check:artifacts
```

预期：两行「产物隔离正常」「exports 契约正常」。

然后人为造一个残留并确认它被拦住：

```bash
mkdir -p /tmp/ew-keep && cp dist/cdn/demo/index.js /tmp/ew-keep/ && cp dist/cdn/demo/index.js dist/cdn/ew-all.js
pnpm run check:artifacts
```

预期：报 `dist/cdn/ew-all.js 不该存在`，退出码非 0。

再验 index 的框架规则确实生效 —— 把 index 换成单组件产物（只含 vue），它应报缺 react：

```bash
cp dist/cdn/demo/hello-vue.js dist/cdn/demo/index.js && pnpm run check:artifacts
```

预期：报 `dist/cdn/demo/index.js 里找不到 react 标记 react-dom`。

验完恢复：

```bash
cp /tmp/ew-keep/index.js dist/cdn/demo/index.js && rm dist/cdn/ew-all.js && rm -rf /tmp/ew-keep && pnpm run check:artifacts
```

预期：两行正常。

- [ ] **Step 6: 提交**

```bash
git add scripts/check-artifacts.ts
git commit -m "fix(check:artifacts): CDN 守卫改按空间目录，加 ew-all 与平铺文件的残留守卫"
```

---

### Task 4: e2e 与文档

**Files:**
- Modify: `tests/e2e/fixture/index.html:13-14`
- Modify: `tests/e2e/smoke.spec.ts:119-138`
- Modify: `README.md`
- Modify: `docs/guide/build.md`

- [ ] **Step 1: 改 e2e fixture 的脚本路径**

`tests/e2e/fixture/index.html` 最后两行：

```html
    <script src="/dist/cdn/hello-vue.js"></script>
    <script src="/dist/cdn/hello-react.js"></script>
```

改成：

```html
    <script src="/dist/cdn/demo/hello-vue.js"></script>
    <script src="/dist/cdn/demo/hello-react.js"></script>
```

- [ ] **Step 2: 改去重用例**

`tests/e2e/smoke.spec.ts` 里那条用例（约 119-138 行）整段替换：

```ts
test('单组件产物与空间 index 同时引入不触发重复注册错误', async ({ page }) => {
  // fixture 已引入 hello-vue.js / hello-react.js 两个单组件产物，
  // 这里再引入 demo 的空间 index，它会对同样的 tag 再注册一遍。
  // 注意这是两个独立的 bundle，registry 模块实例不共享 ——
  // 拦住重复注册的必须是 registerElement 里的 customElements.get() 兜底检查。
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.addScriptTag({ url: '/dist/cdn/demo/index.js' })

  expect(errors).toEqual([])

  const upgraded = await page.evaluate(() => {
    const el = document.createElement('ew-hello-vue')
    el.setAttribute('name', 'All')
    document.body.appendChild(el)
    return el.shadowRoot?.textContent?.includes('All') ?? false
  })
  expect(upgraded).toBe(true)
})
```

另加一条，证明 index 自己不依赖单组件文件也能把整个空间注册上（这条是这个设计的核心承诺）：

```ts
test('空间 index 单独引入即注册该空间全部组件', async ({ page }) => {
  await page.goto('about:blank')
  await page.addScriptTag({ url: '/dist/cdn/demo/index.js' })

  const registered = await page.evaluate(() => ({
    vue: Boolean(customElements.get('ew-hello-vue')),
    react: Boolean(customElements.get('ew-hello-react')),
  }))
  expect(registered).toEqual({ vue: true, react: true })
})
```

- [ ] **Step 3: 跑 e2e**

```bash
pnpm run build && pnpm run test:e2e
```

预期：14 条全绿（新增 1 条）。

- [ ] **Step 4: 改 README**

`README.md` 产物表两行（约 106-107 行）：

```
| `dist/cdn/<组件>.js` | CDN 单文件，运行时内联，import 即注册 |
| `dist/cdn/ew-all.js` | CDN 全量单文件 |
```

改成：

```
| `dist/cdn/<空间>/index.js` | CDN 单文件，该空间的全部组件，运行时内联，import 即注册 |
| `dist/cdn/<空间>/<组件>.js` | CDN 单文件，单个组件，运行时内联，import 即注册 |
```

CDN 引入示例（约 121-126 行）里的 `<script src="https://your-cdn/hello-vue.js">` 改成
`https://your-cdn/demo/hello-vue.js`。

「已知约束」里那条：

```
- **IIFE 不支持多入口。** 因此 CDN 侧是逐组件构建，不是一次多入口。
```

改成：

```
- **IIFE 不支持多入口。** 因此 CDN 侧逐组件构建，空间 `index.js` 也是独立的一次单入口构建（它 import 本空间全部组件，不是多入口）。
```

体积基线表按 Task 2 实测的数字重填 —— `ew-all.js` 那行删掉，加 `demo/index.js` 与
`self-monitor/index.js` 两行。

- [ ] **Step 5: 改 build.md**

`docs/guide/build.md`：

1. 产物表（约 14-15 行）两行同步成第 4 步那样。
2. 目录树（约 24-31 行）里的 `cdn/  根包 easy-webcomp：URL 寻址 + ew-all 聚合` 改成
   `cdn/<空间>/  根包 easy-webcomp：URL 寻址，按空间分目录`。
3. 第 35 行那段：`dist/cdn/ 与 dist/element-plus.css 留在根包：CDN 是 URL 寻址的，ew-all.js 按定义就是跨空间聚合；EP 样式是全量的，与空间无关。`
   改成：

```
`dist/cdn/` 与 `dist/element-plus.css` 留在根包：CDN 是 URL 寻址的，按空间分目录就够了，
不需要包管理器的名字；EP 样式是全量的，与空间无关。**没有跨空间的聚合产物** ——
把两个空间的运行时揉进同一个 bundle，等于让一个空间的 vue / element-plus 版本服从另一个。
```

4. 第 37 行「IIFE 每个组件单独构建一次」那段补一句：空间 `index.js` 也是单入口（一个生成文件
   side-effect import 本空间全部组件），不是多入口。
5. 第 87 行讲 CDN 那份 CSS 的段落：路径改成 `dist/cdn/<空间>/<组件>.css`、`dist/cdn/<空间>/index.css`，
   并把「逐组件构建共用 `dist/cdn` 且 `emptyOutDir: false`」改成「同空间内逐组件构建共用
   `dist/cdn/<空间>` 且 `emptyOutDir: false`」。
6. 体积基线表（约 174-183 行）按实测重填，并改写下面那段说明 —— 「CDN 这一栏与拆分前逐字节相同」
   那句话现在不成立了，必须重写。

- [ ] **Step 6: 构建文档站确认**

```bash
pnpm run docs:build
```

预期：绿。

- [ ] **Step 7: 提交**

```bash
git add tests/e2e/fixture/index.html tests/e2e/smoke.spec.ts README.md docs/guide/build.md
git commit -m "docs+e2e: CDN 产物路径跟到空间目录，去掉 ew-all"
```

---

### Task 5: 全量验证

- [ ] **Step 1: 跑 verify**

```bash
pnpm run verify
```

预期：`typecheck` → `test` → `build` → `check:artifacts` → `check:framework` → `docs:build` → `test:e2e` 全绿。

- [ ] **Step 2: 确认旧产物真的没了**

```bash
find dist -name "ew-all*"; ls dist/cdn/*/ 
```

预期：`find` 无输出；`ls` 列出两个空间目录的内容。

---

## 人工验证（交给用户）

1. `pnpm run build`，看 `dist/cdn/` 结构是不是 `demo/`、`self-monitor/` 两个目录。
2. 起一个静态服务指向 `dist/`，或者直接用 `pnpm run test:e2e` 的那台（4173）。用浏览器打开一个只有
   `<script src="/dist/cdn/demo/index.js"></script>` 的页面，`<ew-hello-vue>` 与 `<ew-hello-react>`
   都该能用。
3. 只引 `<script src="/dist/cdn/demo/hello-vue.js"></script>`（不引 index），只有 `ew-hello-vue`
   能用，`document.createElement('ew-hello-react').shadowRoot` 是 null。

## 不做的事

- 不给旧路径留兼容拷贝。
- 不放松组件名的全局唯一性检查（自定义元素 tag 仍然是全局的）。
- 不让单组件文件互相共享运行时。
