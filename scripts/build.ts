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
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { build } from 'vite'
import { toIdentifier } from '../src/runtime/naming'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspacesDir = join(root, 'src/workspaces')
const generatedDir = join(root, 'src/.generated')

interface ComponentInfo {
  name: string
  workspace: string
  dir: string
  framework: 'vue' | 'react'
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

      components.push({ name, workspace, dir, framework: hasVue ? 'vue' : 'react' })
    }
  }

  return components.sort((a, b) => a.name.localeCompare(b.name))
}

function writeGeneratedEntries(components: ComponentInfo[]): void {
  rmSync(generatedDir, { recursive: true, force: true })
  mkdirSync(generatedDir, { recursive: true })

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
}

// tailwind 对不含 @import "tailwindcss" 的 CSS 是直通，没用它的组件不受影响
const sharedPlugins = () => [vue(), react(), tailwind()]

const vueAlias = { vue: 'vue/dist/vue.runtime.esm-bundler.js' }

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

function writeExportsField(components: ComponentInfo[]): void {
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>

  const exports: Record<string, unknown> = {
    './tokens.css': './src/tokens/tokens.css',
    '.': './dist/esm/index.js',
  }
  for (const c of components) {
    exports[`./${c.name}`] = `./dist/esm/${c.name}.js`
    exports[`./${c.name}/define`] = `./dist/esm/${c.name}/define.js`
    exports[`./cdn/${c.name}`] = `./dist/cdn/${c.name}.js`
  }
  exports['./cdn/ew-all'] = './dist/cdn/ew-all.js'

  pkg.exports = exports
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
  if (only && only !== 'esm' && only !== 'cdn') {
    throw new Error(`[build] --only 只接受 esm 或 cdn，收到 "${only}"`)
  }

  const components = discoverComponents()
  if (components.length === 0) throw new Error('[build] 未发现任何组件')

  console.log(
    `[build] 发现 ${components.length} 个组件：` +
      components.map((c) => `${c.workspace}/${c.name}`).join(', '),
  )

  if (!only) rmSync(join(root, 'dist'), { recursive: true, force: true })
  writeGeneratedEntries(components)

  if (!only || only === 'esm') {
    console.log('[build] 构建 ESM 产物...')
    await buildEsm(components)
  }

  if (!only || only === 'cdn') {
    console.log('[build] 构建 CDN（IIFE）产物...')
    await buildCdn(components)
  }

  writeExportsField(components)
  reportSizes()

  console.log('[build] 完成')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
