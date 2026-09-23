import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cdnDir = join(root, 'dist/cdn')
const PKG = 'easy-webcomp'

/**
 * 桶文件把「Vue 产物里不含 React」从一个结构性事实降级成一条依赖 tree-shaking 的性质。
 * 摇不干净的症状是静默的：产物从 68KB 涨到 290KB，没有任何测试会红。这里把它钉住。
 *
 * 「自家标记恰好 1 次」同时还覆盖了「同一个框架被装了两份」—— 两份就会数到 2。
 *
 * 标记必须**恰好**在一份健康的框架 runtime 里出现 1 次，所以它得是只出现一次的
 * 字面量：vue 侧用 `__isVue`（reactive 的 ownKeys 中间件里那串
 * `"__proto__,__v_isRef,__isVue"`，全量只此一处）。注意不能用 `__v_isRef`——
 * 它是被 isRef/toRef/proxyRefs 等复用的属性名，一份健康的 hello-vue.js 里就有 5 处，
 * 拿它当「恰好 1 次」的标记会对正确产物误报。
 */
const MARKER = { vue: '__isVue', react: 'react-dom' } as const

type Framework = keyof typeof MARKER

/**
 * 与 scripts/build.ts 的 frameworkExternals **故意各写一份**。
 *
 * 下游的第三条契约（checkPackages）拿这张表逐个去产物里找裸导入，而 build.ts 那边是
 * 「解析出所有说明符再取包名」—— 两条路径独立，才能互相验。共用一份的话，解析器漏掉
 * 某种形态时两边一起漏，守卫永远绿。
 */
const FRAMEWORK_EXTERNALS = ['vue', 'react', 'react-dom', 'element-plus', 'pinia']

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

interface DiscoveredComponent {
  name: string
  workspace: string
  framework: Framework
  /** 是否出框架产物。Tailwind 组件只出 WC */
  inFramework: boolean
}

/** 组件清单、框架与归属空间都取自源码目录，而不是文件名约定 —— 与构建脚本同一处事实来源 */
function discoverComponents(): DiscoveredComponent[] {
  const workspacesDir = join(root, 'src/workspaces')
  const found: DiscoveredComponent[] = []

  for (const ws of readdirSync(workspacesDir)) {
    const componentsDir = join(workspacesDir, ws, 'components')
    if (!existsSync(componentsDir)) continue

    for (const name of readdirSync(componentsDir)) {
      const dir = join(componentsDir, name)
      let framework: Framework | undefined
      if (existsSync(join(dir, 'Component.vue'))) framework = 'vue'
      else if (existsSync(join(dir, 'Component.tsx'))) framework = 'react'
      if (framework === undefined) continue

      // 与 build.ts 的 loadFrameworkComponents 同一判据：Tailwind 的 preflight 是全局
      // reset，与 light DOM 下「不影响其他组件」天然冲突，这类组件只出 WC。
      const inFramework = !['style.scss', 'style.css']
        .map((f) => join(dir, f))
        .filter((p) => existsSync(p))
        .some((p) => readFileSync(p, 'utf8').includes('@import "tailwindcss"'))

      found.push({ name, workspace: ws, framework, inFramework })
    }
  }

  return found
}

/**
 * 解析必须交给**原生 node**，不能让 tsx 代劳：tsx 的解析器带扩展名兜底，会把
 * `./*: ./esm/*.jsx` 这类错误映射「补救」成实际存在的 .js 再返回，于是守卫永远绿。
 * 实测同一个错误映射，tsx 下 `import.meta.resolve` 与 `createRequire().resolve` 都返回
 * `<空间>/esm/hello-vue.js`，只有原生 node 如实返回 `.jsx`。消费方跑的正是原生 node / 打包器，
 * 所以以它为准。
 *
 * `cwd` 决定 self-reference 认哪个包：根包的 exports 在仓库根解析，空间包的
 * exports 要在 `dist/<空间>/` 里解析 —— 不换 cwd 的话 `@ew/demo/vue` 根本找不到。
 */
function resolveSpecs(specs: string[], cwd: string): Record<string, string | null> {
  const probe = `
import { fileURLToPath } from 'node:url'
const out = {}
for (const s of ${JSON.stringify(specs)}) {
  try { out[s] = fileURLToPath(import.meta.resolve(s)) } catch { out[s] = null }
}
process.stdout.write(JSON.stringify(out))
`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`[check:artifacts] 解析 exports 的子进程失败：\n${result.stderr}`)
  }
  return JSON.parse(result.stdout) as Record<string, string | null>
}

