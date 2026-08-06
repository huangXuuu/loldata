<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ALL_CHAMPIONS, championIconUrl, type Champion } from '../heroPool'
import { defaultFormState, fetchAllData, fetching } from '../dataFetch'
import { fetchedData } from '../dataStore'

const LANE_ORDER = ['上单', '打野', '中单', '射手', '辅助']

const loadError = ref('')

onMounted(async () => {
  if (fetchedData.value) return
  try {
    await fetchAllData(defaultFormState())
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
})

interface HeroStat {
  lanes: Set<string>
  bpRateByLane: Map<string, number>
  winRateByLane: Map<string, number>
  maxBpRate: number
  maxWinRate: number
}

// 从「获取全部数据」拉到的英雄数据里读 英雄分路 / BP率 / 胜率，做分组和排序用；
// 同一个英雄可能按分路拆成多行（不同分路 BP率/胜率不同），所以按英雄名聚合
const heroStatsByName = computed(() => {
  const map = new Map<string, HeroStat>()
  const rows = fetchedData.value?.heroRows ?? []
  for (const row of rows) {
    const name = String(row['英雄名'] ?? '').trim()
    if (!name) continue
    const lane = String(row['英雄分路'] ?? '').trim()
    const bpRate = parseFloat(String(row['BP率'] ?? '').replace('%', '')) || 0
    const winRate = parseFloat(String(row['胜率'] ?? '').replace('%', '')) || 0
    let stat = map.get(name)
    if (!stat) {
      stat = { lanes: new Set(), bpRateByLane: new Map(), winRateByLane: new Map(), maxBpRate: 0, maxWinRate: 0 }
      map.set(name, stat)
    }
    if (lane) {
      stat.lanes.add(lane)
      stat.bpRateByLane.set(lane, bpRate)
      stat.winRateByLane.set(lane, winRate)
    }
    if (bpRate > stat.maxBpRate) stat.maxBpRate = bpRate
    if (winRate > stat.maxWinRate) stat.maxWinRate = winRate
  }
  return map
})

const availableLanes = computed(() => {
  const set = new Set<string>()
  for (const stat of heroStatsByName.value.values()) {
    for (const lane of stat.lanes) set.add(lane)
  }
  return LANE_ORDER.filter((l) => set.has(l))
})

const activeLane = ref<string | null>(null)
const poolVisibility = ref<'all' | 'selectable'>('all')
const sortMode = ref<'bpRate' | 'winRate'>('bpRate')
const winRateBpThreshold = ref(0)

function bpRateFor(c: Champion): number {
  const stat = heroStatsByName.value.get(c.name)
  if (!stat) return -1
  if (activeLane.value) return stat.bpRateByLane.get(activeLane.value) ?? -1
  return stat.maxBpRate
}

function winRateFor(c: Champion): number {
  const stat = heroStatsByName.value.get(c.name)
  if (!stat) return -1
  if (activeLane.value) return stat.winRateByLane.get(activeLane.value) ?? -1
  return stat.maxWinRate
}

function activeRateLabel(c: Champion): string {
  const rate = sortMode.value === 'winRate' ? winRateFor(c) : bpRateFor(c)
  if (rate < 0) return ''
  return `${sortMode.value === 'winRate' ? '胜率' : 'BP'} ${rate.toFixed(2)}%`
}

type Side = 'blue' | 'red'
type ActionType = 'ban' | 'pick'
interface DraftStep {
  side: Side
  type: ActionType
  label: string
}

// 标准职业赛事两阶段 BP 顺序：Ban1(3v3 交替，蓝先) → Pick1(3v3 蛇形) → Ban2(2v2 交替，红先) → Pick2(2v2 蛇形，红先)
const DRAFT_SEQUENCE: DraftStep[] = [
  { side: 'blue', type: 'ban', label: 'B1' },
  { side: 'red', type: 'ban', label: 'B2' },
  { side: 'blue', type: 'ban', label: 'B3' },
  { side: 'red', type: 'ban', label: 'B4' },
  { side: 'blue', type: 'ban', label: 'B5' },
  { side: 'red', type: 'ban', label: 'B6' },
  { side: 'blue', type: 'pick', label: 'P1' },
  { side: 'red', type: 'pick', label: 'P2' },
  { side: 'red', type: 'pick', label: 'P3' },
  { side: 'blue', type: 'pick', label: 'P4' },
  { side: 'blue', type: 'pick', label: 'P5' },
  { side: 'red', type: 'pick', label: 'P6' },
  { side: 'red', type: 'ban', label: 'B7' },
  { side: 'blue', type: 'ban', label: 'B8' },
  { side: 'red', type: 'ban', label: 'B9' },
  { side: 'blue', type: 'ban', label: 'B10' },
  { side: 'red', type: 'pick', label: 'P7' },
  { side: 'blue', type: 'pick', label: 'P8' },
  { side: 'blue', type: 'pick', label: 'P9' },
  { side: 'red', type: 'pick', label: 'P10' },
]

interface GameRecord {
  steps: (Champion | null)[]
}

function newGame(): GameRecord {
  return { steps: DRAFT_SEQUENCE.map(() => null) }
}

const seriesLength = ref<1 | 3 | 5>(3)
const games = ref<GameRecord[]>([newGame()])
const currentGameIndex = ref(0)
// 用户额外勾选要对照查看的历史局（当前进行中的这一局永远显示，不用勾）
const visibleGameIndices = ref<Set<number>>(new Set())
const search = ref('')

const currentGame = computed(() => games.value[currentGameIndex.value])
// 当前进行中的这一局 + 用户勾选要对照查看的历史局，按局数排序，可以同时看多局做对比
const displayedGameIndices = computed(() => {
  const set = new Set(visibleGameIndices.value)
  set.add(currentGameIndex.value)
  return [...set].filter((i) => i < games.value.length).sort((a, b) => a - b)
})

function toggleGameVisibility(i: number) {
  if (i === currentGameIndex.value) return
  const next = new Set(visibleGameIndices.value)
  if (next.has(i)) next.delete(i)
  else next.add(i)
  visibleGameIndices.value = next
}

const currentStepIndex = computed(() => currentGame.value.steps.findIndex((s) => s === null))
const isGameComplete = computed(() => currentStepIndex.value === -1)
const currentStep = computed<DraftStep | null>(() =>
  isGameComplete.value ? null : DRAFT_SEQUENCE[currentStepIndex.value],
)

function slotsFor(side: Side, type: ActionType) {
  return DRAFT_SEQUENCE.map((step, i) => ({ step, i })).filter((x) => x.step.side === side && x.step.type === type)
}

const blueBanSlots = slotsFor('blue', 'ban')
const bluePickSlots = slotsFor('blue', 'pick')
const redBanSlots = slotsFor('red', 'ban')
const redPickSlots = slotsFor('red', 'pick')

// 系列赛开始前（当前局一步未走）允许改系列赛长度，走了第一步之后锁定，避免中途改长度打乱 Fearless 记录
const canChangeSeriesLength = computed(() => games.value.length === 1 && currentStepIndex.value <= 0)

const usedThisGame = computed(() => {
  const set = new Set<string>()
  for (const c of currentGame.value.steps) {
    if (c) set.add(c.id)
  }
  return set
})

const fearlessLocked = computed(() => {
  const set = new Set<string>()
  if (seriesLength.value === 1) return set
  for (let g = 0; g < currentGameIndex.value; g++) {
    const game = games.value[g]
    game.steps.forEach((c, i) => {
      if (c && DRAFT_SEQUENCE[i].type === 'pick') set.add(c.id)
    })
  }
  return set
})

function isSelectable(c: Champion): boolean {
  return !usedThisGame.value.has(c.id) && !fearlessLocked.value.has(c.id)
}

function unselectableReason(c: Champion): string {
  if (usedThisGame.value.has(c.id)) return '本局已被 Ban / Pick'
  if (fearlessLocked.value.has(c.id)) return 'Fearless：本系列赛已被选用'
  return ''
}

const filteredChampions = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = ALL_CHAMPIONS.filter(
    (c) =>
      !q ||
      c.name.includes(q) ||
      c.alias.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.toLowerCase().includes(q)),
  )
  if (activeLane.value) {
    list = list.filter((c) => heroStatsByName.value.get(c.name)?.lanes.has(activeLane.value!))
  }
  if (poolVisibility.value === 'selectable') {
    list = list.filter((c) => isSelectable(c))
  }

  if (sortMode.value === 'bpRate') {
    return [...list].sort((a, b) => bpRateFor(b) - bpRateFor(a))
  }

  // 按胜率排序：只有 BP率 达到门槛的英雄参与胜率排序并排在前面；没达到门槛的仍然显示，
  // 只是不参与排序，统一排在后面（按 BP率 做个稳定的次要排序，而不是随机顺序）
  return [...list].sort((a, b) => {
    const aQualifies = bpRateFor(a) >= winRateBpThreshold.value
    const bQualifies = bpRateFor(b) >= winRateBpThreshold.value
    if (aQualifies && bQualifies) return winRateFor(b) - winRateFor(a)
    if (aQualifies !== bQualifies) return aQualifies ? -1 : 1
    return bpRateFor(b) - bpRateFor(a)
  })
})

