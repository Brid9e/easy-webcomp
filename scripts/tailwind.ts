/**
 * 「这个组件用了 Tailwind」的判据。
 *
 * 两种入口都要认：单用时是 `@import "tailwindcss"`（整包，含 preflight）；与 UI 库同选时
 * 拆成 `tailwindcss/theme.css` + `tailwindcss/utilities.css`（去掉 preflight，见
 * scripts/new-component.ts 的 tailwindStyleEntry）。
 *
 * 构建期的类名前缀检查、框架产物跳过、产物校验三处都按它判断。各自写一遍字符串匹配的话，
 * 换一种写法就会漏掉一处，症状是组件悄悄多出了框架产物 —— 而 preflight 恰好是那三处要挡的东西。
 *
 * 用正则而不是 `includes`：`@import` 后可能带引号或无引号，两种写法 Sass 与 CSS 都收。
 */
const TAILWIND_IMPORT = /@import\s+["']tailwindcss/

export function usesTailwind(css: string): boolean {
  return TAILWIND_IMPORT.test(css)
}
