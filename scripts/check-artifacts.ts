import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
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

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/** 组件清单与框架都取自源码目录，而不是文件名约定 —— 与构建脚本同一处事实来源 */
function discoverComponents(): Array<{ name: string; framework: Framework }> {
  const workspacesDir = join(root, 'src/workspaces')
  const found: Array<{ name: string; framework: Framework }> = []

  for (const ws of readdirSync(workspacesDir)) {
    const componentsDir = join(workspacesDir, ws, 'components')
    if (!existsSync(componentsDir)) continue

    for (const name of readdirSync(componentsDir)) {
      const dir = join(componentsDir, name)
      if (existsSync(join(dir, 'Component.vue'))) found.push({ name, framework: 'vue' })
      else if (existsSync(join(dir, 'Component.tsx'))) found.push({ name, framework: 'react' })
    }
  }

  return found
}

/**
 * 解析必须交给**原生 node**，不能让 tsx 代劳：tsx 的解析器带扩展名兜底，会把
 * `./*: ./dist/esm/*.jsx` 这类错误映射「补救」成实际存在的 .js 再返回，于是守卫永远绿。
 * 实测同一个错误映射，tsx 下 `import.meta.resolve` 与 `createRequire().resolve` 都返回
 * `dist/esm/hello-vue.js`，只有原生 node 如实返回 `.jsx`。消费方跑的正是原生 node / 打包器，
 * 所以以它为准。`cwd` 必须是仓库根，self-reference 才找得到本包。
 */
function resolveSpecs(specs: string[]): Record<string, string | null> {
  const probe = `
import { fileURLToPath } from 'node:url'
const out = {}
for (const s of ${JSON.stringify(specs)}) {
  try { out[s] = fileURLToPath(import.meta.resolve(s)) } catch { out[s] = null }
}
process.stdout.write(JSON.stringify(out))
`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: root,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(`[check:artifacts] 解析 exports 的子进程失败：\n${result.stderr}`)
  }
  return JSON.parse(result.stdout) as Record<string, string | null>
}

/**
 * 第二条契约：`package.json` 的 exports 子路径必须真能解析到文件。
 *
 * 组件子路径现在由 pattern（`./*`、`./cdn/*`）覆盖而不是逐条列举 —— 好处是 package.json
 * 不再随组件增减而变动，代价是它对「有哪些组件」一无所知，写错一个字符不会有任何测试红，
 * 要等消费方 import 时才炸。所以在这里按源码目录里的组件清单逐个走一遍。
 *
 * 交给真实解析而不是自己按 pattern 拼路径：`./cdn/hello-vue` 正是靠 `./cdn/*` 的 base 比
 * `./*` 长才没被解析到 `dist/esm/cdn/` 下，自己拼等于把 Node 的优先级规则再实现一遍。
 * 解析只做映射、不 stat 文件，所以结果还要 existsSync 一次。
 */
function checkExports(components: Array<{ name: string }>, failures: string[]): void {
  const wanted = [
    PKG,
    `${PKG}/tokens.css`,
    `${PKG}/cdn/ew-all`,
    ...components.flatMap((c) => [
      `${PKG}/${c.name}`,
      `${PKG}/${c.name}/define`,
      `${PKG}/cdn/${c.name}`,
    ]),
  ]

  const resolved = resolveSpecs(wanted)
  for (const spec of wanted) {
    const target = resolved[spec]
    if (target === null) {
      failures.push(`exports 里 ${spec} 没有匹配的键`)
    } else if (!existsSync(target)) {
      failures.push(`exports 里 ${spec} 解析到 ${relative(root, target)}，但该文件不存在`)
    }
  }
}

function main(): void {
  const failures: string[] = []
  const components = discoverComponents()
  const frameworkOf = new Map(components.map((c) => [c.name, c.framework]))

  for (const file of readdirSync(cdnDir).filter((f) => f.endsWith('.js'))) {
    const name = file.slice(0, -3)
    const code = readFileSync(join(cdnDir, file), 'utf8')

    // ew-all 是聚合产物，本来就该两个框架都在
    if (name === 'ew-all') {
      for (const [fw, marker] of Object.entries(MARKER)) {
        if (count(code, marker) < 1) {
          failures.push(`ew-all.js 里找不到 ${fw} 的标记 ${marker}，两个框架应当都在`)
        }
      }
      continue
    }

    const mine = frameworkOf.get(name)
    if (!mine) {
      failures.push(`找不到组件 "${name}" 的源码目录，无法判断框架`)
      continue
    }

    for (const [fw, marker] of Object.entries(MARKER) as Array<[Framework, string]>) {
      const hits = count(code, marker)
      if (fw === mine && hits !== 1) {
        failures.push(
          `${file} 里 ${fw} 标记 ${marker} 出现 ${hits} 次，应为 1 次（0 = 自己的框架没打进去，>1 = 装了两份）`,
        )
      }
      if (fw !== mine && hits !== 0) {
        failures.push(`${file} 是 ${mine} 组件，却含 ${fw} 标记 ${marker} ${hits} 次 —— 桶没被摇干净`)
      }
    }
  }

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
