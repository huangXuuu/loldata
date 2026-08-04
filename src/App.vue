<script setup lang="ts">
import { onMounted, ref } from 'vue'
import GetAllDataView from './views/GetAllDataView.vue'
import GetNewAllDataView from './views/GetNewAllDataView.vue'
import TeamAffinityView from './views/TeamAffinityView.vue'

const tabs = [
  { key: 'all', label: '获取全部数据', component: GetAllDataView },
  { key: 'diff', label: '版本数据对比', component: GetNewAllDataView },
  { key: 'affinity', label: '队伍英雄亲合度', component: TeamAffinityView },
] as const

const active = ref<(typeof tabs)[number]['key']>('all')

const AUTHOR_MID = '523253490'
const PROMO_BVID = 'BV1a8uA6XEeT'

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

function openVideo() {
  if (navigateSupported.value && window.toy) {
    window.toy.navigate({ type: 'video', id: PROMO_BVID }).catch((err: unknown) => {
      console.error('[ToySDK] navigate(video) failed', err)
      window.open(`https://www.bilibili.com/video/${PROMO_BVID}`, '_blank')
    })
    return
  }
  window.open(`https://www.bilibili.com/video/${PROMO_BVID}`, '_blank')
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