/**
 * 把 import/export 语句里的说明符抹掉，只留被打进产物的实现代码。
 *
 * 框架产物的判据是「宿主框架的**运行时代码**一个字都不该在」，而不是「框架名一次都不该出现」——
 * 这两件事被 external 拆开了：external 生效时产物里恰好留着一句裸导入，
 * 而 `@ew/runtime` 的 react 适配器（包装层要用它的 EwEmitContext）本身 `import 'react-dom/client'`，
 * Rollup 无法证明外部包无副作用，就把这句以「仅副作用导入」的形式保留了下来。
 * 于是 react-dom 在**健康**产物里也会出现 1 次，按字面量数会直接误报。
 * 抹掉说明符之后，健康产物是 0，真被 external 漏掉的产物仍是非 0。
 */
function stripSpecifiers(code: string): string {
  // 前缀约束 `(?<!["'\w])` 不能省：只写 `\b(?:from|import)\s*["']` 会在字符串字面量内部
  // 误命中 —— axios 的禁用请求头清单里 `"from",\n  "host"` 会匹配成 `from ",\n  "`。
  // 这里是「抹掉」，误命中不会反推出垃圾包名，但会把不该动的文本吃掉，标记计数就可能漏。
  // workspace-packages.ts 的 bareSpecifiersOf 用同一条前缀约束，两处必须同步。
  return code.replace(/(?<!["'\w])(?:from|import)\s*["'][^"'\s]*["']/g, '')
}

/**
 * 框架产物的守卫，按空间各查一遍。
 *
 * **运行时检查扫整个目录，不是只扫入口。** external 失效时框架代码落到哪由 Rollup
 * 决定：单入口就落在那个入口里，两个入口都用得上时会被提成共享 chunk。只看 vue.js /
 * react.js 会在后一种情况下漏判。（实测过：往其中一个入口塞一句对手框架的引用，
 * Rollup 会新开一个 chunk 承接，入口文件本身干干净净。）
 *
 * 判据是「剥掉说明符后标记字面量为 0」（见 stripSpecifiers）：external 生效时产物里
 * 恰恰留着一句裸导入，那个形态是健康的，按字面量数会误报。
 *
 * 「该有的必须有、不该有的不许有」两个方向都查：少一个 `framework/vue.js` 说明
 * buildFramework 漏了该空间；多一个 `framework/react.js` 说明框架桶没按空间过滤干净，
 * 而那个空模块会让「裸导入必须在」这条检查失效。
 *
 * **不覆盖的事：** 包装层误引了对面适配器（`@ew/runtime` 的桶两个适配器都导出）只会多出
 * 一句对面的裸导入、外加几 KB 代码，不产生运行时代码，这里拦不住 —— 它是体积问题不是
 * 正确性问题，由 docs/guide/build.md 的体积基线人眼比对。
 */
function checkFramework(components: DiscoveredComponent[], failures: string[]): void {
  for (const workspace of [...new Set(components.map((c) => c.workspace))].sort()) {
    const dir = join(root, 'dist', workspace, 'framework')
    const mine = components.filter((c) => c.workspace === workspace)

    for (const [framework, marker] of [
      ['vue', '__isVue'],
      ['react', 'react-dom'],
    ] as const) {
      const entry = join(dir, `${framework}.js`)
      const expected = mine.some((c) => c.inFramework && c.framework === framework)

      if (!existsSync(entry)) {
        if (expected) failures.push(`缺少框架产物 dist/${workspace}/framework/${framework}.js`)
        continue
      }
      if (!expected) {
        failures.push(
          `dist/${workspace}/framework/${framework}.js 存在，但该空间没有 ${framework} 组件 —— 桶没按空间过滤`,
        )
        continue
      }

      // 裸导入必须在：它是 external 生效的证据
      const code = readFileSync(entry, 'utf8')
      if (!new RegExp(`from\\s*["']${framework}["']`).test(code)) {
        failures.push(
          `dist/${workspace}/framework/${framework}.js 里没有对 ${framework} 的裸导入，external 没生效`,
        )
      }

      // 运行时代码一个文件里都不该有（含共享 chunk）
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
        const hits = count(stripSpecifiers(readFileSync(join(dir, file), 'utf8')), marker)
        if (hits !== 0) {
          failures.push(
            `dist/${workspace}/framework/${file} 里出现 ${marker} ${hits} 次，框架运行时不该被打进产物`,
          )
        }
      }
    }
  }

  if (!existsSync(join(root, 'dist/element-plus.css'))) {
    failures.push('缺少 dist/element-plus.css')
  }
}

/**
 * 第三条契约：空间包存在，且框架产物里的裸导入都在它的 package.json 里声明过。
 *
 * build.ts 那里是「解析出所有说明符再取包名」（workspace-packages.ts 的
 * bareSpecifiersOf），这里反过来「拿 FRAMEWORK_EXTERNALS 这张已知的表逐个去产物里找」。
 * 两条路径不共用代码是有意的：共用一份解析器的话，解析器漏掉某种形态（比如仅副作用
 * 导入 `import "x"`）时两边会一起漏，守卫永远绿。
 *
 * 只查「用了没声明」这一个方向。声明了却没用上只是多装一个 peer，不破坏消费方，
 * 不值得为它引入误报风险。
 */
function checkPackages(components: DiscoveredComponent[], failures: string[]): void {
  for (const workspace of [...new Set(components.map((c) => c.workspace))].sort()) {
    const dir = join(root, 'dist', workspace)
    const pkgPath = join(dir, 'package.json')
    if (!existsSync(pkgPath)) {
      failures.push(`缺少空间包 dist/${workspace}/package.json`)
      continue
    }

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      name?: string
      peerDependencies?: Record<string, string>
    }
    const expectedName = `@ew/${workspace}`
    if (pkg.name !== expectedName) {
      failures.push(`dist/${workspace}/package.json 的 name 是 "${pkg.name}"，应为 "${expectedName}"`)
    }

    const frameworkDir = join(dir, 'framework')
    if (!existsSync(frameworkDir)) continue

    const declared = new Set(Object.keys(pkg.peerDependencies ?? {}))
    const files = readdirSync(frameworkDir).filter((f) => f.endsWith('.js'))

    for (const name of FRAMEWORK_EXTERNALS) {
      const pattern = new RegExp(`(?:from|import)\\s*["']${name}(?:/[^"']*)?["']`)
      const used = files.some((file) => pattern.test(readFileSync(join(frameworkDir, file), 'utf8')))
      if (used && !declared.has(name)) {
        failures.push(
          `dist/${workspace}/framework 里引了 "${name}"，但 dist/${workspace}/package.json 没声明`,
        )
      }
    }
  }
}

/**
 * 第四条契约：空间包的每条 exports 都要有声明文件，否则消费方拿到的是隐式 any。
 *
 * 只能对着**产物**查：`.d.ts` 是 build.ts 现写的，写没写、写在哪，源码里没有任何痕迹 ——
 * 少写一个 `.d.ts` 时构建、测试、e2e 全绿，只有别人装包时 tsconfig 里冒出 TS7016。
 *
 * `./*` 是 pattern，没法直接验目标存在，所以按源码目录里的组件清单逐个推期望路径。
 * `@ew/<空间>/<组件>/define` 不在期望里：它只被 `import '...'` 那种纯副作用引法用，
 * TS 对没有绑定的模块不要求声明。真为它写一个 `export {}` 是无人消费的死文件。
 *
 * 唯一不要求 types 的是 `./styles.css`：CSS 没有声明文件。它存在与否本身也是产物事实，
 * 所以这一条顺带管了反方向 —— 产物里有 styles.css 就必须导出它。
 *
 * 只查「该有的在不在」，不查声明内容对不对 —— 内容由
 * tests/integration/consumer-types.test.ts 真跑一次 tsc 兜住。
 */
function checkDeclarations(components: DiscoveredComponent[], failures: string[]): void {
  for (const workspace of [...new Set(components.map((c) => c.workspace))].sort()) {
    const dir = join(root, 'dist', workspace)
    const mine = components.filter((c) => c.workspace === workspace)

    const expected = [
      'esm/index.d.ts',
      ...mine.map((c) => `esm/${c.name}.d.ts`),
      ...(['vue', 'react'] as const)
        .filter((framework) => mine.some((c) => c.inFramework && c.framework === framework))
        .map((framework) => `framework/${framework}.d.ts`),
    ]
    for (const rel of expected) {
      if (!existsSync(join(dir, rel))) failures.push(`缺少声明文件 dist/${workspace}/${rel}`)
    }

    const pkgPath = join(dir, 'package.json')
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      types?: string
      exports?: Record<string, string | { types?: string; default?: string }>
    }

    if (typeof pkg.types !== 'string') {
      failures.push(`dist/${workspace}/package.json 缺 types 字段`)
    } else if (!existsSync(join(dir, pkg.types))) {
      failures.push(`dist/${workspace}/package.json 的 types 指向 ${pkg.types}，但该文件不存在`)
    }

    for (const [key, target] of Object.entries(pkg.exports ?? {})) {
      // CSS 入口没有声明文件，豁免 types 那条；但目标文件必须在 —— 构建漏了一次抽取、
      // 或 dist 是旧的，消费方引到的就是一个不存在的路径。
      if (key.endsWith('.css')) {
        if (typeof target === 'string' && !existsSync(join(dir, target))) {
          failures.push(
            `dist/${workspace}/package.json 的 exports["${key}"] 指向 ${target}，但该文件不存在`,
          )
        }
        continue
      }
      const types = typeof target === 'string' ? undefined : target.types
      if (types === undefined) {
        failures.push(`dist/${workspace}/package.json 的 exports["${key}"] 没有 types 条件`)
      } else if (!types.includes('*') && !existsSync(join(dir, types))) {
        failures.push(
          `dist/${workspace}/package.json 的 exports["${key}"] 指向 ${types}，但该文件不存在`,
        )
      }
    }

    // 反方向：产物里真有样式表就必须导出。少了这条，组件里加的 <style> 块会静默地
    // 只落在 dist 里 —— 构建、测试、e2e 全绿，消费方却拿不到那份样式。
    if (
      existsSync(join(dir, 'styles.css')) &&
      !Object.keys(pkg.exports ?? {}).includes('./styles.css')
    ) {
      failures.push(
        `dist/${workspace}/styles.css 存在，但 package.json 的 exports 里没有 "./styles.css"`,
      )
    }

    // 样式表只该在空间根上有一份（build.ts 的 hoistCss）。Vite 本来会让它跟着模块图
    // 落到每个构建目录里，留在那儿说明 hoistCss 没跑或被人改回去了：消费方看到的是
    // 两份同内容文件里没被导出的那一份。
    for (const stray of ['esm/styles.css', 'framework/styles.css']) {
      if (existsSync(join(dir, stray))) {
        failures.push(`dist/${workspace}/${stray} 不该存在 —— 样式表只保留空间根上那一份`)
      }
    }
  }
}

