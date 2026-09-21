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
  style.setAttribute('data-ctc-style', '')
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
      return
    }
    const style = root.ownerDocument.createElement('style')
    style.textContent = css
    root.appendChild(style)
    return
  }

  injectLightStyle(root.ownerDocument, css)
}

/** 仅供测试使用 */
export function resetStyleCache(): void {
  injectedLightStyles.clear()
}
