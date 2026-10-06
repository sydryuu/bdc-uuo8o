import { describe, expect, it } from 'vitest'
import { dayEnd, dayKey, formatInterval } from '../../lib/date'
import { fromFsrs, makeScheduler, previewIntervals, rate, Rating, State, toFsrs } from '../scheduler'

const s = makeScheduler({ fuzz: false })
// 2026-10-06 10:00 本地时间
const T = new Date(2026, 9, 6, 10, 0, 0).getTime()
const MIN = 60_000
const DAY = 86_400_000

describe('学习日（凌晨 4 点切日）', () => {
  it('凌晨 3 点算前一天，4 点起算当天', () => {
    expect(dayKey(new Date(2026, 9, 6, 3, 59).getTime())).toBe('2026-10-05')
    expect(dayKey(new Date(2026, 9, 6, 4, 0).getTime())).toBe('2026-10-06')
    expect(dayKey(new Date(2026, 9, 6, 23, 59).getTime())).toBe('2026-10-06')
  })
  it('dayEnd 是下一个凌晨 4 点', () => {
    expect(dayEnd(T)).toBe(new Date(2026, 9, 7, 4, 0).getTime())
    expect(dayEnd(new Date(2026, 9, 6, 2, 0).getTime())).toBe(new Date(2026, 9, 6, 4, 0).getTime())
    expect(dayEnd(new Date(2026, 9, 6, 4, 0).getTime())).toBe(new Date(2026, 9, 7, 4, 0).getTime())
  })
})

describe('formatInterval', () => {
  it.each([
    [30_000, '1分钟'],
    [10 * MIN, '10分钟'],
    [3 * 60 * MIN, '3小时'],
    [3 * DAY, '3天'],
    [45 * DAY, '1.5个月'],
    [800 * DAY, '2.2年'],
  ])('%d ms → %s', (ms, text) => expect(formatInterval(ms)).toBe(text))
})

describe('FSRS 调度', () => {
  it('新词按钮间隔：忘记 1 分钟、认识 10 分钟、简单按天', () => {
    const p = previewIntervals(null, T, s)
    expect(p[Rating.Again]).toBe('1分钟')
    expect(p[Rating.Good]).toBe('10分钟')
    expect(p[Rating.Easy]).toMatch(/天$/)
  })

  it('新词连续两次"认识"后毕业，进入复习且至少 1 天后到期', () => {
    const r1 = rate(null, Rating.Good, T, s)
    expect(r1.card.state).toBe(State.Learning)
    expect(r1.card.due.getTime() - T).toBe(10 * MIN)
    const t2 = T + 10 * MIN
    const r2 = rate(r1.card, Rating.Good, t2, s)
    expect(r2.card.state).toBe(State.Review)
    expect(r2.card.due.getTime() - t2).toBeGreaterThanOrEqual(DAY)
  })

  it('复习时忘记：进入重学，10 分钟后再来，遗忘次数 +1', () => {
    let c = rate(null, Rating.Easy, T, s).card
    expect(c.state).toBe(State.Review)
    const t = c.due.getTime()
    const r = rate(c, Rating.Again, t, s)
    expect(r.card.state).toBe(State.Relearning)
    expect(r.card.lapses).toBe(1)
    expect(r.card.due.getTime() - t).toBe(10 * MIN)
  })

  it('评分越高下次间隔越长', () => {
    const c = rate(null, Rating.Easy, T, s).card
    const t = c.due.getTime()
    const due = ([Rating.Hard, Rating.Good, Rating.Easy] as const).map((g) => rate(c, g, t, s).card.due.getTime())
    expect(due[0]).toBeLessThan(due[1])
    expect(due[1]).toBeLessThan(due[2])
  })

  it('数据库行和 ts-fsrs Card 来回转换不丢信息', () => {
    const c = rate(null, Rating.Good, T, s).card
    const row = fromFsrs(c, { id: 'w:ruler', kind: 'word', refId: 'ruler', bookId: 'pep-3a', createdAt: T })
    expect(typeof row.due).toBe('number')
    expect(toFsrs(row)).toEqual(c)
  })
})
