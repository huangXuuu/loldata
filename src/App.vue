<script setup lang="ts">
import { ref } from 'vue'
import GetAllDataView from './views/GetAllDataView.vue'
import GetNewAllDataView from './views/GetNewAllDataView.vue'
import TeamAffinityView from './views/TeamAffinityView.vue'

const tabs = [
  { key: 'all', label: '获取全部数据', component: GetAllDataView },
  { key: 'diff', label: '版本数据对比', component: GetNewAllDataView },
  { key: 'affinity', label: '队伍英雄亲合度', component: TeamAffinityView },
] as const

const active = ref<(typeof tabs)[number]['key']>('all')
</script>

<template>
  <h1>LOL 赛事数据工具</h1>
  <p class="subtitle">数据全部在浏览器本地处理，不会上传到除赛事数据接口以外的任何服务器</p>

  <div class="tabs">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="tab-button"
      :class="{ active: active === tab.key }"
      @click="active = tab.key"
    >
      {{ tab.label }}
    </button>
  </div>

  <component :is="tabs.find((t) => t.key === active)!.component" />
</template>
