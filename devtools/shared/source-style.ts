// 用 @src 别名而非相对路径：别名由使用者（docs 站、调试页）各自在 vite 配置里定义，
// 与两边 root 的位置无关。少定义了这个别名不会报错 —— glob 匹配不到文件、componentStyle()
// 返回空串，源码模式静默变成无样式，所以它是「五件套」里不可省的一件。
const styleModules = import.meta.glob('@src/workspaces/*/components/*/style.{css,scss}', {
  eager: true,
  query: '?inline',
  import: 'default',
}) as Record<string, string>

/**
 * 组件目录里那份 style.{css,scss}。
 *
 * 这是**回落**，不是主路径：预览平时用的是 element 构造器上带回来的整份 CSS
 * （见 wc-registry），那份还含 index.ts 内联的 UI 库样式。这里只覆盖
 * 「没走到虚拟模块」的情形 —— 组件不在工具能扫到的范围内时，至少还有目录里的样式。
 */
export function componentStyle(name: string): string {
  const hit = Object.entries(styleModules).find(([path]) => path.split('/').at(-2) === name)
  return hit?.[1] ?? ''
}
