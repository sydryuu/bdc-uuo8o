import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/db'
import { initSettings, updateSettings } from '../../lib/settings'
import { makeScheduler, Rating } from '../scheduler'
import { applyGrade, createSession } from '../session'
import { addExtraNew, loadTodayPlan, pickNewWords, saveAnswer, todaySummary } from '../store'

// 用构建好的真实词书文件代替网络请求
const PUBLIC = join(import.meta.dirname, '../../../public')
vi.stubGlobal('fetch', async (url: string) => {
  const path = join(PUBLIC, url.replace(/^\//, ''))
  return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(path, 'utf8')) }
})

const s = makeScheduler({ fuzz: false })
const T = new Date(2026, 9, 6, 10, 0, 0).getTime()

beforeEach(async () => {
  await db.delete()
  await db.open()
  await initSettings()
})

describe('挑新词', () => {
  it('从当前词书按顺序取', async () => {
    const picked = await pickNewWords(3, 'pep-3a')
    expect(picked).toEqual([
      { bookId: 'pep-3a', wordId: 'ruler' },
      { bookId: 'pep-3a', wordId: 'pencil' },
      { bookId: 'pep-3a', wordId: 'eraser' },
    ])
  })
  it('当前词书学完自动接下一本，并跳过已学过的词', async () => {
    const all3a = await pickNewWords(1000, 'pep-3a')
    const n3a = all3a.filter((p) => p.bookId === 'pep-3a').length
    expect(n3a).toBe(64)
    expect(all3a.some((p) => p.bookId === 'pep-3b')).toBe(true)
    // 每个词只出现一次（多本书共有的词不会重复）
    expect(new Set(all3a.map((p) => p.wordId)).size).toBe(all3a.length)
  })
})

describe('一天的完整流程', () => {
  it('学 3 个新词 → 全部毕业 → 记录写入 → 今日完成', async () => {
    await updateSettings({ dailyNew: 3 })
    const plan = await loadTodayPlan(T)
    expect(plan.news.map((n) => n.wordId)).toEqual(['ruler', 'pencil', 'eraser'])
    expect(plan.pools.get('pep-3a')!.length).toBe(64)

    let sess = createSession({ reviews: plan.reviews, news: plan.news, dayEnd: plan.dayEnd })
    let now = T
    let first = true
    for (let i = 0; i < 20 && sess.items.length; i++) {
      const { pickNext } = await import('../session')
      const item = pickNext(sess, now)!
      // ruler 第一次答错
      const correct = !(item.wordId === 'ruler' && first)
      if (item.wordId === 'ruler') first = false
      const grade = correct ? Rating.Good : Rating.Again
      const r = applyGrade(sess, item.cardId, grade, now, s)
      await saveAnswer({ item, grade, record: r.record, wasNew: r.wasNew, quiz: 'en2cn', correct, ms: 3000, now })
      sess = r.session
      now += 60_000
    }
    expect(sess.items).toHaveLength(0)

    const sum = await todaySummary(now)
    expect(sum.daily.newCount).toBe(3)
    expect(sum.daily.wrong).toBe(1)
    // 新词的短间隔重复不算复习
    expect(sum.daily.reviewCount).toBe(0)
    expect(sum.newLeft).toBe(0)
    expect(sum.reviewDue).toBe(0)
    expect(await db.cards.count()).toBe(3)

    const m = await db.mistakes.get('w:ruler')
    expect(m).toMatchObject({ wrongCount: 1, active: true, byType: { en2cn: 1 } })
    expect(m!.correctStreak).toBeGreaterThan(0)

    // "再学 2 个"
    await addExtraNew(now, 2)
    expect((await todaySummary(now)).newLeft).toBe(2)
    expect((await loadTodayPlan(now)).news.map((n) => n.wordId)).toEqual(['crayon', 'bag'])
  })

  it('错题连续答对 3 次自动移出错题本', async () => {
    await updateSettings({ dailyNew: 1 })
    const plan = await loadTodayPlan(T)
    const item = plan.news[0]
    let sess = createSession({ reviews: [], news: [item], dayEnd: plan.dayEnd })
    const answer = async (correct: boolean, now: number) => {
      const grade = correct ? Rating.Good : Rating.Again
      const r = applyGrade(sess, item.cardId, grade, now, s)
      await saveAnswer({ item: sess.items[0] ?? item, grade, record: r.record, wasNew: r.wasNew, quiz: 'cn2en', correct, ms: 1000, now })
      sess = r.session
    }
    await answer(false, T)
    await answer(true, T + 60_000)
    await answer(true, T + 120_000)
    expect((await db.mistakes.get(item.cardId))!.active).toBe(true)
    // 第 3 次答对（这里直接复用卡片继续评分）
    sess = createSession({ reviews: [{ ...item, card: sess.items[0]?.card ?? null }], news: [], dayEnd: plan.dayEnd })
    await answer(true, T + 3 * 86_400_000)
    expect((await db.mistakes.get(item.cardId))!.active).toBe(false)
  })
})
