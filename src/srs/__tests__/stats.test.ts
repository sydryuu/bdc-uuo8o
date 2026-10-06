import { describe, expect, it } from 'vitest'
import { emptyDaily, type DailyRow } from '../../db/db'
import { answerPractice, createPractice, currentPractice } from '../practice'
import { State, type CardRow } from '../scheduler'
import type { SessionItem } from '../session'
import { cardStats, forecast, heatLevel, heatmap, recentDays, shiftDay, streak } from '../stats'

const day = (d: string, correct = 1, extra: Partial<DailyRow> = {}): DailyRow => ({ ...emptyDaily(d), correct, ...extra })

describe('shiftDay', () => {
  it('跨月跨年', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2026-10-06', 0)).toBe('2026-10-06')
  })
})

describe('连续打卡（学了就算）', () => {
  const T = '2026-10-06'
  it('今天学了：从今天往回数', () => {
    expect(streak([day('2026-10-04'), day('2026-10-05'), day(T)], T)).toEqual({ current: 3, longest: 3, todayDone: true })
  })
  it('今天还没学：昨天的连续记录保留', () => {
    expect(streak([day('2026-10-04'), day('2026-10-05')], T)).toMatchObject({ current: 2, todayDone: false })
  })
  it('中间断了一天就重新算；最长记录单独保留', () => {
    const d = [day('2026-09-01'), day('2026-09-02'), day('2026-09-03'), day('2026-09-04'), day('2026-10-05'), day(T)]
    expect(streak(d, T)).toEqual({ current: 2, longest: 4, todayDone: true })
  })
  it('昨天和今天都没学：断签', () => {
    expect(streak([day('2026-10-04')], T).current).toBe(0)
  })
  it('只调了设置、一题没答的日子不算', () => {
    expect(streak([day(T, 0, { extraNew: 5 })], T)).toMatchObject({ current: 0, todayDone: false })
  })
  it('答错也算学过', () => {
    expect(streak([day(T, 0, { wrong: 3 })], T).todayDone).toBe(true)
  })
})

describe('学习日历', () => {
  it('17 列 × 7 天，最后一列是本周，周一开头，今天之后标记为未来', () => {
    const cols = heatmap([day('2026-10-06', 12)], '2026-10-06') // 2026-10-06 是周二
    expect(cols).toHaveLength(17)
    expect(cols.every((c) => c.length === 7)).toBe(true)
    const last = cols[16]
    expect(last[0].day).toBe('2026-10-05') // 周一
    expect(last[1]).toEqual({ day: '2026-10-06', count: 12, future: false })
    expect(last[2].future).toBe(true)
    expect(cols[15][0].day).toBe('2026-09-28')
  })
  it('分档', () => {
    expect([0, 1, 9, 10, 29, 30, 59, 60, 500].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
})

describe('复习预测', () => {
  const now = new Date(2026, 9, 6, 10).getTime()
  const at = (d: number, h: number) => ({ due: new Date(2026, 9, d, h).getTime() })
  it('今天（含已过期）、明天……按凌晨 4 点切日', () => {
    const cards = [at(1, 9), at(6, 23), at(7, 3), at(7, 5), at(8, 10), at(13, 5), at(20, 5)]
    // 10-07 03:00 仍算今天；10-13 05:00 是第 7 天（超出 7 天窗口）
    expect(forecast(cards, now)).toEqual([3, 1, 1, 0, 0, 0, 0])
  })
})

describe('学习统计', () => {
  const row = (kind: 'word' | 'phrase', state: State, scheduled_days: number) => ({ kind, state, scheduled_days }) as CardRow
  it('已学、已掌握（间隔 ≥21 天）、短语分开统计', () => {
    const cards = [row('word', State.Review, 30), row('word', State.Review, 21), row('word', State.Review, 5), row('word', State.Learning, 0), row('phrase', State.Review, 40)]
    expect(cardStats(cards)).toEqual({ learned: 4, mastered: 2, phrases: 1 })
  })
  it('recentDays 补齐没学的日子，从旧到新', () => {
    const r = recentDays([day('2026-10-05', 3, { newCount: 2, reviewCount: 1, wrong: 1 })], '2026-10-06', 3)
    expect(r).toEqual([
      { day: '2026-10-04', newCount: 0, reviewCount: 0, answers: 0 },
      { day: '2026-10-05', newCount: 2, reviewCount: 1, answers: 4 },
      { day: '2026-10-06', newCount: 0, reviewCount: 0, answers: 0 },
    ])
  })
})

describe('错题练习队列', () => {
  const item = (id: string): SessionItem => ({ cardId: id, wordId: id, bookId: 'b', card: null, encounters: 0 })
  it('答对移出；答错隔 3 题再出；全部答对后结束', () => {
    let p = createPractice(['a', 'b', 'c', 'd', 'e'].map(item))
    p = answerPractice(p, false) // a 错
    expect(p.queue.map((i) => i.cardId)).toEqual(['b', 'c', 'd', 'a', 'e'])
    expect(p.queue[3].encounters).toBe(1)
    for (let i = 0; i < 3; i++) p = answerPractice(p, true)
    expect(currentPractice(p)!.cardId).toBe('a')
    p = answerPractice(p, true)
    p = answerPractice(p, true)
    expect(currentPractice(p)).toBeNull()
    expect(p).toMatchObject({ total: 5, cleared: 5 })
  })
  it('只剩一题答错时还是它', () => {
    let p = createPractice([item('a')])
    p = answerPractice(p, false)
    expect(currentPractice(p)!.cardId).toBe('a')
  })
})
