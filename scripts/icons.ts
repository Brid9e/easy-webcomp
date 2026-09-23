/**
 * 库图标同步：把文档站要显示的第三方库图标从 iconify 下载进仓库。
 *
 * **联网的只有这一步。** 文档站要能离线构建、内网 http 打开，所以页面不现拉 CDN；
 * 图标按「一个包一份文件」存在 docs/.vitepress/theme/components/lib-icons/ 下，
 * 文件名就是包名。
 *
 * 找一个库按 devicon → logos → simple-icons 的顺序试，命中即止：前两个收集各家官方的
 * 彩色 logo，simple-icons 是单色剪影 —— 它是兜底的兜底，有剪影也好过留一个空位。
 * 三个集合都没有就什么都不写，页面回落到 lib-icons/_placeholder.svg。
 *
 * 已有文件不覆盖。element-plus 就没进 iconify（当初是照官网手工存进来的），被脚本的
 * 「找不到」盖成占位不值得。想换某个库的图标，删掉那个 .svg 再跑一次。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ADDONS } from './new-component.ts'
import { bareSpecifiersOf } from './workspace-packages.ts'
import { workspaceIdsOf } from './workspaces.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspacesDir = join(root, 'packages/workspaces')
const iconsDir = join(root, 'docs/.vitepress/theme/components/lib-icons')
const API = 'https://api.iconify.design'

/** 命中即止的顺序。logos 是彩色官方 logo，simple-icons 是单色剪影，只作兜底 */
const PREFIXES = ['devicon', 'logos', 'simple-icons'] as const

/** 搜图标的词与包名不一致的少数几个 —— 按包名搜不到，但东西在 */
const SEARCH_TERMS: Record<string, string> = {
  // react-dom 没有自己的标记，官方图与 react 是同一份
  'react-dom': 'react',
  // ant-design-vue 是 antd 的 Vue 移植，共用一套标记
  'ant-design-vue': 'ant-design',
}

export interface FoundIcon {
  /** iconify 的完整名字，如 `devicon:vuejs`；它同时也是出处 */
  icon: string
  prefix: string
}

/**
 * 按 PREFIXES 的顺序找 pkg 的图标，返回第一个命中的。
 *
 * search 注进来是为了能离线单测：真跑时是 iconify 的搜索接口，测试里是一张表。
 */
export async function findIcon(
  pkg: string,
  search: (prefix: string, term: string) => Promise<string | undefined>,
): Promise<FoundIcon | undefined> {
  const term = SEARCH_TERMS[pkg] ?? pkg
  for (const prefix of PREFIXES) {
    const icon = await search(prefix, term)
    if (icon) return { icon, prefix }
  }
  return undefined
}

/**
 * 文档站可能显示成依赖标签的包：组件源码里 import 的，加上空间清单里声明的。
 *
 * 比实际会显示的略多（清单里可能有装了没用上的），多下几枚无害，少一枚才会显示成占位。
 * `@ew/*` 随产物内联、`@types/*` 只是类型，都不会出现在标签上。
 */
export function packagesInUse(workspacesDir: string): string[] {
  const found = new Set<string>()

  for (const id of workspaceIdsOf(workspacesDir)) {
    const componentsDir = join(workspacesDir, id, 'components')
    if (existsSync(componentsDir)) {
      for (const name of readdirSync(componentsDir)) {
        const dir = join(componentsDir, name)
        if (!statSync(dir).isDirectory()) continue
        for (const file of readdirSync(dir)) {
          // 与文档站扫依赖的 glob 同一条：组件目录下的 ts / tsx / vue
          if (!/\.(ts|tsx|vue)$/.test(file)) continue
          for (const pkg of bareSpecifiersOf(readFileSync(join(dir, file), 'utf8'))) found.add(pkg)
        }
      }
    }

    const manifestPath = join(workspacesDir, id, 'package.json')
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
      string,
      Record<string, string> | undefined
    >
    for (const section of ['devDependencies', 'dependencies', 'peerDependencies']) {
      for (const pkg of Object.keys(manifest[section] ?? {})) found.add(pkg)
    }
  }

  return [...found]
    .filter((pkg) => !pkg.startsWith('@ew/') && !pkg.startsWith('@types/'))
    .sort()
}

async function searchIconify(prefix: string, term: string): Promise<string | undefined> {
  const url = `${API}/search?query=${encodeURIComponent(term)}&prefixes=${prefix}&limit=1`
  const response = await fetch(url)
  if (!response.ok) return undefined
  const data = (await response.json()) as { icons?: string[] }
  return data.icons?.[0]
}

/**
 * simple-icons 那类单色剪影给的是 `fill="currentColor"`。
 *
 * 图标是用 `<img>` 嵌的，而 `<img>` 里的 SVG 是独立文档，继承不到页面的 color，
 * currentColor 落到初始值上就是**黑色** —— 亮色主题看得见，暗色主题黑底黑图直接消失。
 * 换成一个中间调灰，两边都读得出。彩色 logo（devicon / logos）不含 currentColor，不受影响。
 */
const NEUTRAL_FILL = '#8a8f98'

async function downloadIcon(icon: string): Promise<string> {
  const response = await fetch(`${API}/${icon}.svg`)
  if (!response.ok) throw new Error(`[icons] 下载 ${icon} 失败：HTTP ${response.status}`)
  // iconify 返回的是压成一行的 SVG，补个换行——存进仓库的文件要经得起 diff
  return `${(await response.text()).trim().replaceAll('currentColor', NEUTRAL_FILL)}\n`
}

async function main(): Promise<void> {
  mkdirSync(iconsDir, { recursive: true })

  // 脚手架能生成的库一并收进来：现在没人用，将来选了那个 addon 就现成有图标
  const scaffoldLibs = Object.values(ADDONS).flatMap((addon) => addon.dependencies)
  const wanted = [...new Set([...packagesInUse(workspacesDir), ...scaffoldLibs])].sort()

  const missing: string[] = []
  for (const pkg of wanted) {
    if (existsSync(join(iconsDir, `${pkg}.svg`))) {
      console.log(`  跳过 ${pkg}：已有 ${pkg}.svg`)
      continue
    }
    const found = await findIcon(pkg, searchIconify)
    if (!found) {
      missing.push(pkg)
      continue
    }
    writeFileSync(join(iconsDir, `${pkg}.svg`), await downloadIcon(found.icon))
    console.log(`  ${pkg} ← ${found.icon}`)
  }

  if (missing.length > 0) {
    console.log(`\n[icons] 三个集合里都没有，页面会显示占位图标：${missing.join('、')}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
