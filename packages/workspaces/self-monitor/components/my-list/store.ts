import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { emptyFilter, fetchOutletPage, type OutletFilter, type OutletRow } from './api'

/**
 * 每个 <ew-my-list> 元素各持一份 pinia（index.ts 里按实例 createPinia），
 * 所以同页放两个元素，状态互不影响。
 *
 * 只装列表本身的状态。详情弹框那几项（开着没有、加载中没有）留在组件里 ——
 * 它们随弹框生灭，放进这里会变成一份没人重置的残留。
 */
export const useMyListStore = defineStore('my-list', () => {
  const filters = reactive<OutletFilter>(emptyFilter())
  const rows = ref<OutletRow[]>([])
  const total = ref(0)
  const page = ref(1)
  // 与宿主清单页一致，也是后端示例里那一档
  const pageSize = ref(15)
  const loading = ref(false)
  // 请求失败时表格本来就是空的，不给一句话的话看起来跟「查出来没数据」一模一样。
  const error = ref('')

  // 慢的那次请求可能后回来。只认最后一次发出的，否则「先查 A 再查 B」会被 A 的结果覆盖。
  let seq = 0

  function messageOf(e: unknown): string {
    return e instanceof Error ? e.message : String(e)
  }

  async function fetchRows(): Promise<void> {
    const mine = ++seq
    loading.value = true
    try {
      const result = await fetchOutletPage(filters, page.value, pageSize.value)
      if (mine !== seq) return
      rows.value = result.list
      total.value = result.total
      error.value = ''
    } catch (e: unknown) {
      if (mine !== seq) return
      rows.value = []
      total.value = 0
      error.value = messageOf(e)
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  /** 查询条件变了要回到第一页，否则可能停在超出结果集的页码上，看到一张空表。 */
  function search(): void {
    page.value = 1
    void fetchRows()
  }

  function reset(): void {
    Object.assign(filters, emptyFilter())
    search()
  }

  function changePage(next: number): void {
    page.value = next
    void fetchRows()
  }

  return {
    filters,
    rows,
    total,
    page,
    pageSize,
    loading,
    error,
    fetchRows,
    search,
    reset,
    changePage,
  }
})
