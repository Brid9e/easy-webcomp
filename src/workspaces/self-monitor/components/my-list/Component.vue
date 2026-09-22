<script setup lang="ts">
// <script setup> 里 import 进来的组件自动可用，模板写 <ElButton> 或 <el-button> 都行。
// v-loading 是**指令**，不是组件 —— 必须显式引 vLoading 才能在模板里用上它
// （只引组件不带插件安装时，v-loading 不会自动注册）。
import {
  ElButton,
  ElConfigProvider,
  ElDatePicker,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElOption,
  ElPagination,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
  vLoading,
} from 'element-plus'
// Element Plus 默认是英文。本项目没有全局装 EP 插件（见 index.ts：只 makeComponent 按需引），
// 所以语言要按组件挂 ElConfigProvider，而不是在 app.use(ElementPlus, { locale })。
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { onMounted, ref } from 'vue'
import { useVueEmit } from '@ew/runtime'
import type { MyListItem } from './api'
import { useMyListStore } from './store'

const props = defineProps<{ label?: string }>()

const emit = useVueEmit()
const store = useMyListStore()

// 详情弹框：查看的是哪一行 + 开没开。两者分开，关掉时 detail 还留着，
// 免得关闭动画放到一半内容突然变空。
const detail = ref<MyListItem | null>(null)
const detailVisible = ref(false)

onMounted(() => {
  void store.fetchRows()
})

// el-table 的插槽把 row 定型成 DefaultRow（Record<string, any> 的别名），
// 不是我们传进去的 MyListItem —— 这里认的是运行时数据，所以收窄一下类型即可。
function handleView(row: unknown): void {
  const item = row as MyListItem
  detail.value = item
  detailVisible.value = true
  emit('select', { source: 'my-list', id: item.id, name: item.name })
}
</script>

<template>
  <!-- EP 2.14.6 有一批 prop 的 .d.ts 写成 ExtractPropTypes<{ ...__epPropKey: true }>，vue-tsc
       2.x 展不平，于是每个 prop 都报 TS2322「Type 'string' is not assignable to …__epPropKey」。
       中招的是 ElConfigProvider 的 locale、ElSelect 与 ElOption 的各项；ElForm / ElInput 等
       用的是普通接口，不受影响。运行时完全无碍 —— 等上游修好，把这几行 @vue-ignore 一起删。 -->
  <!-- @vue-ignore -->
  <ElConfigProvider :locale="zhCn">
    <section class="ew-my-list">
      <header class="ew-my-list__head">
        <h3 class="ew-my-list__title">{{ props.label }}</h3>

        <!-- ElForm 渲染的是原生 <form>，回车会触发浏览器提交并刷新整页 —— 拦掉。 -->
        <ElForm :inline="true" class="ew-my-list__filters" @submit.prevent>
          <ElFormItem label="名称">
            <ElInput
              v-model="store.filters.keyword"
              placeholder="名称 / 编号"
              clearable
              class="ew-my-list__keyword"
              @keyup.enter="store.search()"
            />
          </ElFormItem>

          <ElFormItem label="状态">
            <!-- @vue-ignore -->
            <ElSelect
              v-model="store.filters.status"
              placeholder="全部状态"
              clearable
              class="ew-my-list__status"
            >
              <!-- @vue-ignore -->
              <ElOption label="启用" value="enabled" />
              <!-- @vue-ignore -->
              <ElOption label="停用" value="disabled" />
            </ElSelect>
          </ElFormItem>

          <ElFormItem label="更新时间">
            <ElDatePicker
              v-model="store.filters.dateRange"
              type="daterange"
              value-format="YYYY-MM-DD"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              unlink-panels
              class="ew-my-list__range"
            />
          </ElFormItem>

          <ElFormItem>
            <ElButton type="primary" :loading="store.loading" @click="store.search()">查询</ElButton>
            <ElButton @click="store.reset()">重置</ElButton>
          </ElFormItem>
        </ElForm>
      </header>

      <div class="ew-my-list__body">
        <ElTable v-loading="store.loading" :data="store.rows" stripe>
          <ElTableColumn prop="name" label="名称" min-width="180" show-overflow-tooltip />
          <ElTableColumn prop="id" label="编号" width="110" />
          <ElTableColumn prop="owner" label="负责人" width="100" />
          <ElTableColumn label="状态" width="90">
            <template #default="{ row }">
              <ElTag :type="row.status === 'enabled' ? 'success' : 'info'" size="small">
                {{ row.status === 'enabled' ? '启用' : '停用' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="updatedAt" label="更新时间" width="150" />
          <ElTableColumn label="操作" width="80" fixed="right">
            <template #default="{ row }">
              <ElButton link type="primary" @click="handleView(row)">查看</ElButton>
            </template>
          </ElTableColumn>
        </ElTable>
      </div>

      <footer class="ew-my-list__foot">
        <ElPagination
          :current-page="store.page"
          :page-size="store.pageSize"
          :total="store.total"
          layout="total, prev, pager, next"
          background
          @current-change="store.changePage"
        />
      </footer>
    </section>

    <!-- append-to-body 是必须的：不写的话弹框留在本组件的 DOM 里，会被列表容器的
         overflow/层叠上下文裁掉，也压不过调试页自己的右栏。 -->
    <ElDialog
      v-model="detailVisible"
      title="监测点详情"
      width="min(480px, 92vw)"
      append-to-body
    >
      <ElDescriptions v-if="detail" :column="1" border size="small">
        <ElDescriptionsItem label="名称">{{ detail.name }}</ElDescriptionsItem>
        <ElDescriptionsItem label="编号">{{ detail.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="负责人">{{ detail.owner }}</ElDescriptionsItem>
        <ElDescriptionsItem label="状态">
          {{ detail.status === 'enabled' ? '启用' : '停用' }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="更新时间">{{ detail.updatedAt }}</ElDescriptionsItem>
      </ElDescriptions>

      <template #footer>
        <ElButton type="primary" @click="detailVisible = false">关闭</ElButton>
      </template>
    </ElDialog>
  </ElConfigProvider>
</template>
