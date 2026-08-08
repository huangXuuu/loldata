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

// TODO: 发了新视频想换的话，把 BV 号换掉重新发布即可（平台没有"自动拉取最新视频"的接口，只能手动指定）
const RECENT_BVIDS = ['BV1U5uV6kE67', 'BV1F7uN6zEGV', 'BV1F3uW6xEnH', 'BV184uH6qEXP', 'BV1tTM26YESk', 'BV1MmM26KECU']

interface RecentVideo {
  bvid: string
  title: string
  cover: string | null
}

const recentVideos = ref<RecentVideo[]>(RECENT_BVIDS.map((bvid) => ({ bvid, title: bvid, cover: null })))

interface ChangelogEntry {
  date: string
  title: string
  bvid?: string
}

// TODO: 补充完整的更新记录（日期 + 功能说明 + 对应讲解视频 BV 号，没有视频的条目可省略 bvid）
const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-08-06',
    title:
      '新增「全局BP模拟器」：标准两阶段禁用 / 选用流程，支持 Bo3 / Bo5 系列赛 Fearless Draft、按分路筛选、按 BP率 / 胜率排序、多局对照查看',
    bvid: 'BV1xdun6ZEbX',
  },
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

    if (await window.toy.isSupport('getAuthorVideos')) {
      const videosResult = await window.toy.getAuthorVideos({ videos: RECENT_BVIDS.map((bvid) => ({ bvid })) })
      if (videosResult.status === 'ok' && Array.isArray(videosResult.items)) {
        const byBvid = new Map(
          videosResult.items
            .filter((item) => item.status === 'ok' && item.data?.bvid)
            .map((item) => [item.data!.bvid as string, item.data!]),
        )
        recentVideos.value = RECENT_BVIDS.map((bvid) => {
          const info = byBvid.get(bvid)
          return {
            bvid,
            title: info?.title ?? bvid,
            cover: info?.cover ? info.cover.replace(/^http:/, 'https:') : null,
          }
        })
      } else {
        console.warn('[ToySDK] getAuthorVideos returned unexpected shape, keeping fallback', videosResult)
      }
    }
  } catch (err) {
    console.error('[ToySDK] getAuthorProfile/getAuthorVideos failed', err)
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
  <p class="subtitle">目前是小 UP 为爱发电阶段，租的小服务器经常顶不住大家访问，如果遇到报错，麻烦私信联系 UP</p>
  <p class="subtitle">扛不住大家一直私信反应网络问题了，升级到了大服务器，希望能有好转 QAQ</p>

  <div class="promo-bar">
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

  <div class="recent-videos">
    <button
      v-for="v in recentVideos"
      :key="v.bvid"
      type="button"
      class="recent-video-card"
      :title="v.title"
      @click="openVideoBv(v.bvid)"
    >
      <img v-if="v.cover" :src="v.cover" alt="" class="recent-video-cover" referrerpolicy="no-referrer" />
      <div v-else class="recent-video-cover recent-video-cover-empty">📺</div>
      <span class="recent-video-title">{{ v.title }}</span>
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
