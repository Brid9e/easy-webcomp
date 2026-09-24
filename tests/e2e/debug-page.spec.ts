import { expect, test } from '@playwright/test'

// 调试页 dev server 在 5274（见 playwright.config.ts），与全局 baseURL（4173 的静态服务器）
// 不同源，所以这里写绝对地址。
const DEBUG_URL = 'http://localhost:5274/'

// 这三条测的是边线的像素位置，得先把视口钉死 —— 默认的 1280×720 舞台只剩 732px 宽，
// 框架拖两下就顶出去，落进另一段倍率；而 900 的高度够高，不会因出现竖向滚动条让舞台变窄。
test.use({ viewport: { width: 1440, height: 900 } })

/** 舞台内容盒宽（不含左右 padding）—— 能拖多远全看它，见 stage-resize.test.ts 的倍率分界。 */
const stageInnerWidth = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const area = document.querySelector('.stage-area')!
    const style = getComputedStyle(area)
    return Math.floor(
      area.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
    )
  })

const edgesOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const rect = document.querySelector('.stage-frame')!.getBoundingClientRect()
    return {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
    }
  })

async function drag(page: import('@playwright/test').Page, handle: string, dx: number, dy: number) {
  const box = (await page.locator(handle).boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 10 })
  await page.mouse.up()
}

test('调试页：元素渲染进 shadow root、预设改宽', async ({ page }) => {
  await page.goto(DEBUG_URL)

  await page.locator('nav.picker button', { hasText: 'hello-vue' }).click()

  // 元素已升级，且内容渲染进 shadow root
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.querySelector('.stage-body ew-hello-vue')?.shadowRoot?.textContent ?? '',
      ),
    )
    .toContain('Vue 组件：World')

  // 预设 375 后，容器实测宽度就是 375，且静止时左右留白相等（居中）
  await page.getByRole('button', { name: '375', exact: true }).click()
  const widthNow = () =>
    page.evaluate(() =>
      Math.round(document.querySelector('.stage-body')!.getBoundingClientRect().width),
    )
  await expect.poll(widthNow).toBe(375)

  const gapsNow = () =>
    page.evaluate(() => {
      const area = document.querySelector('.stage-area')!.getBoundingClientRect()
      const frame = document.querySelector('.stage-frame')!.getBoundingClientRect()
      return Math.round(frame.left - area.left - (area.right - frame.right))
    })
  await expect.poll(gapsNow).toBe(0)

  // 1024 比舞台还宽，必须真的撑到 1024 并交给 stage-area 滚。
  // stage-frame 是 flex item，少了 flex-shrink: 0 就会被压回容器宽 —— 这条是那道守门人。
  await page.getByRole('button', { name: '1024', exact: true }).click()
  await expect.poll(widthNow).toBe(1024)
})

test('调试页：三条把手拖动时边线 1:1 跟手，框架保持居中', async ({ page }) => {
  await page.goto(DEBUG_URL)
  await page.getByRole('button', { name: '375', exact: true }).click()

  // 右把手：宽度翻倍换来边线走满位移，左右对称张开（宽度 +200，两条边各走 100）。
  // 倍率在这个测试里才看得见 —— 直接 width += dx 的话右边线只会走 50。
  // 宽度按 2 倍长，拖拽量就得卡在「舞台还剩的一半余量」以内。再留一倍安全边际，
  // 顶出舞台那段是 1 倍率，归单测管，这里只测居中那段。
  const inner = await stageInnerWidth(page)
  const room = (used: number): number => Math.floor((inner - used) / 4)

  const before = await edgesOf(page)
  const d1 = room(375)
  await drag(page, '.handle.horizontal', d1, 0)
  const afterRight = await edgesOf(page)
  expect(afterRight.right).toBe(before.right + d1)
  expect(afterRight.left).toBe(before.left - d1)

  // 下把手：上边界钉住，只有下边界动
  await drag(page, '.handle.vertical', 0, 100)
  const afterBottom = await edgesOf(page)
  expect(afterBottom.top).toBe(afterRight.top)
  expect(afterBottom.bottom).toBe(afterRight.bottom + 100)

  // 右下角把手：一个动作同时改宽高，两条边都得跟手
  const d2 = room(375 + 2 * d1)
  await drag(page, '.handle.corner', d2, 100)
  const afterCorner = await edgesOf(page)
  expect(afterCorner.left).toBe(afterBottom.left - d2)
  expect(afterCorner.top).toBe(afterBottom.top)
  expect(afterCorner.right).toBe(afterBottom.right + d2)
  expect(afterCorner.bottom).toBe(afterBottom.bottom + 100)
})

