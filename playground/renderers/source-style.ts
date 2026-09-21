const styleModules = import.meta.glob('../../src/components/*/style.css', {
  eager: true,
  query: '?inline',
  import: 'default',
}) as Record<string, string>

/**
 * 源码模式下组件也不带样式 —— 组件把 CSS 交给 index.ts 以 ?inline 传给桥接层，
 * 直接渲染组件源码不会加载它。这里补上，否则两种模式外观差得太多，playground 就失去对照意义。
 */
export function componentStyle(name: string): string {
  return styleModules[`../../src/components/${name}/style.css`] ?? ''
}
