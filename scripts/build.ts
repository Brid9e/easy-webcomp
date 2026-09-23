import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { gzipSync } from 'node:zlib'
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
  barrelSource,
  reactWrapperSource,
  vueWrapperSource,
  type FrameworkComponent,
} from './framework-entries.ts'
import { findPrefixViolations } from './style-prefix.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspacesDir = join(root, 'src/workspaces')
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

  for (const workspace of readdirSync(workspacesDir)) {
    const wsDir = join(workspacesDir, workspace)
    if (!statSync(wsDir).isDirectory()) continue

    const componentsDir = join(wsDir, 'components')
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
    if (source.includes('@import "tailwindcss"')) continue

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
    if (readFileSync(stylePath, 'utf8').includes('@import "tailwindcss"')) {
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

  // 生成文件在 src/.generated/，故相对路径要从 src/ 往下写
  const entryPath = (c: ComponentInfo) =>
    `../workspaces/${c.workspace}/components/${c.name}/index`

  const allLines = components.map(
    (c) => `export * as ${toIdentifier(c.name)} from '${entryPath(c)}'`,
  )
  writeFileSync(join(generatedDir, 'all.ts'), `${allLines.join('\n')}\n`)

  const defineLines = components.map(
    (c, i) => `import { register as r${i} } from '${entryPath(c)}'`,
  )
  defineLines.push('', components.map((_, i) => `r${i}()`).join('\n'), '')
  writeFileSync(join(generatedDir, 'all-define.ts'), `${defineLines.join('\n')}\n`)

  for (const c of frameworkComponents) {
    const source = c.framework === 'vue' ? vueWrapperSource(c) : reactWrapperSource(c)
    writeFileSync(join(generatedDir, 'framework', `${c.name}.ts`), source)
  }
  writeFileSync(
    join(generatedDir, 'framework', 'index-vue.ts'),
    barrelSource(frameworkComponents, 'vue'),
  )
  writeFileSync(
    join(generatedDir, 'framework', 'index-react.ts'),
    barrelSource(frameworkComponents, 'react'),
  )
}

// tailwind 对不含 @import "tailwindcss" 的 CSS 是直通，没用它的组件不受影响
const sharedPlugins = () => [vue(), react(), tailwind()]

const vueAlias = { vue: 'vue/dist/vue.runtime.esm-bundler.js' }

/**
 * 空间共享样式在 src/workspaces/<空间>/styles/index.scss，组件里以 `@use '<空间>/styles'` 取用。
 * 有了它才不必写 `../../` —— 相对路径的层数跟组件所在位置绑死，挪目录就断。
 *
 * 两个键名都写：Vite 6+ 的现代 Sass API 认 loadPaths，Vite 5 用的旧 API 只认 includePaths，
 * 且互不识别（旧 API 收到 loadPaths 会当没看见）。本仓库两代并存 —— 根构建跑 Vite 7，
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
  const entry: Record<string, string> = {
    index: join(generatedDir, 'all.ts'),
  }
  for (const c of components) {
    entry[c.name] = join(c.dir, 'index.ts')
    entry[`${c.name}/define`] = join(c.dir, 'define.ts')
  }

  await build({
    root,
    configFile: false,
    resolve: { alias: vueAlias },
    css: cssConfig,
    plugins: sharedPlugins(),
    build: {
      target: 'es2020',
      outDir: 'dist/esm',
      emptyOutDir: true,
      minify: 'esbuild',
      lib: {
        entry,
        formats: ['es'],
        fileName: (_format, entryName) => `${entryName}.js`,
      },
    },
  })
}

/**
 * Vite 在 lib 模式下**不替换** `process.env.NODE_ENV`，因为库可能被各种宿主加载、
 * 由宿主的打包器负责替换。但 IIFE 是给 `<script>` 直接用的，没有宿主打包器 ——
 * react-dom 里的 `process.env.NODE_ENV` 会原样留下，浏览器一执行就抛
 * `process is not defined`，Custom Element 根本注册不上。所以 CDN 产物必须自己替换掉。
 */
const cdnDefine = { 'process.env.NODE_ENV': JSON.stringify('production') }

async function buildCdn(components: ComponentInfo[]): Promise<void> {
  for (const c of components) {
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
          entry: join(c.dir, 'define.ts'),
          formats: ['iife'],
          name: toIdentifier(c.name),
          fileName: () => `${c.name}.js`,
        },
      },
    })
  }

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
        entry: join(generatedDir, 'all-define.ts'),
        formats: ['iife'],
        name: 'EwAll',
        fileName: () => 'ew-all.js',
      },
    },
  })
}

