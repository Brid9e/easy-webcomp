import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { gzipSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { compile } from 'sass'
import { build } from 'vite'
import type { ComponentMeta } from '@ew/runtime'
import { toIdentifier } from '@ew/utils'
import {
  barrelDeclarationSource,
  configDeclarationSource,
  frameworkDeclarationSource,
  wcDeclarationSource,
} from './declarations.ts'
import {
  barrelSource,
  reactWrapperSource,
  vueWrapperSource,
  type FrameworkComponent,
} from './framework-entries.ts'
import { findPrefixViolations } from './style-prefix.ts'
import { bareSpecifiersOf, workspacePackageJson } from './workspace-packages.ts'
import { usesTailwind } from './tailwind.ts'
import { workspaceIdsOf } from './workspaces.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspacesDir = join(root, 'packages/workspaces')
const generatedDir = join(root, 'src/.generated')

interface ComponentInfo {
  name: string
  workspace: string
  dir: string
  framework: 'vue' | 'react'
  /** 样式文件名，两种后缀都由构建期探测，别处不再各自猜一遍 */
  styleFile: string
}

function discoverComponents(): ComponentInfo[] {
  const seen = new Map<string, string>()
  const components: ComponentInfo[] = []

  for (const workspace of workspaceIdsOf(workspacesDir)) {
    const componentsDir = join(workspacesDir, workspace, 'components')
    if (!existsSync(componentsDir)) continue

    for (const name of readdirSync(componentsDir)) {
      const dir = join(componentsDir, name)
      if (!statSync(dir).isDirectory()) continue

      // tag 与 package exports 都不带空间前缀，重名会静默覆盖 exports 键
      const owner = seen.get(name)
      if (owner) {
        throw new Error(
          `[build] 组件名 "${name}" 在 "${owner}" 与 "${workspace}" 下重复。` +
            'tag 与 package exports 都不带空间前缀，组件名必须全局唯一',
        )
      }
      seen.set(name, workspace)

      const hasVue = existsSync(join(dir, 'Component.vue'))
      const hasReact = existsSync(join(dir, 'Component.tsx'))
      if (hasVue === hasReact) {
        throw new Error(
          `[build] ${name} 必须且只能有一个 Component.vue 或 Component.tsx（当前 vue=${hasVue} react=${hasReact}）`,
        )
      }
      for (const required of ['meta.ts', 'index.ts', 'define.ts']) {
        if (!existsSync(join(dir, required))) {
          throw new Error(`[build] ${name} 缺少 ${required}`)
        }
      }

      const styleFiles = ['style.scss', 'style.css'].filter((f) => existsSync(join(dir, f)))
      if (styleFiles.length !== 1) {
        throw new Error(
          `[build] ${name} 必须且只能有一个 style.scss 或 style.css（当前 ${styleFiles.length} 个）`,
        )
      }
      const styleFile = styleFiles[0] as string

      components.push({ name, workspace, dir, framework: hasVue ? 'vue' : 'react', styleFile })
    }
  }

  return components.sort((a, b) => a.name.localeCompare(b.name))
}

/** 组件/产物列表里出现过的空间名，排序后返回 —— 构建按它循环 */
function workspacesOf(items: ReadonlyArray<{ workspace: string }>): string[] {
  return [...new Set(items.map((item) => item.workspace))].sort()
}

/**
 * 组件样式的类名必须落在自己的命名空间里，否则落到 light DOM 就会互相覆盖。
 * 拦在构建里而不是写进文档，理由见 scripts/style-prefix.ts。
 */
function checkStylePrefixes(components: ComponentInfo[]): void {
  const failures: string[] = []

  for (const c of components) {
    const path = join(c.dir, c.styleFile)
    const source = readFileSync(path, 'utf8')
    // Tailwind 的 preflight 是一份全局 reset，与「不影响其他组件」在 light DOM 下天然
    // 冲突，它的类名也无法用前缀约束。跳过。
    if (usesTailwind(source)) continue

    // compile 是 sass 的现代 API，只认 loadPaths。上面 cssConfig 多写的 includePaths 是给
    // VitePress 内嵌的 Vite 5（旧 API）用的，那条管线不跑这个检查，所以这里对齐根构建即可。
    const { css } = compile(path, { loadPaths: [workspacesDir] })
    for (const token of findPrefixViolations(css, c.name)) {
      failures.push(
        `${relative(root, path)} 里出现类名 ".${token}"，应以 ".ew-${c.name}" 为前缀`,
      )
    }
  }

  if (failures.length > 0) {
    throw new Error(`[build] 组件样式类名未按组件名加前缀：\n  ${failures.join('\n  ')}`)
  }
}

/**
 * 框架产物要 meta 里的 props 与 events（事件名、生成的类型全靠它），所以这里真的把
 * meta.ts 当模块加载一遍。必须走 pathToFileURL：裸绝对路径在 ESM 里不是合法说明符，
 * macOS 上碰巧能过、Windows 上会炸。
 */
async function loadFrameworkComponents(
  components: ComponentInfo[],
): Promise<FrameworkComponent[]> {
  const out: FrameworkComponent[] = []

  for (const c of components) {
    const stylePath = join(c.dir, c.styleFile)
    // Tailwind 的 preflight 是全局 reset，与 light DOM 下「不影响其他组件」天然冲突，
    // 它的类名也无法用前缀约束 —— 这类组件不出框架产物，只出 WC。
    if (usesTailwind(readFileSync(stylePath, 'utf8'))) {
      console.log(`[build] ${c.name} 用了 Tailwind，跳过框架产物`)
      continue
    }

    const mod = (await import(pathToFileURL(join(c.dir, 'meta.ts')).href)) as {
      default: ComponentMeta
    }
    out.push({
      name: c.name,
      workspace: c.workspace,
      framework: c.framework,
      styleFile: c.styleFile,
      meta: mod.default,
    })
  }

  return out
}

function writeGeneratedEntries(
  components: ComponentInfo[],
  frameworkComponents: FrameworkComponent[],
): void {
  rmSync(generatedDir, { recursive: true, force: true })
  mkdirSync(generatedDir, { recursive: true })
  mkdirSync(join(generatedDir, 'framework'), { recursive: true })

  // 生成文件在 src/.generated/，故相对路径要从 src/ 往上退两级再进 packages/
  const entryPath = (c: ComponentInfo) =>
    `../../packages/workspaces/${c.workspace}/components/${c.name}/index`

  // 每个空间一个桶：空间包的 `.` 入口只拉本空间的组件
  for (const workspace of workspacesOf(components)) {
    const lines = components
      .filter((c) => c.workspace === workspace)
      .map((c) => `export * as ${toIdentifier(c.name)} from '${entryPath(c)}'`)
    writeFileSync(join(generatedDir, `all-${workspace}.ts`), `${lines.join('\n')}\n`)
  }

  // 每个空间一份 side-effect 桶，CDN 的 `<空间>/index.js` 拿它当单入口。
  // 跨空间那份（原来的 ew-all）不再生成：把两个空间的运行时合并进同一个 bundle，
  // 会使其中一个空间的 vue / element-plus 版本受另一个空间约束，正是空间拆分要避免的事。
  for (const workspace of workspacesOf(components)) {
    const mine = components.filter((c) => c.workspace === workspace)
    const lines = mine.map((c, i) => `import { register as r${i} } from '${entryPath(c)}'`)
    lines.push('', mine.map((_, i) => `r${i}()`).join('\n'), '')
    writeFileSync(join(generatedDir, `all-define-${workspace}.ts`), `${lines.join('\n')}\n`)
  }

  for (const c of frameworkComponents) {
    const source = c.framework === 'vue' ? vueWrapperSource(c) : reactWrapperSource(c)
    writeFileSync(join(generatedDir, 'framework', `${c.name}.ts`), source)
  }

  // 框架桶也按空间切。该空间没有某个框架的组件就不生成 —— 出一个空桶会让
  // check:artifacts 把它当成「external 没生效」（空模块里没有裸导入）。
  for (const workspace of workspacesOf(frameworkComponents)) {
    for (const framework of ['vue', 'react'] as const) {
      const mine = frameworkComponents.filter(
        (c) => c.workspace === workspace && c.framework === framework,
      )
      if (mine.length === 0) continue
      writeFileSync(
        join(generatedDir, 'framework', `index-${workspace}-${framework}.ts`),
        barrelSource(mine, framework),
      )
    }
  }

  // 配置入口。**不分空间** —— 内容逐字相同，按空间生成几个副本纯属多余，
  // 也与「配置是页面级一份」的结论自相矛盾。
  writeFileSync(
    join(generatedDir, 'config.ts'),
    "export { configure, getConfig } from '@ew/runtime/config'\n",
  )
  // CDN 那份只出一个 default：IIFE 的 name 会变成全局名，入口多一个具名导出，
  // Rollup 就改成把整个 exports 对象挂上去，window.ewConfig 便不再是函数。
  writeFileSync(
    join(generatedDir, 'cdn-config.ts'),
    "export { configure as default } from '@ew/runtime/config'\n",
  )
}

// tailwind 对不含 @import "tailwindcss" 的 CSS 是直通，没用它的组件不受影响
const sharedPlugins = () => [vue(), react(), tailwind()]

const vueAlias = { vue: 'vue/dist/vue.runtime.esm-bundler.js' }

/**
 * 空间共享样式在 packages/<空间>/styles/index.scss，组件里以 `@use '<空间>/styles'` 取用。
 * 有了它才不必写 `../../`：相对路径的层数由组件所在位置决定，移动目录即失效。
 *
 * 两个键名都写：Vite 6+ 的现代 Sass API 认 loadPaths，Vite 5 用的旧 API 只认 includePaths，
 * 且互不识别（旧 API 收到 loadPaths 会当没看见）。本仓库两代并存：根构建跑 Vite 7，
 * VitePress 1.6 内嵌的是 Vite 5 —— 只写一个就会有一条管线断掉。
 */
const cssConfig = {
  preprocessorOptions: {
    scss: {
      loadPaths: [workspacesDir],
      includePaths: [workspacesDir],
    },
  },
}

async function buildEsm(components: ComponentInfo[]): Promise<void> {
  for (const workspace of workspacesOf(components)) {
    const mine = components.filter((c) => c.workspace === workspace)
    const entry: Record<string, string> = {
      index: join(generatedDir, `all-${workspace}.ts`),
      // 每个空间各出一份，只为让 `@ew/<空间>/config` 落在各自的包里（见 spec「三种产物的入口」）
      config: join(generatedDir, 'config.ts'),
    }
    for (const c of mine) {
      entry[c.name] = join(c.dir, 'index.ts')
      entry[`${c.name}/define`] = join(c.dir, 'define.ts')
    }

    const outDir = join(root, 'dist', workspace, 'esm')

    await build({
      root,
      configFile: false,
      resolve: { alias: vueAlias },
      css: cssConfig,
      plugins: sharedPlugins(),
      build: {
        target: 'es2020',
        outDir: `dist/${workspace}/esm`,
        emptyOutDir: true,
        minify: 'esbuild',
        lib: {
          entry,
          formats: ['es'],
          fileName: (_format, entryName) => `${entryName}.js`,
          cssFileName: 'styles',
        },
      },
    })

    writeFileSync(
      join(outDir, 'index.d.ts'),
      barrelDeclarationSource(mine.map((c) => c.name)),
    )
    for (const c of mine) {
      writeFileSync(join(outDir, `${c.name}.d.ts`), wcDeclarationSource(c.name))
    }
    writeFileSync(join(outDir, 'config.d.ts'), configDeclarationSource())
  }
}

/**
 * Vite 在 lib 模式下**不替换** `process.env.NODE_ENV`，因为库可能被各种宿主加载、
 * 由宿主的打包器负责替换。但 IIFE 是给 `<script>` 直接用的，没有宿主打包器 ——
 * react-dom 里的 `process.env.NODE_ENV` 会原样留下，浏览器一执行就抛
 * `process is not defined`，Custom Element 根本注册不上。所以 CDN 产物必须自己替换掉。
 */
const cdnDefine = { 'process.env.NODE_ENV': JSON.stringify('production') }

async function buildCdn(components: ComponentInfo[]): Promise<void> {
  // 进函数先把整棵 CDN 树清掉。下面每个空间、每个组件都共用 outDir 且关着 emptyOutDir
  // （关闭才是正确行为，否则同一空间里后一个构建会把前一个清掉），代价是已删除的组件会在产物目录中残留。
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

  // 根级配置入口。与空间无关，所以落在 dist/cdn/ 根上 —— checkCdn 的残留守卫为它开了一个口子。
  //
  // 必须排在函数开头那次 rmSync(dist/cdn) 之后：那句清的是整棵 CDN 树，放前面会被自己清掉。
  //
  // emptyOutDir 必须是 false：outDir 是 dist/cdn，而空间目录就在它下面，交给 Vite 清空
  // 会把刚构建好的产物一起抹掉。
  //
  // name 取 ewConfig + 入口只出一个 default：Rollup 于是 emit `var ewConfig = (…)()`，
  // 顶层 var 在 <script> 里就是 window.ewConfig。
  await build({
    root,
    configFile: false,
    define: cdnDefine,
    resolve: { alias: vueAlias },
    css: cssConfig,
    plugins: sharedPlugins(),
    build: {
      target: 'es2020',
      outDir: 'dist/cdn',
      emptyOutDir: false,
      minify: 'esbuild',
      lib: {
        entry: join(generatedDir, 'cdn-config.ts'),
        formats: ['iife'],
        name: 'ewConfig',
        fileName: () => 'config.js',
      },
    },
  })
}

/**
 * 宿主自己带一份的依赖，打进产物就是第二份实例：
 * - `vue` / `react`：两份会让 provide/inject 与 hooks 双双失效；
 * - `element-plus` / `pinia`：宿主已引时，组件里这份是另一个实例 —— 宿主的
 *   ElConfigProvider、主题配置无法作用于它，pinia 更是两个 active pinia，症状极难排查。
 *
 * 按**前缀**匹配而不是全等：组件会 import `element-plus/es/locale/lang/zh-cn` 这类子路径。
 * `axios` 故意不在表里 —— 它是组件自己的取数依赖，宿主没有也不该被要求装。
 */
const frameworkExternals = ['vue', 'react', 'react-dom', 'element-plus', 'pinia']

function isFrameworkExternal(id: string): boolean {
  return frameworkExternals.some((pkg) => id === pkg || id.startsWith(`${pkg}/`))
}

const elementPlusCssSpec = 'element-plus/dist/index.css'

/**
 * element-plus 现在只装在使用它的空间里，根包不再依赖它 —— `import.meta.resolve` 那种
 * 以本文件为基准的解析因此指不到东西。改从空间的 package.json 做 node 解析：那条路径与
 * 组件里写 `import 'element-plus'` 完全一致，装了就能找到，没装就是同一个报错。
 */
function resolveElementPlusCss(): string {
  for (const workspace of workspaceIdsOf(workspacesDir)) {
    const pkgPath = join(workspacesDir, workspace, 'package.json')
    if (!existsSync(pkgPath)) continue
    const space = JSON.parse(readFileSync(pkgPath, 'utf8')) as SpaceManifest
    const declared = { ...space.devDependencies, ...space.dependencies, ...space.peerDependencies }
    if (declared['element-plus'] === undefined) continue
    // createRequire(...).resolve 给的就是文件系统路径（CJS 解析的返回值），别再走
    // fileURLToPath —— 那一步只服务 `import.meta.resolve` 那种返回 URL 的接口
    return createRequire(pkgPath).resolve(elementPlusCssSpec)
  }
  throw new Error('[build] 没有任何空间依赖 element-plus，dist/element-plus.css 无从生成')
}

/**
 * 组件库样式单独出一个入口，让「宿主已有 EP」的项目可以不引。
 *
 * 必须裹 `@layer`：EP 的 `:root` 里除了 `--el-*` 还带一句 `color-scheme: light`，
 * 不分层注入会把宿主的深色主题连同原生控件一并转为浅色。分层之后它是一份默认值，
 * 宿主自己写的未分层规则优先级更高；宿主完全未引入 EP 时这层才生效。
 * 与 packages/runtime/src/style.ts 里那份 head 副本是同一个理由。
 *
 * 落在 dist 根而不是某个空间下：它是 Element Plus 的**全量**样式，与空间无关。
 * 放进某个空间是错位（第二个空间用 EP 时要么复制两份、要么另抽包），留根包则消费方
 * 多引一行 easy-webcomp/element-plus.css。
 */
function writeElementPlusCss(): void {
  const path = resolveElementPlusCss()
  const raw = readFileSync(path, 'utf8')
  // @charset 必须排在文件最前，裹进 @layer 块里就失效了 —— 提到块外
  const charset = /^@charset\s+"[^"]*";\s*/.exec(raw)?.[0] ?? ''
  const body = raw.slice(charset.length)
  writeFileSync(join(root, 'dist/element-plus.css'), `${charset}@layer ew {\n${body}\n}\n`)
}

