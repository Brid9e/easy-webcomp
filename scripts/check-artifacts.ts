import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cdnDir = join(root, 'dist/cdn')

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

/** 框架取自组件源码目录，而不是文件名约定 —— 与构建脚本同一处事实来源 */
function frameworkOf(name: string): Framework | null {
  const workspacesDir = join(root, 'src/workspaces')
  for (const ws of readdirSync(workspacesDir)) {
    const dir = join(workspacesDir, ws, 'components', name)
    if (!existsSync(dir)) continue
    if (existsSync(join(dir, 'Component.vue'))) return 'vue'
    if (existsSync(join(dir, 'Component.tsx'))) return 'react'
  }
  return null
}

function main(): void {
  const failures: string[] = []

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

    const mine = frameworkOf(name)
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

  if (failures.length > 0) {
    console.error('[check:artifacts] 产物隔离被破坏：')
    for (const line of failures) console.error(`  - ${line}`)
    process.exit(1)
  }

  console.log('[check:artifacts] 产物隔离正常')
}

main()
