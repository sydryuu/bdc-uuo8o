import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/db'
import { initSettings, updateSettings } from '../../lib/settings'
import { makeScheduler, Rating, State } from '../scheduler'
import { applyGrade, createSession } from '../session'
import {
  addExtraNew,
  addPhraseCard,
  loadMistakePlan,
  loadTodayPlan,
  mistakeViews,
  pickNewWords,
  removePhraseCard,
  saveAnswer,
  savePractice,
  setMistakeActive,
  todaySummary,
} from '../store'

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

describe('短语卡', () => {
  it('加入后今天就作为新卡出现，答完按 FSRS 调度并记录所属单词', async () => {
    await updateSettings({ dailyNew: 0 })
    await pickNewWords(1, 'pep-3a') // 触发词书导入
    const pencil = (await db.words.get('pencil'))!
    const phrase = pencil.phrases.find((p) => p.id === 'pencil case')!
    await addPhraseCard(pencil, phrase, 'pep-3a', T)
    await addPhraseCard(pencil, phrase, 'pep-3a', T) // 重复加入无效

    const plan = await loadTodayPlan(T)
    expect(plan.news).toHaveLength(0)
    expect(plan.reviews.map((i) => [i.cardId, i.wordId, i.phraseId, i.card!.state])).toEqual([['p:pencil case', 'pencil', 'pencil case', State.New]])

    const item = plan.reviews[0]
    const sess = createSession({ reviews: plan.reviews, news: [], dayEnd: plan.dayEnd })
    const r = applyGrade(sess, item.cardId, Rating.Good, T, s)
    await saveAnswer({ item, grade: Rating.Good, record: r.record, wasNew: r.wasNew, quiz: 'cn2en', correct: true, ms: 1000, now: T })
    const row = (await db.cards.get('p:pencil case'))!
    expect(row).toMatchObject({ kind: 'phrase', refId: 'pencil case', wordId: 'pencil', state: State.Learning })
    // 短语不占每日新词名额，也不算复习
    expect((await todaySummary(T)).daily).toMatchObject({ newCount: 0, reviewCount: 0, correct: 1 })
  })

  it('还没学的短语卡可以移除，学过的保留', async () => {
    await pickNewWords(1, 'pep-3a')
    const pencil = (await db.words.get('pencil'))!
    const [p1, p2] = pencil.phrases
    await addPhraseCard(pencil, p1, 'pep-3a', T)
    await addPhraseCard(pencil, p2, 'pep-3a', T)
    await db.cards.update(`p:${p2.id}`, { state: State.Review })
    await removePhraseCard(p1.id)
    await removePhraseCard(p2.id)
    expect(await db.cards.get(`p:${p1.id}`)).toBeUndefined()
    expect(await db.cards.get(`p:${p2.id}`)).toBeDefined()
  })
})

describe('错题本', () => {
  async function learnWithMistakes() {
    await updateSettings({ dailyNew: 3 })
    const plan = await loadTodayPlan(T)
    let sess = createSession({ reviews: [], news: plan.news, dayEnd: plan.dayEnd })
    // ruler 错 2 次，pencil 错 1 次，eraser 不错
    const wrongs: Record<string, number> = { ruler: 2, pencil: 1 }
    let now = T
    const { pickNext } = await import('../session')
    for (let i = 0; i < 30 && sess.items.length; i++) {
      const item = pickNext(sess, now)!
      const correct = !(wrongs[item.wordId]-- > 0)
      const grade = correct ? Rating.Good : Rating.Again
      const r = applyGrade(sess, item.cardId, grade, now, s)
      await saveAnswer({ item, grade, record: r.record, wasNew: r.wasNew, quiz: 'listen', correct, ms: 1000, now })
      sess = r.session
      now += 60_000
    }
  }

  it('错题练习按最常错排序；练习不改变 FSRS 卡片', async () => {
    await learnWithMistakes()
    const plan = await loadMistakePlan(T)
    expect(plan.reviews.map((i) => i.wordId)).toEqual(['ruler', 'pencil'])

    const before = await db.cards.get('w:ruler')
    await savePractice({ cardId: 'w:ruler', quiz: 'spell', correct: false, ms: 1000, now: T + 1 })
    expect(await db.cards.get('w:ruler')).toEqual(before)
    expect(await db.mistakes.get('w:ruler')).toMatchObject({ wrongCount: 3, correctStreak: 0, byType: { listen: 2, spell: 1 } })

    for (let i = 0; i < 3; i++) await savePractice({ cardId: 'w:ruler', quiz: 'en2cn', correct: true, ms: 1000, now: T + 2 })
    expect((await db.mistakes.get('w:ruler'))!.active).toBe(false)
    expect((await loadMistakePlan(T)).reviews.map((i) => i.wordId)).toEqual(['pencil'])
  })

  it('手动移出和加回；列表带上单词和释义', async () => {
    await learnWithMistakes()
    await setMistakeActive('w:pencil', false)
    let views = await mistakeViews()
    expect(views.find((v) => v.cardId === 'w:pencil')).toMatchObject({ active: false, title: 'pencil', meaning: '铅笔', kind: 'word' })
    await setMistakeActive('w:pencil', true)
    views = await mistakeViews()
    expect(views.find((v) => v.cardId === 'w:pencil')).toMatchObject({ active: true, correctStreak: 0 })
  })
})
