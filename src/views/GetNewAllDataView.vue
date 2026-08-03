<script setup lang="ts">
import { ref } from 'vue'
import ExcelJS from 'exceljs'
import { buildOldHeroRows, computeVersionDiff } from '../versionDiff'
import { addPlainSheet, downloadWorkbook, readSheetAsTable, readWorkbookFromFile } from '../utils/excel'

const jsonFile = ref<File | null>(null)
const excelFile = ref<File | null>(null)
const running = ref(false)
const logs = ref<{ text: string; error?: boolean }[]>([])

function log(text: string, error = false) {
  logs.value.push({ text: `[${new Date().toLocaleTimeString()}] ${text}`, error })
}

function onJsonChange(e: Event) {
  jsonFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

function onExcelChange(e: Event) {
  excelFile.value = (e.target as HTMLInputElement).files?.[0] ?? null
}

async function run() {
  if (!jsonFile.value || !excelFile.value) {
    log('请先选择旧版英雄 JSON 文件和旧版 Excel 文件', true)
    return
  }

  logs.value = []
  running.value = true
  try {
    log('正在解析旧版英雄 JSON...')
    const jsonText = await jsonFile.value.text()
    const parsed = JSON.parse(jsonText)
    const oldHeroRaw = parsed?.data?.list ?? []
    const oldHeroRows = buildOldHeroRows(oldHeroRaw)
    log(`旧版英雄数据 ${oldHeroRows.length} 条`)

    log('正在读取 Excel 文件...')
    const sourceWorkbook = await readWorkbookFromFile(excelFile.value)
    const heroSheet = sourceWorkbook.getWorksheet('英雄数据')
    if (!heroSheet) throw new Error('上传的 Excel 中找不到「英雄数据」工作表')

    const { rows: newHeroRows } = readSheetAsTable(heroSheet)
    log(`当前英雄数据 ${newHeroRows.length} 条`)

    const otherSheets: { name: string; columns: string[]; rows: ReturnType<typeof readSheetAsTable>['rows'] }[] = []
    sourceWorkbook.eachSheet((sheet) => {
      if (sheet.name === '英雄数据') return
      const table = readSheetAsTable(sheet)
      otherSheets.push({ name: sheet.name, columns: table.columns, rows: table.rows })
    })

    log('正在计算版本差异...')
    const diff = computeVersionDiff(newHeroRows, oldHeroRows)

    const outWorkbook = new ExcelJS.Workbook()
    for (const sheet of otherSheets) {
      addPlainSheet(outWorkbook, sheet.name, sheet.columns, sheet.rows)
    }
    const heroColumns = Object.keys(newHeroRows[0] ?? {})
    addPlainSheet(outWorkbook, '英雄数据', heroColumns, newHeroRows)
    addPlainSheet(outWorkbook, '旧英雄数据', Object.keys(oldHeroRows[0] ?? {}), oldHeroRows)

    const resultColumns = Object.keys(diff.resultRows[0] ?? {})
    addPlainSheet(outWorkbook, '计算后的英雄数据', resultColumns, diff.resultRows)
    addPlainSheet(outWorkbook, '英雄选取次数大于10的榜单', resultColumns, diff.英雄选取次数大于10的榜单)
    addPlainSheet(outWorkbook, '英雄版本答案', resultColumns, diff.英雄版本答案)
    addPlainSheet(outWorkbook, '英雄中规中矩', resultColumns, diff.英雄中规中矩)
    addPlainSheet(outWorkbook, '英雄版本陷阱', resultColumns, diff.英雄版本陷阱)

    log('正在生成 Excel 文件...')
    await downloadWorkbook(outWorkbook, '综合数据_精简版_new.xlsx')
    log('完成，已触发文件下载。')
  } catch (err) {
    console.error(err)
    log(`出错: ${err instanceof Error ? err.message : String(err)}`, true)
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div class="card">
    <h2>版本数据对比</h2>
    <p class="desc">对比旧版英雄 JSON 快照与最新导出的 Excel，计算各项数据的版本间差值，并重新划分英雄分类。</p>

    <div class="file-field">
      <label>旧版英雄数据 JSON 文件 (原 text.txt)</label>
      <input type="file" accept=".json,.txt" @change="onJsonChange" />
    </div>
    <div class="file-field">
      <label>最新 Excel 文件 (需包含「英雄数据」工作表)</label>
      <input type="file" accept=".xlsx" @change="onExcelChange" />
    </div>

    <button class="primary" :disabled="running" @click="run">
      {{ running ? '处理中...' : '生成对比 Excel' }}
    </button>

    <div v-if="logs.length" class="log-box">
      <div v-for="(l, i) in logs" :key="i" class="log-line" :class="{ error: l.error }">{{ l.text }}</div>
    </div>
  </div>
</template>
