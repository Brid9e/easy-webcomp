// 用 @src 别名而非相对路径：别名由使用者（docs 站、调试页）各自在 vite 配置里定义，
// 与两边 root 的位置无关。少定义了这个别名不会报错 —— glob 匹配不到文件、componentStyle()
// 返回空串，源码模式静默变成无样式，所以它是「五件套」里不可省的一件。
const styleModules = import.meta.glob('@src/workspaces/*/components/*/style.{css,scss}', {
  eager: true,
  query: '?inline',
  import: 'default',
}) as Record<string, string>

/**
 * 源码模式下组件也不带样式 —— 组件把 CSS 交给 index.ts 以 ?inline 传给桥接层，
 * 直接渲染组件源码不会加载它。这里补上，否则两种模式外观差得太多，对照就失去意义。
 */
export function componentStyle(name: string): string {
  const hit = Object.entries(styleModules).find(([path]) => path.split('/').at(-2) === name)
  return hit?.[1] ?? ''
}