function selectChampion(c: Champion) {
  if (isGameComplete.value || !isSelectable(c)) return
  currentGame.value.steps[currentStepIndex.value] = c
}

const canUndo = computed(() => currentGame.value.steps.some((s) => s !== null))

function undoLastStep() {
  for (let i = currentGame.value.steps.length - 1; i >= 0; i--) {
    if (currentGame.value.steps[i] !== null) {
      currentGame.value.steps[i] = null
      break
    }
  }
}

function resetCurrentGame() {
  currentGame.value.steps = DRAFT_SEQUENCE.map(() => null)
}

function resetSeries() {
  games.value = [newGame()]
  currentGameIndex.value = 0
  visibleGameIndices.value = new Set()
  search.value = ''
}

const canStartNextGame = computed(() => isGameComplete.value && currentGameIndex.value + 1 < seriesLength.value)

function startNextGame() {
  if (!canStartNextGame.value) return
  games.value.push(newGame())
  currentGameIndex.value += 1
  search.value = ''
}

const seriesFinished = computed(() => isGameComplete.value && currentGameIndex.value + 1 >= seriesLength.value)

function endSeriesEarly() {
  seriesLength.value = (currentGameIndex.value + 1) as 1 | 3 | 5
}
</script>

<template>
  <div class="card">
    <h2>全局 BP 模拟器</h2>
    <p class="desc">按官方职业赛事两阶段 BP 顺序模拟禁用 / 选用，支持 Bo3 / Bo5 系列赛的 Fearless Draft（同系列赛已选用的英雄，后续场次双方都不能再选）。</p>

    <div v-if="fetching && !fetchedData" class="bp-data-status">正在获取赛事数据（用于按分路分组、按 BP 率排序），请稍候...</div>
    <div v-else-if="loadError && !fetchedData" class="bp-data-status error">
      获取数据失败：{{ loadError }}。可以先到「获取全部数据」标签页手动获取，暂时仍可正常使用英雄池（无法按分路 / BP 率排序）。
    </div>

    <div class="bp-toolbar">
      <label class="bp-series-select">
        系列赛长度
        <select v-model.number="seriesLength" :disabled="!canChangeSeriesLength">
          <option :value="1">Bo1</option>
          <option :value="3">Bo3（Fearless）</option>
          <option :value="5">Bo5（Fearless）</option>
        </select>
      </label>
      <span class="bp-game-indicator">第 {{ currentGameIndex + 1 }} / {{ seriesLength }} 局</span>
      <button type="button" class="link-btn" :disabled="!canUndo" @click="undoLastStep">撤销上一步</button>
      <button type="button" class="link-btn" @click="resetCurrentGame">重置本局</button>
      <button type="button" class="link-btn" @click="resetSeries">重置系列赛</button>
      <button v-if="isGameComplete && !seriesFinished" type="button" class="link-btn" @click="endSeriesEarly">
        提前结束系列赛
      </button>
    </div>

    <div v-if="games.length > 1" class="bp-game-tabs">
      <button
        v-for="(_, i) in games"
        :key="i"
        type="button"
        class="bp-game-tab"
        :class="{ active: displayedGameIndices.includes(i), live: currentGameIndex === i }"
        :disabled="i === currentGameIndex"
        :title="i === currentGameIndex ? '当前进行中的这一局始终显示' : '勾选后可以和当前局对照查看'"
        @click="toggleGameVisibility(i)"
      >
        第 {{ i + 1 }} 局{{ i === currentGameIndex ? '（进行中）' : '' }}
      </button>
    </div>

    <div class="bp-turn-indicator" :class="{ done: isGameComplete }">
      <template v-if="currentStep">
        轮到 <strong :class="'side-' + currentStep.side">{{ currentStep.side === 'blue' ? '蓝色方' : '红色方' }}</strong>
        {{ currentStep.type === 'ban' ? 'Ban' : 'Pick' }}（{{ currentStep.label }}）
      </template>
      <template v-else-if="seriesFinished"> 系列赛已完成全部 {{ seriesLength }} 局 </template>
      <template v-else>
        本局 BP 结束
        <button type="button" class="primary small" @click="startNextGame">进入下一局</button>
      </template>
    </div>

    <div v-for="i in displayedGameIndices" :key="i" class="bp-board-wrap">
      <div v-if="displayedGameIndices.length > 1" class="bp-board-label">
        第 {{ i + 1 }} 局{{ i === currentGameIndex ? '（进行中）' : '' }}
      </div>
      <div class="bp-board">
        <div class="bp-side">
          <h3 class="side-blue">蓝色方</h3>
          <div class="bp-slot-row">
            <div
              v-for="({ step, i: si }, idx) in blueBanSlots"
              :key="'bb' + idx"
              class="bp-slot ban"
              :class="{ active: i === currentGameIndex && currentStepIndex === si }"
            >
              <img v-if="games[i].steps[si] && championIconUrl(games[i].steps[si]!.icon)" :src="championIconUrl(games[i].steps[si]!.icon)!" :alt="games[i].steps[si]!.name" />
              <span v-else-if="games[i].steps[si]" class="bp-slot-noicon">{{ games[i].steps[si]!.name }}</span>
              <span v-else class="bp-slot-label">{{ step.label }}</span>
            </div>
          </div>
          <div class="bp-slot-row picks">
            <div
              v-for="({ step, i: si }, idx) in bluePickSlots"
              :key="'bp' + idx"
              class="bp-slot pick"
              :class="{ active: i === currentGameIndex && currentStepIndex === si }"
            >
              <img v-if="games[i].steps[si] && championIconUrl(games[i].steps[si]!.icon)" :src="championIconUrl(games[i].steps[si]!.icon)!" :alt="games[i].steps[si]!.name" />
              <span v-else-if="games[i].steps[si]" class="bp-slot-noicon">{{ games[i].steps[si]!.name }}</span>
              <span v-else class="bp-slot-label">{{ step.label }}</span>
              <div v-if="games[i].steps[si]" class="bp-slot-name">{{ games[i].steps[si]!.name }}</div>
            </div>
          </div>
        </div>

        <div class="bp-side">
          <h3 class="side-red">红色方</h3>
          <div class="bp-slot-row">
            <div
              v-for="({ step, i: si }, idx) in redBanSlots"
              :key="'rb' + idx"
              class="bp-slot ban"
              :class="{ active: i === currentGameIndex && currentStepIndex === si }"
            >
              <img v-if="games[i].steps[si] && championIconUrl(games[i].steps[si]!.icon)" :src="championIconUrl(games[i].steps[si]!.icon)!" :alt="games[i].steps[si]!.name" />
              <span v-else-if="games[i].steps[si]" class="bp-slot-noicon">{{ games[i].steps[si]!.name }}</span>
              <span v-else class="bp-slot-label">{{ step.label }}</span>
            </div>
          </div>
          <div class="bp-slot-row picks">
            <div
              v-for="({ step, i: si }, idx) in redPickSlots"
              :key="'rp' + idx"
              class="bp-slot pick"
              :class="{ active: i === currentGameIndex && currentStepIndex === si }"
            >
              <img v-if="games[i].steps[si] && championIconUrl(games[i].steps[si]!.icon)" :src="championIconUrl(games[i].steps[si]!.icon)!" :alt="games[i].steps[si]!.name" />
              <span v-else-if="games[i].steps[si]" class="bp-slot-noicon">{{ games[i].steps[si]!.name }}</span>
              <span v-else class="bp-slot-label">{{ step.label }}</span>
              <div v-if="games[i].steps[si]" class="bp-slot-name">{{ games[i].steps[si]!.name }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!isGameComplete" class="bp-picker">
      <div class="bp-picker-toolbar">
        <div v-if="availableLanes.length" class="bp-lane-filter">
          <button type="button" class="bp-lane-chip" :class="{ active: activeLane === null }" @click="activeLane = null">
            全部
          </button>
          <button
            v-for="lane in availableLanes"
            :key="lane"
            type="button"
            class="bp-lane-chip"
            :class="{ active: activeLane === lane }"
            @click="activeLane = lane"
          >
            {{ lane }}
          </button>
        </div>
        <div class="bp-visibility-toggle">
          <label class="radio-option">
            <input v-model="poolVisibility" type="radio" value="all" />
            全部显示
          </label>
          <label class="radio-option">
            <input v-model="poolVisibility" type="radio" value="selectable" />
            只显示可选
          </label>
        </div>
      </div>
      <div class="bp-picker-toolbar">
        <div class="bp-visibility-toggle">
          <label class="radio-option">
            <input v-model="sortMode" type="radio" value="bpRate" />
            按 BP率 排序
          </label>
          <label class="radio-option">
            <input v-model="sortMode" type="radio" value="winRate" />
            按胜率排序
          </label>
        </div>
        <label v-if="sortMode === 'winRate'" class="bp-threshold-input">
          BP率 ≥ <input v-model.number="winRateBpThreshold" type="number" min="0" max="100" step="0.1" /> % 才参与排序
        </label>
      </div>
      <input v-model="search" type="text" placeholder="搜索英雄（中文名 / 英文名 / 拼音）..." class="bp-search" />
      <div class="bp-champion-grid">
        <button
          v-for="c in filteredChampions"
          :key="c.id"
          type="button"
          class="bp-champion"
          :disabled="!isSelectable(c)"
          :title="isSelectable(c) ? c.name : unselectableReason(c)"
          @click="selectChampion(c)"
        >
          <img v-if="championIconUrl(c.icon)" :src="championIconUrl(c.icon)!" :alt="c.name" />
          <span v-else class="bp-champion-noicon">{{ c.name }}</span>
          <span class="bp-champion-name">{{ c.name }}</span>
          <span v-if="activeRateLabel(c)" class="bp-champion-rate">{{ activeRateLabel(c) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
