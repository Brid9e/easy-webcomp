export interface WorkspaceMeta {
  /** 展示名。缺省时由读取方回落到目录名 */
  title?: string
  description?: string
}

/**
 * 空间清单（`packages/<空间>/workspace.ts`）的写法。
 *
 * 放在 @ew/utils 而不是空间目录旁边：清单文件由脚手架生成，需要从一个稳定的裸说明符
 * 导入，相对路径会因为空间目录挪层级而断。这个函数只做类型标注，不产生任何运行时行为 ——
 * `satisfies` 也能表达同样的约束，但要消费方各自写一遍类型名。
 */
export function defineWorkspace(meta: WorkspaceMeta): WorkspaceMeta {
  return meta
}