test('调试页：拖拽途中就居中，不靠松手或刷新补', async ({ page }) => {
  await page.goto(DEBUG_URL)
  await page.getByRole('button', { name: '375', exact: true }).click()

  // 左右留白之差。0 表示居中 —— 曾经是「拖完就停住、要刷新才回中」，这条守着别退回去。
  const gapNow = () =>
    page.evaluate(() => {
      const area = document.querySelector('.stage-area')!.getBoundingClientRect()
      const frame = document.querySelector('.stage-frame')!.getBoundingClientRect()
      return Math.round(frame.left - area.left - (area.right - frame.right))
    })

  const box = (await page.locator('.handle.horizontal').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 100, y, { steps: 10 })
  // 还没松手就查：指针停住，poll 到布局稳定为止。
  // 只拖到 675 —— 再宽下去框架就顶出舞台（1440 视口剩 892），safe center 按设计退成左对齐，
  // 那条路走的是 1 倍率，归单测管（tests/devtools/stage-resize.test.ts）。
  await expect.poll(gapNow).toBe(0)
  await page.mouse.move(x + 150, y, { steps: 10 })
  await expect.poll(gapNow).toBe(0)
  await page.mouse.up()

  // 松手也不该再动
  await expect.poll(gapNow).toBe(0)
})

test('调试页：左右侧栏各自可收，收起状态记得住', async ({ page }) => {
  await page.goto(DEBUG_URL)

  const stageWidth = () =>
    page.evaluate(() =>
      Math.round(document.querySelector('.stage-area')!.getBoundingClientRect().width),
    )
  const bothOpen = await stageWidth()

  // 左边收起：组件列表整个卸载，舞台当场吃下那 220px
  await page.getByRole('button', { name: '组件列表' }).click()
  await expect(page.locator('nav.picker')).toHaveCount(0)
  await expect.poll(stageWidth).toBeGreaterThan(bothOpen)
  const onlyLeftGone = await stageWidth()

  // 右边收起：属性 / 事件栏卸载，再宽 280
  await page.getByRole('button', { name: '属性' }).click()
  await expect(page.locator('aside.side')).toHaveCount(0)
  await expect.poll(stageWidth).toBeGreaterThan(onlyLeftGone)

  // 显隐存在 ew-debug:* 里，刷新不该把它们弹回来
  await page.reload()
  await expect(page.locator('nav.picker')).toHaveCount(0)
  await expect(page.locator('aside.side')).toHaveCount(0)

  // 点回来两边都还原
  await page.getByRole('button', { name: '组件列表' }).click()
  await page.getByRole('button', { name: '属性' }).click()
  await expect(page.locator('nav.picker')).toHaveCount(1)
  await expect(page.locator('aside.side')).toHaveCount(1)
  await expect.poll(stageWidth).toBe(bothOpen)
})

test('调试页：右栏鉴权面板默认选「自行监测系统 token 解析」，失败给原因', async ({ page }) => {
  await page.goto(DEBUG_URL)

  const panel = page.locator('aside.side .panel', { hasText: '鉴权' })
  await expect(panel.locator('select')).toHaveValue('SELF_MONITOR_TOKEN')
  await expect(panel.locator('option')).toHaveText(['自行监测系统 token 解析'])

  // 调试页读的是自己 origin 的 localStorage，宿主那套数据默认不在 ——
  // 这条把「失败也要说清是哪种失败」钉住，别退化成只显示一个空结果
  await expect(panel.locator('.result')).toContainText(
    '没找到以 -core-access 结尾的 localStorage key',
  )
})

test('调试页：坏掉的鉴权方式不会把整页打空', async ({ page }) => {
  // 'constructor' 能骗过 `in` 守卫（原型链），却让 probeAuthMethod 取到 undefined 而抛错；
  // 面板的 computed 在渲染期读它，一抛整页白屏且自己恢复不了。这条钉住守卫必须按 KEY 清单判定。
  // addInitScript 在页面自己的脚本之前跑，所以面板 setup 时读到的就是这个坏值。
  // 必须 JSON.stringify：usePersisted 用 JSON.parse 读，直接写裸 'constructor' 会解析失败被
  // catch 掉、静默回落默认值，守卫根本见不到这个坏值 —— 那样这条测试就永远是绿的。
  await page.addInitScript(() =>
    localStorage.setItem('ew-debug:authMethod', JSON.stringify('constructor')),
  )
  await page.goto(DEBUG_URL)

  const panel = page.locator('aside.side .panel', { hasText: '鉴权' })
  await expect(panel.locator('select')).toHaveValue('SELF_MONITOR_TOKEN')
  await expect(panel.locator('option')).toHaveText(['自行监测系统 token 解析'])

  // 面板之外的东西也得在 —— 面板抛错会连累整个应用挂载，白屏时连舞台都没有
  await expect(page.locator('.stage-area')).toBeVisible()

  // 这条才是「守卫真见到了坏值并把它顶掉」的证据：坏值读进来 → 被守卫拒绝 → 经
  // usePersisted 的 watch 写回，存储里才会变成默认值。读失败直接回落的那条路不会写。
  // 少了它，将来谁把上面那句 JSON.stringify 删掉，这条用例就永远是绿的。
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('ew-debug:authMethod')))
    .toBe(JSON.stringify('SELF_MONITOR_TOKEN'))
})
