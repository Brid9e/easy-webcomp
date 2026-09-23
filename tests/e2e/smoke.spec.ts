import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/fixture/index.html')
})

test('两个自定义元素都被注册并升级', async ({ page }) => {
  const defined = await page.evaluate(() => ({
    vue: Boolean(customElements.get('ew-hello-vue')),
    react: Boolean(customElements.get('ew-hello-react')),
  }))
  expect(defined.vue).toBe(true)
  expect(defined.react).toBe(true)
})

test('Vue 组件渲染进 shadow root', async ({ page }) => {
  const text = await page.evaluate(
    () => document.querySelector('#vue-el')!.shadowRoot!.textContent,
  )
  expect(text).toContain('Vue 组件：Smoke')
})

test('React 组件渲染进 shadow root', async ({ page }) => {
  const text = await page.evaluate(
    () => document.querySelector('#react-el')!.shadowRoot!.textContent,
  )
  expect(text).toContain('React 组件：Smoke')
})

test('Vue 与 React 组件同页共存互不干扰', async ({ page }) => {
  const result = await page.evaluate(() => {
    // Chrome 走 adoptedStyleSheets，老浏览器才退回 <style>。两种都算一次投递。
    const stylesOf = (root: ShadowRoot): string[] => {
      const sheets = root.adoptedStyleSheets ?? []
      if (sheets.length > 0) {
        return sheets.map((s) =>
          Array.from(s.cssRules)
            .map((r) => r.cssText)
            .join(''),
        )
      }
      return Array.from(root.querySelectorAll('style')).map((s) => s.textContent ?? '')
    }

    const vue = document.querySelector('#vue-el')!.shadowRoot!
    const react = document.querySelector('#react-el')!.shadowRoot!
    const vueCss = stylesOf(vue)
    const reactCss = stylesOf(react)

    return {
      vueHasButton: Boolean(vue.querySelector('.ew-hello-vue')),
      reactHasButton: Boolean(react.querySelector('.ew-hello-react')),
      separateRoots: vue !== react,
      styleCounts: [vueCss.length, reactCss.length],
      vueUsesPrimary: vueCss.some((css) => css.includes('--ew-color-primary')),
      reactUsesDanger: reactCss.some((css) => css.includes('--ew-color-danger')),
      sheetsAreShared: vue.adoptedStyleSheets[0] === react.adoptedStyleSheets[0],
    }
  })
  expect(result.vueHasButton).toBe(true)
  expect(result.reactHasButton).toBe(true)
  expect(result.separateRoots).toBe(true)
  expect(result.styleCounts).toEqual([1, 1])
  expect(result.vueUsesPrimary).toBe(true)
  expect(result.reactUsesDanger).toBe(true)
  expect(result.sheetsAreShared).toBe(false)
})

test('事件能穿透 shadow root 冒泡到 window', async ({ page }) => {
  const detail = await page.evaluate(async () => {
    return new Promise((resolve) => {
      window.addEventListener(
        'ew-select',
        (e) => resolve((e as CustomEvent).detail),
        { once: true },
      )
      document
        .querySelector('#vue-el')!
        .shadowRoot!.querySelector<HTMLButtonElement>('.ew-hello-vue')!
        .click()
    })
  })
  expect(detail).toEqual({ source: 'hello-vue', name: 'Smoke' })
})

test('disable-shadow 降级到 light DOM 且样式注入 head', async ({ page }) => {
  const result = await page.evaluate(() => {
    const el = document.querySelector('#light-el')!
    return {
      hasShadow: Boolean(el.shadowRoot),
      hasButton: Boolean(el.querySelector('.ew-hello-vue')),
      headStyles: document.head.querySelectorAll('style[data-ew-style]').length,
    }
  })
  expect(result.hasShadow).toBe(false)
  expect(result.hasButton).toBe(true)
  expect(result.headStyles).toBeGreaterThan(0)
})

test('token 换肤能穿透 shadow root 影响组件', async ({ page }) => {
  const colorOf = () =>
    page.evaluate(
      () =>
        getComputedStyle(
          document.querySelector('#vue-el')!.shadowRoot!.querySelector('.ew-hello-vue')!,
        ).borderTopColor,
    )

  const before = await colorOf()
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ew-color-primary', 'rgb(255, 0, 0)')
  })
  const after = await colorOf()

  expect(after).not.toBe(before)
  expect(after).toBe('rgb(255, 0, 0)')
})

test('单组件产物与空间 index 同时引入不触发重复注册错误', async ({ page }) => {
  // fixture 已引入 hello-vue.js / hello-react.js 两个单组件产物，
  // 这里再引入 demo 的空间 index，它会对同样的 tag 再注册一遍。
  // 注意这是两个独立的 bundle，registry 模块实例不共享 ——
  // 拦住重复注册的必须是 registerElement 里的 customElements.get() 兜底检查。
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.addScriptTag({ url: '/dist/cdn/demo/index.js' })

  expect(errors).toEqual([])

  const upgraded = await page.evaluate(() => {
    const el = document.createElement('ew-hello-vue')
    el.setAttribute('name', 'All')
    document.body.appendChild(el)
    return el.shadowRoot?.textContent?.includes('All') ?? false
  })
  expect(upgraded).toBe(true)
})

test('空间 index 单独引入即注册该空间全部组件', async ({ page }) => {
  // 清掉 fixture 里已经引过的两个单组件产物，只留 index.js 一个来源。
  // 用 setContent 而不是 goto('about:blank')：后者会丢掉 origin，相对 URL 解析不到。
  await page.setContent('<html><body></body></html>')
  await page.addScriptTag({ url: '/dist/cdn/demo/index.js' })

  const registered = await page.evaluate(() => ({
    vue: Boolean(customElements.get('ew-hello-vue')),
    react: Boolean(customElements.get('ew-hello-react')),
  }))
  expect(registered).toEqual({ vue: true, react: true })
})

test('keep-alive：移出文档再放回来复用同一个实例', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // 走一遍「挂上 → 移出文档 → 放回来」，回报 DOM 节点是不是原来那一个。
    // 卸载重挂会让 Vue 换一批节点，节点同一性只有「没重挂」才成立。
    const roundTrip = async (
      attrs: Record<string, string>,
    ): Promise<{ sameRoot: boolean; sameNode: boolean; styleSheets: number; text: string }> => {
      const el = document.createElement('ew-hello-vue')
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
      document.body.appendChild(el)
      await new Promise((r) => setTimeout(r, 0))

      const shadow = el.shadowRoot
      const inner = shadow!.querySelector('.ew-hello-vue')

      el.remove()
      document.body.appendChild(el)
      await new Promise((r) => setTimeout(r, 0))

      return {
        sameRoot: el.shadowRoot === shadow,
        sameNode: el.shadowRoot!.querySelector('.ew-hello-vue') === inner,
        styleSheets: el.shadowRoot!.adoptedStyleSheets.length,
        text: el.shadowRoot!.textContent ?? '',
      }
    }

    return {
      kept: await roundTrip({ 'keep-alive': '', name: 'KA' }),
      plain: await roundTrip({ name: 'Plain' }),
    }
  })

  expect(result.kept.sameRoot).toBe(true)
  expect(result.kept.sameNode).toBe(true)
  expect(result.kept.styleSheets).toBe(1)
  expect(result.kept.text).toContain('KA')

  // 反向：不加这个属性时实例会被换掉 —— 证明上面那条差异确实来自它，
  // 而不是 querySelector 本来就会命中同一个节点
  expect(result.plain.sameNode).toBe(false)
  expect(result.plain.text).toContain('Plain')
})
