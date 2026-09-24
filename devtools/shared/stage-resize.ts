/**
 * 框架在舞台里居中时，宽度按 `right` 反解出来的式子。
 *
 *     right(w) = w ≤ C ? (C + w) / 2 : w    // 居中；w > C 时 safe center 退成左对齐
 *     w(right) = right ≤ C ? 2·right − C : right
 *
 * 居中那段就是 2 倍：宽度一变左右对称张开，右边线只走宽度增量的一半，翻倍才追得上鼠标。
 * 溢出那段左边界已经钉在 0、只有右边线在动，倍率本来就是 1，反解自然退回 1·dx。
 * 两段在 w = C 处取值都是 C，接得上。
 *
 * 纯函数是为了能单测：倍率这两段光靠肉眼看拖拽是分不清的（见 tests/devtools/stage-resize.test.ts）。
 */
export function widthForRightEdge(base: number, delta: number, inner: number): number {
  // 量不到舞台就退回朴素加法，别把拖拽卡死
  if (inner <= 0) return base + delta
  const right = base <= inner ? (inner + base) / 2 : base
  const target = right + delta
  return target <= inner ? 2 * target - inner : target
}