/**
 * 第二条契约：每个包的 exports 子路径必须真能解析到文件。
 *
 * 组件子路径由 pattern（`./*`）覆盖而不是逐条列举 —— 好处是 package.json
 * 不再随组件增减而变动，代价是它对「有哪些组件」一无所知，写错一个字符不会有任何测试红，
 * 要等消费方 import 时才炸。所以在这里按源码目录里的组件清单逐个走一遍。
 *
 * 交给真实解析而不是自己按 pattern 拼路径：Node 的精确键优先于 pattern、pattern 之间
 * 按 base 长度取长的规则，自己实现一遍就容易错。解析只做映射、不 stat 文件，所以结果
 * 还要 existsSync 一次。
 *
 * `./vue` / `./react` 只在空间真有该框架组件时才该存在（build.ts 的框架桶按空间过滤），
 * 所以期望清单也得跟着条件生成 —— 无条件要 `@ew/self-monitor/react` 会假红。
 */
function checkExports(components: DiscoveredComponent[], failures: string[]): void {
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

  const byWorkspace = new Map<string, DiscoveredComponent[]>()
  for (const c of components) {
    byWorkspace.set(c.workspace, [...(byWorkspace.get(c.workspace) ?? []), c])
  }

  for (const [workspace, mine] of byWorkspace) {
    const specs = [
      `@ew/${workspace}`,
      ...mine.flatMap((c) => [`@ew/${workspace}/${c.name}`, `@ew/${workspace}/${c.name}/define`]),
      ...(['vue', 'react'] as const)
        .filter((framework) => mine.some((c) => c.inFramework && c.framework === framework))
        .map((framework) => `@ew/${workspace}/${framework}`),
      // 有条件才有：没组件写 <style> 块的空间根本不产这个文件
      ...(existsSync(join(root, 'dist', workspace, 'styles.css'))
        ? [`@ew/${workspace}/styles.css`]
        : []),
    ]
    verifySpecs(specs, join(root, 'dist', workspace), failures)
  }
}

function verifySpecs(specs: string[], cwd: string, failures: string[]): void {
  const resolved = resolveSpecs(specs, cwd)
  for (const spec of specs) {
    const target = resolved[spec]
    if (target === null) {
      failures.push(`exports 里 ${spec} 没有匹配的键`)
    } else if (!existsSync(target)) {
      failures.push(`exports 里 ${spec} 解析到 ${relative(root, target)}，但该文件不存在`)
    }
  }
}

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

function main(): void {
  const failures: string[] = []
  const components = discoverComponents()

  checkCdn(components, failures)
  checkFramework(components, failures)
  checkPackages(components, failures)
  checkDeclarations(components, failures)
  checkExports(components, failures)

  if (failures.length > 0) {
    console.error('[check:artifacts] 守卫未通过：')
    for (const line of failures) console.error(`  - ${line}`)
    process.exit(1)
  }

  console.log('[check:artifacts] 产物隔离正常')
  console.log('[check:artifacts] exports 契约正常')
}

main()