async function buildFramework(
  components: ComponentInfo[],
  frameworkComponents: FrameworkComponent[],
): Promise<void> {
  for (const workspace of workspacesOf(components)) {
    const entry: Record<string, string> = {}
    const perFramework: Array<['vue' | 'react', FrameworkComponent[]]> = []
    for (const framework of ['vue', 'react'] as const) {
      const mine = frameworkComponents.filter(
        (c) => c.workspace === workspace && c.framework === framework,
      )
      if (mine.length === 0) continue
      entry[framework] = join(generatedDir, 'framework', `index-${workspace}-${framework}.ts`)
      perFramework.push([framework, mine])
    }
    // 整个空间都用 Tailwind（只出 WC）时没有框架入口，跳过
    if (Object.keys(entry).length === 0) continue

    await build({
      root,
      configFile: false,
      // 这里**不能**挂 vueAlias：别名会把裸说明符 `vue` 改写成 vue/dist/...，
      // 而 external 匹配的是改写前的说明符，两边一错开 vue 就被打进产物 ——
      // 那正是本文件里 check:artifacts 要拦的东西，别在源头制造它。
      css: cssConfig,
      plugins: sharedPlugins(),
      build: {
        target: 'es2020',
        outDir: `dist/${workspace}/framework`,
        emptyOutDir: true,
        minify: 'esbuild',
        rollupOptions: { external: isFrameworkExternal },
        lib: {
          entry,
          formats: ['es'],
          fileName: (_format, entryName) => `${entryName}.js`,
          cssFileName: 'styles',
        },
      },
    })

    for (const [framework, mine] of perFramework) {
      writeFileSync(
        join(root, 'dist', workspace, 'framework', `${framework}.d.ts`),
        frameworkDeclarationSource(mine, framework),
      )
    }
  }

  writeElementPlusCss()
}

