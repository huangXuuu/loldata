import { HERO_POSITION_MAPPING } from './config'
import { toNumeric } from './dataProcessor'
import type { RawRecord } from './api'
import type { Row } from './types'

/** Mirrors the hero_list build step at the top of GetNewAllData.py (raw values, no percent formatting). */
export function buildOldHeroRows(rawHeroes: RawRecord[]): Row[] {
  return rawHeroes.map((hero) => {
    const location = Array.isArray(hero.heroLocation) && hero.heroLocation.length > 0 ? hero.heroLocation[0] : ''
    const mapped = HERO_POSITION_MAPPING[location] ?? location
    return {
      英雄名: hero.heroCnName,
      英雄称号: hero.heroCnTitle,
      BP率: hero.bPRate,
      BP数: hero.bpCount,
      禁用率: hero.banRate,
      禁用数: hero.banCount,
      选取率: hero.pickRate,
      出场次数: hero.pickCount,
      胜率: hero.winningRate,
      胜场: hero.winningCount,
      最多选取选手: hero.mostUsePlayerName,
      英雄分路: mapped,
    }
  })
}

const EXCLUDED_DIFF_COLUMNS = new Set(['英雄名', '英雄称号', '英雄分路', '最多选取选手'])

/** Strict numeric coercion mirroring pandas.to_numeric(errors='coerce'): "12.3%" -> NaN, "12.3" -> 12.3. */
function toNumericStrict(value: unknown): number {
  if (typeof value === 'number') return value
  if (value == null || value === '') return NaN
  const s = String(value).trim()
  if (s === '') return NaN
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

export interface VersionDiffResult {
  /** 计算后的英雄数据: numeric columns diffed, 胜率 recomputed as a percent string. */
  resultRows: Row[]
  /** Same rows, but with 胜率 as a 0-1 fraction, used for the win-rate category sheets below. */
  英雄选取次数大于10的榜单: Row[]
  英雄版本答案: Row[]
  英雄中规中矩: Row[]
  英雄版本陷阱: Row[]
}

/** Mirrors the diff + re-categorization logic in GetNewAllData.py. */
export function computeVersionDiff(newHeroRows: Row[], oldHeroRows: Row[]): VersionDiffResult {
  if (newHeroRows.length === 0) {
    return { resultRows: [], 英雄选取次数大于10的榜单: [], 英雄版本答案: [], 英雄中规中矩: [], 英雄版本陷阱: [] }
  }

  const newCols = new Set(Object.keys(newHeroRows[0]))
  const oldCols = new Set(oldHeroRows.length ? Object.keys(oldHeroRows[0]) : [])
  const numericCols = [...newCols].filter((c) => oldCols.has(c) && !EXCLUDED_DIFF_COLUMNS.has(c))

  const oldByName = new Map<string, Row>()
  for (const row of oldHeroRows) oldByName.set(String(row['英雄名']), row)

  const resultRows: Row[] = newHeroRows.map((newRow) => {
    const oldRow = oldByName.get(String(newRow['英雄名']))
    const result: Row = { ...newRow }

    for (const col of numericCols) {
      const newVal = toNumericStrict(newRow[col])
      const oldVal = oldRow ? toNumericStrict(oldRow[col]) : NaN
      const oldFilled = Number.isNaN(oldVal) ? 0 : oldVal
      result[col] = Number.isNaN(newVal) ? '' : newVal - oldFilled
    }

    const pickCount = toNumeric(result['出场次数'])
    const winCount = toNumeric(result['胜场'])
    const rate = pickCount ? winCount / pickCount : 0
    result['胜率'] = `${(rate * 100).toFixed(2)}%`

    return result
  })

  const decimalRows: Row[] = resultRows.map((row) => ({
    ...row,
    胜率: parseFloat(String(row['胜率']).replace('%', '')) / 100,
  }))

  const moreThan10 = decimalRows.filter((r) => toNumeric(r['出场次数']) > 10)
  const answer = decimalRows.filter((r) => toNumeric(r['胜率']) >= 0.53)
  const mediocre = moreThan10.filter((r) => toNumeric(r['胜率']) >= 0.43 && toNumeric(r['胜率']) < 0.53)
  const trap = moreThan10.filter((r) => toNumeric(r['胜率']) < 0.43)

  return {
    resultRows,
    英雄选取次数大于10的榜单: moreThan10,
    英雄版本答案: answer,
    英雄中规中矩: mediocre,
    英雄版本陷阱: trap,
  }
}
