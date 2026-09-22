const injectedLightStyles = new Set<string>()

function supportsAdoptedStyleSheets(root: ShadowRoot): boolean {
  return (
    'adoptedStyleSheets' in root &&
    typeof CSSStyleSheet !== 'undefined' &&
    typeof CSSStyleSheet.prototype.replaceSync === 'function'
  )
}

function injectLightStyle(doc: Document, css: string): void {
  if (injectedLightStyles.has(css)) return
  const style = doc.createElement('style')
  style.setAttribute('data-ew-style', '')
  style.textContent = css
  doc.head.appendChild(style)
  injectedLightStyles.add(css)
}

export function applyStyles(root: ShadowRoot | HTMLElement, css: string): void {
  if (!css) return

  if (root instanceof ShadowRoot) {
    if (supportsAdoptedStyleSheets(root)) {
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(css)
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
    } else {
      const style = root.ownerDocument.createElement('style')
      style.textContent = css
      root.appendChild(style)
    }

    // shadow 树里再往 document.head 放一份同样的。缺了它有两处会坏：
    // 1. `:root` 在 shadow 树里匹配不到任何元素，UI 库那堆 `--el-*` 变量只能靠这份
    //    定义在真实 <html> 上，再作为自定义属性继承进树里。
    // 2. 浮层（下拉、日期面板、弹框）Teleport 到 document.body，落在树外 ——
    //    shadow 里那份够不着它们，head 里这份才够得着。
    //
    // 这份必须裹进 @layer：它是一份**默认值**，不是要跟宿主抢的声明。UI 库的
    // `:root` 里除了 --el-* 还带一句 `color-scheme: light`，直接注入会把宿主的深色
    // 主题连同原生控件一起翻成浅色；库的一堆类规则也会以「后注入者胜」压掉宿主自己
    // 对同组件的定制。分层的普通声明永远输给未分层的，宿主照旧说了算；宿主那份 UI 库
    // 样式完全没引时，这层默认值才顶上来。
    injectLightStyle(root.ownerDocument, `@layer ew {\n${css}\n}`)
    return
  }

  injectLightStyle(root.ownerDocument, css)
}

/**
 * 把 shadow 专用的 `:host` 改写成 light DOM 里的宿主选择器。
 *
 * 只认裸 `:host`。`:host(...)` 是有意留着的 —— 它在 light DOM 里匹配不到任何元素，
 * 是一条无害的空规则；而改成 `.h(.card)` 会拼出非法选择器，整条规则连同块一起被丢弃。
 * 当前没有组件用这个形态，真要用再单独设计。
 *
 * 前瞻里那个 `(` 不能少。只挡 `[\w-]` 的话 `:host(.card)` 会因为 `(` 不在集合里而被替换成
 * `.h(.card)`；`-` 那半边挡的是 `:host-context()`。写成 `[\w-]|\(` 而不是 `[\w-(]`，
 * 是因为字符类里让 `-` 紧跟在 `\w` 后面要走 Annex B 的宽容规则才当字面量，太隐晦。
 */
export function rewriteHost(css: string, selector: string): string {
  return css.replace(/:host(?![\w-]|\()/g, selector)
}

/**
 * 把一份 CSS 作为**全局**样式注入 `document.head`，同一份只注入一次。
 *
 * 框架产物用它：那条路径下没有自定义元素，也就没有 `applyStyles` 的 shadow / light
 * 分流，组件样式直接落整页。与 `applyStyles` 的 light DOM 分支共用同一份去重表。
 */
export function applyGlobalStyles(css: string, doc: Document = document): void {
  if (!css) return
  injectLightStyle(doc, css)
}

/** 仅供测试使用 */
export function resetStyleCache(): void {
  injectedLightStyles.clear()
}
