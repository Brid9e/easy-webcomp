import axios from './lib-icons/axios.svg'
import elementPlus from './lib-icons/element-plus.svg'
import pinia from './lib-icons/pinia.svg'
import react from './lib-icons/react.svg'
import vue from './lib-icons/vue.svg'

/**
 * 依赖标签上的库图标：各库官方的彩色 logo 文件，原样引用，不重绘也不改色。
 *
 * 这些文件是下载下来存进仓库的，不是运行时去拉 CDN —— 文档站要能离线构建。
 * 出处逐条记在下面，升级或换源时照着核对：
 *
 *   vue / react / pinia   iconify 的 logos 集合（转载各项目官方 SVG），原样保存
 *   axios                 同上的 thesvg-color 集合。logos 里那份是「axios」字标
 *                         （viewBox 512×75），不是标记，13px 下会糊成一条线
 *   element-plus          element-plus.org 的 logo 文件（fill 已经是官方 #409eff）
 *
 * 曾经用过 simple-icons：那是**单色剪影**库，Pinia 的彩色菠萝与 Vue 的双色 V 在里面
 * 根本不存在，取出来的黄与青压在卡片上既不像官方也看不清。
 *
 * 查不到的包返回 undefined，调用方回落到只写包名 —— 凭空画一个通用图标不如把名字写出来。
 */
const ICONS: Record<string, string> = {
  vue,
  // 渲染走 react-dom，两个包没有各自的标记，共用一份
  react,
  'react-dom': react,
  pinia,
  axios,
  'element-plus': elementPlus,
}

export const libIcon = (name: string): string | undefined => ICONS[name]
