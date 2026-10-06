// 统计：纯函数，输入数据库行，输出页面要画的数据
import { DAY_START_HOUR, dayEnd, dayKey } from '../lib/date'
import type { DailyRow } from '../db/db'
import { State, type CardRow } from './scheduler'

const DAY = 86_400_000

/** "2026-10-06" → 那天中午的时间戳（避开切日边界） */
const keyToTime = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}

export const shiftDay = (key: string, n: number) => dayKey(keyToTime(key) + n * DAY + DAY_START_HOUR * 3600_000)

export const answers = (d?: Pick<DailyRow, 'correct' | 'wrong'>) => (d ? d.correct + d.wrong : 0)

/**
 * 连续打卡：当天答过至少 1 题就算。
 * 今天还没学时，昨天之前的连续记录仍然保留（今天学了就接上）。
 */
export function streak(daily: DailyRow[], today: string): { current: number; longest: number; todayDone: boolean } {
  const active = new Set(daily.filter((d) => answers(d) > 0).map((d) => d.day))
  const todayDone = active.has(today)
  let current = 0
  for (let k = todayDone ? today : shiftDay(today, -1); active.has(k); k = shiftDay(k, -1)) current++

  let longest = 0
  for (const day of active) {
    if (active.has(shiftDay(day, -1))) continue // 只从每段的第一天开始数
    let n = 0
    for (let k = day; active.has(k); k = shiftDay(k, 1)) n++
    longest = Math.max(longest, n)
  }
  return { current, longest, todayDone }
}

export interface HeatCell {
  day: string
  count: number
  future: boolean
}

/** 学习日历：最近 weeks 周，按列（周一到周日）排列，最后一列是本周 */
export function heatmap(daily: DailyRow[], today: string, weeks = 17): HeatCell[][] {
  const byDay = new Map(daily.map((d) => [d.day, answers(d)]))
  const weekday = (new Date(keyToTime(today)).getDay() + 6) % 7 // 周一=0
  const start = shiftDay(today, -weekday - (weeks - 1) * 7)
  const cols: HeatCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = []
    for (let i = 0; i < 7; i++) {
      const day = shiftDay(start, w * 7 + i)
      col.push({ day, count: byDay.get(day) ?? 0, future: day > today })
    }
    cols.push(col)
  }
  return cols
}

/** 热力图分 5 档：0 = 没学，1–4 按答题数 */
export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (count < 10) return 1
  if (count < 30) return 2
  if (count < 60) return 3
  return 4
}

/** 未来 days 天每天到期的卡片数。第 0 天 = 今天（含已经过期的） */
export function forecast(cards: Pick<CardRow, 'due'>[], now: number, days = 7): number[] {
  const end0 = dayEnd(now)
  const out = new Array(days).fill(0)
  for (const c of cards) {
    const i = c.due < end0 ? 0 : Math.floor((c.due - end0) / DAY) + 1
    if (i < days) out[i]++
  }
  return out
}

/** 已掌握：复习间隔 ≥21 天的单词（和 Anki 的"成熟"标准一致） */
export const MATURE_DAYS = 21

export function cardStats(cards: CardRow[]) {
  const words = cards.filter((c) => c.kind === 'word')
  return {
    learned: words.length,
    mastered: words.filter((c) => c.state === State.Review && c.scheduled_days >= MATURE_DAYS).length,
    phrases: cards.filter((c) => c.kind === 'phrase').length,
  }
}

/** 最近 n 天的每日学习量（从旧到新） */
export function recentDays(daily: DailyRow[], today: string, n = 14) {
  const byDay = new Map(daily.map((d) => [d.day, d]))
  return Array.from({ length: n }, (_, i) => {
    const day = shiftDay(today, i - n + 1)
    const d = byDay.get(day)
    return { day, newCount: d?.newCount ?? 0, reviewCount: d?.reviewCount ?? 0, answers: answers(d) }
  })
}
