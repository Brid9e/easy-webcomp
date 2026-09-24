import { describe, expect, it } from 'vitest'
import { widthForRightEdge } from '../../devtools/shared/stage-resize'

/** 与 widthForRightEdge 同源的布局定义：框架右边线落在哪（坐标原点是舞台内容盒左边）。 */
const rightOf = (width: number, inner: number): number =>
  width <= inner ? (inner + width) / 2 : width

/** 这条是整套东西的契约：鼠标走多少，右边线就走多少。 */
const tracking = (base: number, delta: number, inner: number): number =>
  rightOf(widthForRightEdge(base, delta, inner), inner) - rightOf(base, inner)

describe('widthForRightEdge', () => {
  it('居中区间里翻倍：宽度 +100 让右边线只走 +50，所以要 +200', () => {
    // inner 1000、宽 375 时右边线在 687.5；拖 100 到 787.5，反解出来的宽度是 575。
    expect(widthForRightEdge(375, 100, 1000)).toBe(575)
    expect(tracking(375, 100, 1000)).toBeCloseTo(100)
  })

  it('往左拖同样跟手，宽度收得比鼠标快一倍', () => {
    expect(widthForRightEdge(375, -100, 1000)).toBe(175)
    expect(tracking(375, -100, 1000)).toBeCloseTo(-100)
  })

  it('宽过舞台后退回 1 倍：safe center 已左对齐，只有右边线在动', () => {
    expect(widthForRightEdge(1200, 50, 1000)).toBe(1250)
    expect(tracking(1200, 50, 1000)).toBeCloseTo(50)
  })

  it('从溢出里往回拖到装得下，倍率当场从 1 换回 2，且位置连续', () => {
    // 1200 拖回 300 到 900 —— 已经落进居中区间，宽度得收到 800 才够
    expect(widthForRightEdge(1200, -300, 1000)).toBe(800)
    expect(tracking(1200, -300, 1000)).toBeCloseTo(-300)
    // 分界处 w === inner，两段都取 1000
    expect(widthForRightEdge(1000, 0, 1000)).toBe(1000)
    expect(widthForRightEdge(1000, 1, 1000)).toBe(1001)
  })

  it('量不到舞台时退回朴素加法，至少不改坏行为', () => {
    expect(widthForRightEdge(375, 100, 0)).toBe(475)
  })
})
