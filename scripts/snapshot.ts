import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// 从 @playwright/test 取而不是 playwright：pnpm 不开提升，playwright 只是它的传递依赖，
// 直接 import 会在严格 node_modules 下解析不到
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(root, 'docs/public/snapshots')
const PORT = Number(process.env.SNAPSHOT_PORT ?? 4180)
const BASE = `http://localhost:${PORT}`
const FIXTURE = `${BASE}/tests/snapshot/fixture.html`

/**
 * 时间钉死。my-list 的 updatedAt 是 `Date.now() - i * 7h` 现算的，不钉的话那列每次
 * 截图都不同 —— PNG 提交进 git，每次跑都产生一堆没有意义的二进制 diff。
 *
 * 用 setFixedTime 而不是 install：只让 `Date.now()` 定住，放行 setTimeout，
 * 组件里那段模拟网络的延迟照常推进。
 */
const FIXED_TIME = new Date('2026-01-01T09:30:00')

/**
 * 画布固定 16:9，截的是整个画布而不是元素本身 —— 组件自身尺寸千差万别
 * （按钮 168×30、my-list 672×560），不统一比例的话卡片高矮不一会很难看。
 * fixture 的 body 铺满这个视口并把组件居中。
 *
 * 选 16:9 而不是竖版，是因为消费这张图的是文档卡片里那个 140px 高、约 300px 宽的井
 * （见 ComponentCard.vue）：井是横的，竖版图在井里按高度贴合后只剩 79px 宽，
 * my-list 缩到看不清；16:9 同样是按高度贴合，却能拿到 249px。
 */
const CANVAS = { width: 720, height: 405 } as const

/**
 * 等组件自己稳定下来。my-list 的假数据带 400~900ms 随机延迟，取个能盖住它的上界。
 * 这里没法通用地判断「加载完了没」—— 组件的就绪条件只有组件自己知道，
 * 拿内部类名（.el-table__row 之类）去等等于把截图管线绑死在某个组件的实现上。
 */
const SETTLE_MS = 1400

interface Target {
  workspace: string
  name: string
  tag: string
}

/** 组件清单取自源码目录，与构建脚本同一处事实来源；tag 从 meta.ts 现读。 */
async function discover(): Promise<Target[]> {
  const workspacesDir = join(root, 'src/workspaces')
  const found: Target[] = []

  for (const workspace of readdirSync(workspacesDir)) {
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
 * 静态服务在 4180 上。先探一次：端口被别的进程占着时，起服务会 EADDRINUSE 静默退出，
 * 而我们的探活请求会打到**那个别人的服务**上 —— 它的 /tests/... 通常 404，于是变成
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
    throw new Error(`缺少 CDN 产物：dist/cdn/{${missing.join(',')}}/index.js —— 先跑 pnpm run build`)
  }

  await assertPortFree()
  const server = await startServer()

  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const page = await browser.newPage({
      viewport: { ...CANVAS },
      // 2x：卡片里是缩着看的，1x 缩下来字就糊了
      deviceScaleFactor: 2,
    })
    await page.clock.setFixedTime(FIXED_TIME)
    await page.goto(FIXTURE)

    // 按空间加载 CDN 产物 —— 一个空间一个 IIFE，正好是「CDN 按空间打包」的顺带好处。
    // 只有目标组件那个空间的文件真正被引到，别的空间不会被拖进来。
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
        document.body.appendChild(document.createElement(tag))
      }, t.tag)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(SETTLE_MS)

      const file = join(OUT_DIR, t.workspace, `${t.name}.png`)
      mkdirSync(dirname(file), { recursive: true })
      // 截整块画布（就是 viewport），不截元素 —— 元素尺寸各不相同，统一画布才有统一比例
      await page.screenshot({ path: file })
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