/**
 * 宿主自己带一份的依赖，打进产物就是第二份实例：
 * - `vue` / `react`：两份会让 provide/inject 与 hooks 双双失效；
 * - `element-plus` / `pinia`：宿主已引时，组件里这份是另一个实例 —— 宿主的
 *   ElConfigProvider、主题配置够不到它，pinia 更是两个 active pinia，症状极难查。
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
 * 组件库样式单独出一个入口，让「宿主已有 EP」的项目可以不引。
 *
 * 必须裹 `@layer`：EP 的 `:root` 里除了 `--el-*` 还带一句 `color-scheme: light`，
 * 不分层注入会把宿主的深色主题连同原生控件一起翻成浅色。分层之后它是一份默认值，
 * 宿主自己写的未分层规则永远赢；宿主完全没引 EP 时这层才顶上来。
 * 与 packages/runtime/src/style.ts 里那份 head 副本是同一个理由。
 */
function writeElementPlusCss(): void {
  const path = fileURLToPath(import.meta.resolve(elementPlusCssSpec))
  const raw = readFileSync(path, 'utf8')
  // @charset 必须排在文件最前，裹进 @layer 块里就失效了 —— 提到块外
  const charset = /^@charset\s+"[^"]*";\s*/.exec(raw)?.[0] ?? ''
  const body = raw.slice(charset.length)
  writeFileSync(
    join(root, 'dist/framework/element-plus.css'),
    `${charset}@layer ew {\n${body}\n}\n`,
  )
}

async function buildFramework(): Promise<void> {
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
      outDir: 'dist/framework',
      emptyOutDir: true,
      minify: 'esbuild',
      rollupOptions: { external: isFrameworkExternal },
      lib: {
        entry: {
          vue: join(generatedDir, 'framework/index-vue.ts'),
          react: join(generatedDir, 'framework/index-react.ts'),
        },
        formats: ['es'],
        fileName: (_format, entryName) => `${entryName}.js`,
      },
    },
  })

  writeElementPlusCss()
}

/**
 * 用 pattern 而不是逐条列举组件：枚举的代价是每个组件往 package.json 里塞三行，而这份
 * package.json 是构建生成却又提交进 git 的 —— 两个人各加一个组件就会在这里撞冲突。
 * 交付契约本身没变（`./<name>` 取类、`./<name>/define` 引入即注册、`./cdn/<name>` 单文件），
 * 只是不再依赖构建期知道有哪些组件。
 *
 * 各键由 Node 的 exports 解析规则兜底，不需要额外顺序：精确键（`.`、`./tokens.css`）
 * 优先于 pattern，pattern 之间比 `*` 之前那段 base 的长短 —— `./cdn/*` 的 base 是 `./cdn/`，
 * 长过 `./*` 的 `./`，所以 `./cdn/hello-vue` 稳定落到 dist/cdn 而不是 dist/esm/cdn。
 * `*` 能跨 `/`，故 `./hello-vue/define` 也由 `./*` 覆盖。
 *
 * 已知代价：`./*` 把 dist/esm 里那些哈希 chunk（如 index-BZwKHW0M.js）也暴露成了可导入的
 * 子路径。不打算为它收紧 —— 这些文件是构建内部件，消费方没有理由去 import，而收紧要靠
 * 枚举组件，就又回到上面那个冲突问题。
 */
function writeExportsField(): void {
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>

  pkg.exports = {
    './tokens.css': './src/tokens/tokens.css',
    '.': './dist/esm/index.js',
    './vue': './dist/framework/vue.js',
    './react': './dist/framework/react.js',
    './element-plus.css': './dist/framework/element-plus.css',
    './cdn/*': './dist/cdn/*.js',
    './*': './dist/esm/*.js',
  }
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
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
    await buildFramework()
  }

  writeExportsField()
  reportSizes()

  console.log('[build] 完成')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
