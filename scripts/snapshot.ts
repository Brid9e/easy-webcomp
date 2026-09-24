import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// 从 @playwright/test 取而不是 playwright：pnpm 不开提升，playwright 只是它的传递依赖，
// 直接 import 会在严格 node_modules 下解析不到
import { chromium, type Page } from '@playwright/test'
import { workspaceIdsOf } from './workspaces.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(root, 'docs/public/snapshots')
const PORT = Number(process.env.SNAPSHOT_PORT ?? 4180)
const BASE = `http://localhost:${PORT}`
const FIXTURE = `${BASE}/tests/snapshot/fixture.html`

/**
 * 时间钉死。my-list 的 updatedAt 是 `Date.now() - i * 7h` 现算的，不钉的话那列每次
 * 截图都不同：PNG 提交进 git，每次运行都会产生大量无意义的二进制 diff。
 *
 * 用 setFixedTime 而不是 install：只让 `Date.now()` 定住，放行 setTimeout，
 * 组件里那段模拟网络的延迟照常推进。
 */
const FIXED_TIME = new Date('2026-01-01T09:30:00')

/**
 * 布局视口，不是画布 —— 截图按元素自身的包围盒出（见 main 里那一行），这里只决定组件
 * 按多宽来排版。16:9 横版：够宽，组件的筛选栏、表格才会排成它们本来的桌面形态
 * （720 宽时 my-list 的筛选会折成两行）；出图又宽又扁，缩进卡片那个横向的井里正好吃满。
 *
 * **宽度要盖得住最宽那个组件的自然宽度。** 组件宽过视口时，fixture 那个居中的 flex 盒子
 * 是撑不下的 —— 它只能溢出视口，而 Playwright 捕获视口之外的内容时会把整块缩着画进图里：
 * my-list 在 1280 下就是这样，1574 宽的内容缩成图左侧的一小块，右边一片透明（不是被裁，
 * 是整体缩小，所以也不报错）。那 1574 = 表格 11 列合计的 1510 + 组件内外边距，取 1600。
 * 下面的包围盒检查会在又出现这种组件时出声。
 *
 * 高度只要够放下最高的组件，fixture 的 body 是 min-height: 100vh，组件在里头居中。
 */
const VIEWPORT = { width: 1600, height: 900 } as const

/**
 * 等组件自己稳定下来：假数据由下面的路由直接给出（没有网络往返），等的只是表格与字体画完。
 * 这里没法通用地判断「加载完了没」—— 组件的就绪条件只有组件自己知道，
 * 拿内部类名（.el-table__row 之类）去等等于把截图管线绑死在某个组件的实现上。
 */
const SETTLE_MS = 1400

/** 组件目录下可选的 `mock.ts` 里那一个函数；没有假数据的组件不导出它。 */
interface MockModule {
  mockResponseOf?: (url: string, params: Record<string, string>) => { code: number; data: unknown }
}

interface Target {
  workspace: string
  name: string
  tag: string
}

/** 组件清单取自源码目录，与构建脚本同一处事实来源；tag 从 meta.ts 现读。 */
async function discover(): Promise<Target[]> {
  const workspacesDir = join(root, 'packages/workspaces')
  const found: Target[] = []

  for (const workspace of workspaceIdsOf(workspacesDir)) {
    const componentsDir = join(workspacesDir, workspace, 'components')
    if (!existsSync(componentsDir)) continue

    for (const name of readdirSync(componentsDir)) {
      const metaPath = join(componentsDir, name, 'meta.ts')
      if (!existsSync(metaPath)) continue
      const mod = (await import(pathToFileURL(metaPath).href)) as { default: { tag: string } }
      found.push({ workspace, name, tag: mod.default.tag })
    }
  }

  return found.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * 把每个组件自带的假数据接到网络上。
 *
 * 为什么要拦网络而不是像文档站那样装 axios 适配器：这里加载的是 **dist 产物**，
 * 产物里的 axios 是内联的另一份实例，源码里那个 `installMock()` 够不着它。
 * 能共用的只有假数据本身 —— 组件目录下 `mock.ts` 的 `mockResponseOf`，与文档站预览同源，
 * 两边不会各说各话。
 *
 * 没有 `mock.ts` 的组件（不请求后端的那几个）自然不受影响；认不出来的请求一律 `continue()`，
 * 交回静态服务 —— 组件因此**没数据时依然是「没数据」的样子**，而不是一张假图。
 */
async function interceptMocks(page: Page, targets: Target[]): Promise<void> {
  const mocks: MockModule[] = []
  for (const t of targets) {
    const mockPath = join(root, 'packages/workspaces', t.workspace, 'components', t.name, 'mock.ts')
    if (!existsSync(mockPath)) continue
    mocks.push((await import(pathToFileURL(mockPath).href)) as MockModule)
  }
  if (mocks.length === 0) return

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    const params = Object.fromEntries(url.searchParams)

    for (const mock of mocks) {
      const body = mock.mockResponseOf?.(url.pathname, params)
      // 404 是这一层的「这条不是我的」：回它的那个 mock 认不出这条请求，换下一个试。
      if (!body || body.code === 404) continue
      await route.fulfill({ json: body })
      return
    }

    await route.continue()
  })
}

