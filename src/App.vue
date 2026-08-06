<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GetAllDataView from './views/GetAllDataView.vue'
import GetNewAllDataView from './views/GetNewAllDataView.vue'
import TeamAffinityView from './views/TeamAffinityView.vue'
import BpSimulatorView from './views/BpSimulatorView.vue'

const tabs = [
  { key: 'all', label: '获取全部数据', component: GetAllDataView },
  { key: 'diff', label: '版本数据对比', component: GetNewAllDataView },
  { key: 'affinity', label: '队伍英雄亲合度', component: TeamAffinityView },
  { key: 'bp', label: '全局BP模拟器', component: BpSimulatorView },
] as const

const active = ref<(typeof tabs)[number]['key']>('all')

const AUTHOR_MID = '523253490'
const PROMO_BVID = 'BV1a8uA6XEeT'

interface ChangelogEntry {
  date: string
  title: string
  bvid?: string
}

// TODO: 补充完整的更新记录（日期 + 功能说明 + 对应讲解视频 BV 号，没有视频的条目可省略 bvid）
const CHANGELOG: ChangelogEntry[] = [
  { date: '2026-08-04', title: '工具正式发布：赛季 / 赛段浏览、数据获取筛选与 Excel 导出', bvid: 'BV1a8uA6XEeT' },
]

const authorProfile = ref<ToyAuthorProfile | null>(null)
const navigateSupported = ref(false)

onMounted(async () => {
  try {
    if (!window.toy) return
    const supported = await window.toy.isSupport('getAuthorProfile')
    if (supported) {
      const result = await window.toy.getAuthorProfile()
      if (result.status === 'ok' && result.data) {
        authorProfile.value = result.data
      }
    }
    navigateSupported.value = await window.toy.isSupport('navigate')
  } catch (err) {
    console.error('[ToySDK] getAuthorProfile failed', err)
  }
})

function openVideoBv(bvid: string) {
  if (navigateSupported.value && window.toy) {
    window.toy.navigate({ type: 'video', id: bvid }).catch((err: unknown) => {
      console.error('[ToySDK] navigate(video) failed', err)
      window.open(`https://www.bilibili.com/video/${bvid}`, '_blank')
    })
    return
  }
  window.open(`https://www.bilibili.com/video/${bvid}`, '_blank')
}

function openVideo() {
  openVideoBv(PROMO_BVID)
}

function openAuthorSpace() {
  if (navigateSupported.value && window.toy) {
    window.toy.navigate({ type: 'space', id: AUTHOR_MID }).catch((err: unknown) => {
      console.error('[ToySDK] navigate(space) failed', err)
      window.open(`https://space.bilibili.com/${AUTHOR_MID}`, '_blank')
    })
    return
  }
  window.open(`https://space.bilibili.com/${AUTHOR_MID}`, '_blank')
}
</script>

<template>
  <h1>【B站心语悦无言】LPL赛事数据工具</h1>
  <p class="subtitle">数据全部在浏览器本地处理，不会上传到除赛事数据接口以外的任何服务器</p>

  <div class="promo-bar">
    <button type="button" class="link-btn" @click="openVideo">📺 观看教程视频</button>
    <button type="button" class="link-btn promo-follow" @click="openAuthorSpace">
      <img
        v-if="authorProfile?.avatar"
        :src="authorProfile.avatar"
        alt=""
        class="promo-avatar"
        referrerpolicy="no-referrer"
      />
      ➕ 关注 UP 主
    </button>
  </div>

  <details class="advanced-fields changelog" open>
    <summary>更新列表</summary>
    <ul class="changelog-list">
      <li v-for="item in CHANGELOG" :key="item.date + item.title" class="changelog-item">
        <span class="changelog-date">{{ item.date }}</span>
        <span class="changelog-title">{{ item.title }}</span>
        <button v-if="item.bvid" type="button" class="link-btn" @click="openVideoBv(item.bvid)">观看讲解视频</button>
      </li>
    </ul>
  </details>

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

  <footer v-if="authorProfile" class="author-credit">
    <img
      v-if="authorProfile.avatar"
      :src="authorProfile.avatar"
      alt=""
      class="author-avatar"
      referrerpolicy="no-referrer"
    />
    <span>作者：{{ authorProfile.nickname }}</span>
  </footer>
</template>
