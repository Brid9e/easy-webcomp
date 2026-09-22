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

/** 仅供测试使用 */
export function resetStyleCache(): void {
  injectedLightStyles.clear()
}