/**
 * 把框架产物里抽出来的样式表提到空间根目录，并删掉 ESM 那份。
 *
 * 同一份 CSS 被抽到三处是管线的副产物而不是设计 —— 抽取跟着模块图走，有几条构建就落几份。
 * 但对消费方来说只有框架那份能取到：WC 模式下组件渲染在 shadow root 中，外部 CSS 无法进入，
 * ESM 那份没有任何消费方能拿到。所以只留一份放在空间根上，由 package.json 的 "./styles.css" 导出。
 *
 * CDN 那份（`dist/cdn/<空间>/<组件>.css`）不动：它是 URL 寻址的，与空间包的入口无关，
 * 而且单组件 IIFE 旁边没有 JS 入口能替它把样式带进去。
 */
function hoistCss(workspaces: readonly string[]): void {
  for (const workspace of workspaces) {
    const dir = join(root, 'dist', workspace)
    const emitted = join(dir, 'framework', 'styles.css')
    if (existsSync(emitted)) renameSync(emitted, join(dir, 'styles.css'))
    rmSync(join(dir, 'esm', 'styles.css'), { force: true })
  }
}

/**
 * 根包的 exports 收缩成三条：ESM 与 framework 都已按空间拆分出去，根上只剩 tokens.css、
 * element-plus.css 与 CDN。**不保留聚合的 `./vue` / `./react`**：那个桶正是本设计要
 * 消除的对象（引用 HelloVue 会把 element-plus 一并引入）。
 *
 * 不需要任何产物就能算出来，所以 --only 下也同样执行（与拆分前 writeExportsField 的行为一致）。
 *
 * 各键由 Node 的 exports 解析规则兜底，不需要额外顺序：精确键（`./tokens.css`）优先于
 * pattern，pattern 之间比 `*` 之前那段 base 的长短。`./cdn/<空间>/<组件>` 落 `./cdn/*`
 * —— subpath pattern 里的 `*` 能跨 `/`，所以多一层目录不用加规则。
 */