/**
 * 静态服务在 4180 上。先探一次：端口被别的进程占着时，起服务会 EADDRINUSE 静默退出，
 * 而探活请求会打到**那个其他进程的服务**上：它的 /tests/... 通常 404，于是变成
 * 一个看不出原因的超时。先问清楚，把「端口被占」直接报出来。
 */
async function assertPortFree(): Promise<void> {
  try {
    await fetch(FIXTURE)
  } catch {
    return
  }
  throw new Error(
    `端口 ${PORT} 已被占用。换一个：SNAPSHOT_PORT=4181 pnpm run snapshot（或先 lsof -i :${PORT}）`,
  )
}

async function startServer(): Promise<ChildProcess> {
  const server = spawn('node', [join(root, 'tests/e2e/server.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  })

  for (let i = 0; i < 50; i += 1) {
    try {
      if ((await fetch(FIXTURE)).ok) return server
    } catch {
      // 还没起来
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  server.kill()
  throw new Error(`静态服务没能在 ${FIXTURE} 起来`)
}

async function main(): Promise<void> {
  const targets = await discover()
  if (targets.length === 0) {
    console.log('[snapshot] 没有找到任何组件，无事可做')
    return
  }

  const spaces = [...new Set(targets.map((t) => t.workspace))]
  const missing = spaces.filter((ws) => !existsSync(join(root, 'dist/cdn', ws, 'index.js')))
  if (missing.length > 0) {
    throw new Error(`缺少 CDN 产物：dist/cdn/{${missing.join(',')}}/index.js，请先执行 pnpm run build`)
  }

  await assertPortFree()
  const server = await startServer()

  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const page = await browser.newPage({
      viewport: { ...VIEWPORT },
      // 2x：卡片里是缩着看的，1x 缩下来字就糊了
      deviceScaleFactor: 2,
    })
    await page.clock.setFixedTime(FIXED_TIME)

    // 先接线再 goto：请求是组件挂载时发的，而挂载在下面 addScriptTag 之后 ——
    // 顺序上宽裕，但浏览器的网络监听一旦漏掉第一条就只表现为「这张图没数据」，
    // 排查不出所以然，索性按不依赖时序的写法来。
    await interceptMocks(page, targets)
    await page.goto(FIXTURE)

    // 按空间加载 CDN 产物 —— 一个空间一个 IIFE，正好是「CDN 按空间打包」的顺带好处。
    // 只有目标组件所在空间的文件真正被引到，其他空间不会被一并引入。
    for (const ws of spaces) {
      await page.addScriptTag({ url: `/dist/cdn/${ws}/index.js` })
    }

    rmSync(OUT_DIR, { recursive: true, force: true })

    for (const t of targets) {
      const defined = await page.evaluate((tag) => Boolean(customElements.get(tag)), t.tag)
      if (!defined) {
        console.warn(`[snapshot] ${t.tag} 没注册上（产物里没有这个组件？），跳过`)
        continue
      }

      await page.evaluate((tag) => {
        document.body.replaceChildren()
        const box = document.createElement('div')
        box.className = 'shot-box'
        box.appendChild(document.createElement(tag))
        document.body.appendChild(box)
      }, t.tag)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(SETTLE_MS)

      const file = join(OUT_DIR, t.workspace, `${t.name}.png`)
      mkdirSync(dirname(file), { recursive: true })

      // 溢出视口时截出来的图会静默变小变错位（见 VIEWPORT 那段），先量一把再说。
      const box = await page.locator('.shot-box').boundingBox()
      if (
        !box ||
        box.x < 0 ||
        box.y < 0 ||
        box.x + box.width > VIEWPORT.width ||
        box.y + box.height > VIEWPORT.height
      ) {
        console.warn(
          `[snapshot] ${t.tag} 的包围盒 ${box?.width ?? '?'}×${box?.height ?? '?'}（原点 ${box?.x ?? '?'},${box?.y ?? '?'}）` +
            ` 超出视口 ${VIEWPORT.width}×${VIEWPORT.height}，这张图会小一号 —— 按上面的口径把 VIEWPORT 调宽些。`,
        )
      }
      // 截组件外面那个留白盒子自身的包围盒：图 = 组件 + 四周各 16px。
      // 不截整块视口（试过 16:9 的统一画布）：那样按钮只占画布的一小块，缩进卡片后成为一个小点，
      // my-list 高过画布还会被裁掉下半截（分页没了）。比例不统一没关系：卡片是按高度贴合的，
      // 网格照样齐。
      //
      // omitBackground 让页面未绘制处保留为透明，产出 RGBA 而不是 RGB。
      // 它要求 fixture 自身不设背景（见 tests/snapshot/fixture.html），否则截到的仍是那片底色。
      await page.locator('.shot-box').screenshot({ path: file, omitBackground: true })
      console.log(`[snapshot] ${t.workspace}/${t.name}.png`)
    }
  } finally {
    await browser.close()
    server.kill()
  }
}

main().catch((error: unknown) => {
  console.error(`[snapshot] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