function writeRootExports(): void {
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>

  pkg.exports = {
    './tokens.css': './src/tokens/tokens.css',
    './element-plus.css': './dist/element-plus.css',
    './cdn/*': './dist/cdn/*.js',
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

interface SpaceManifest {
  version?: string
  private?: boolean
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/** 空间自己的依赖清单（`packages/<空间>/package.json`），版本号也从这里取 */
function readSpaceManifest(workspace: string): SpaceManifest {
  const path = join(workspacesDir, workspace, 'package.json')
  if (!existsSync(path)) {
    throw new Error(
      `[build] 空间 ${workspace} 没有 package.json。` +
        '用 pnpm run new:workspace 建的会自带，手工搬过来的需要补一份',
    )
  }
  return JSON.parse(readFileSync(path, 'utf8')) as SpaceManifest
}

/**
 * 给每个空间写一份 package.json（`dist/<空间>/package.json`）。
 *
 * 依赖从产物反推：`dist/<空间>/framework/*.js` 里那句 `import ... from "element-plus"`
 * 就是证据。不手写依赖表 —— 手写的表迟早与产物漂移，而漂移的症状（消费方解析不到说明符）
 * 要到别人装包时才暴露。**版本号**取自 `packages/<空间>/package.json`：依赖装在哪里，
 * 版本就从哪里读，两层清单各写各的版本迟早对不上。
 *
 * 用 pattern 而不是逐条列举组件：与根包那份不同，空间包的 package.json 落在被 gitignore
 * 的 dist/ 下、不入库，所以「两个人各加一个组件会撞冲突」这条理由在这里不成立，但 pattern
 * 让 exports 与组件清单解耦仍然值得。`*` 能跨 `/`，故 `@ew/<空间>/<组件>/define` 也由
 * `./*` 覆盖。
 *
 * 已知代价：`./*` 把 esm 目录里那些哈希 chunk（如 index-BZwKHW0M.js）也暴露成了可导入的
 * 子路径。不打算为它收紧 —— 这些文件是构建内部件，消费方没有理由去 import，而收紧要靠
 * 枚举组件，就又回到上面那个冲突问题。
 */
function writeWorkspacePackages(
  components: ComponentInfo[],
  frameworkComponents: FrameworkComponent[],
): void {
  for (const workspace of workspacesOf(components)) {
    const space = readSpaceManifest(workspace)
    // 版本来源：后面那项压过前面那项。vue / react 在 peer 与 dev 里都写了，
    // element-plus / pinia 只在 dev 里，axios 只在 dependencies 里 —— 这条合并让三种都取得到。
    const versions = {
      ...space.devDependencies,
      ...space.dependencies,
      ...space.peerDependencies,
    }
    const dir = join(root, 'dist', workspace)
    const frameworks = (['vue', 'react'] as const).filter((framework) =>
      frameworkComponents.some((c) => c.workspace === workspace && c.framework === framework),
    )
    const externals = [
      ...new Set(
        frameworks.flatMap((framework) =>
          bareSpecifiersOf(readFileSync(join(dir, 'framework', `${framework}.js`), 'utf8')),
        ),
      ),
    ].sort()

    const manifest = workspacePackageJson({
      workspace,
      version: space.version ?? '0.0.0',
      private: space.private,
      frameworks,
      // 从产物探测而不是扫源码里的 <style> 块：Vite 抽不抽得出 CSS 由模块图决定，
      // 源码里有个 <style> 不等于产物里有这个文件。位置由 hoistCss 定在空间根上。
      hasCss: existsSync(join(dir, 'styles.css')),
      externals,
      versions,
    })
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  }
}

function reportSizes(): void {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.js')) files.push(full)
    }
  }
  walk(join(root, 'dist'))

  console.log('\n产物体积（gzip）：')
  for (const file of files.sort()) {
    const gz = gzipSync(readFileSync(file)).length
    console.log(`  ${file.replace(`${root}/`, '')}  ${(gz / 1024).toFixed(1)} KB`)
  }
  console.log('')
}

async function main(): Promise<void> {
  const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
  if (only && only !== 'esm' && only !== 'cdn' && only !== 'framework') {
    throw new Error(`[build] --only 只接受 esm、cdn 或 framework，收到 "${only}"`)
  }

  const components = discoverComponents()
  if (components.length === 0) throw new Error('[build] 未发现任何组件')
  checkStylePrefixes(components)

  console.log(
    `[build] 发现 ${components.length} 个组件：` +
      components.map((c) => `${c.workspace}/${c.name}`).join(', '),
  )

  if (!only) rmSync(join(root, 'dist'), { recursive: true, force: true })
  const frameworkComponents = await loadFrameworkComponents(components)
  writeGeneratedEntries(components, frameworkComponents)

  if (!only || only === 'esm') {
    console.log('[build] 构建 ESM 产物...')
    await buildEsm(components)
  }

  if (!only || only === 'cdn') {
    console.log('[build] 构建 CDN（IIFE）产物...')
    await buildCdn(components)
  }

  if (!only || only === 'framework') {
    console.log('[build] 构建框架产物...')
    await buildFramework(components, frameworkComponents)
  }

  hoistCss(workspacesOf(components))

  writeRootExports()
  // 空间包的依赖从 framework 产物反推，要全量构建的产物才成立 —— --only 时跳过，
  // 此时 dist/ 下那些 package.json 保持上一次全量构建写下的内容。
  if (!only) writeWorkspacePackages(components, frameworkComponents)

  reportSizes()

  console.log('[build] 完成')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
