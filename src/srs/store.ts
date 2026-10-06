// 学习数据读写：把纯逻辑（session.ts）和数据库连起来
import { bookWordIds, ensureBook, loadIndex } from '../db/books'
import { db, emptyDaily, type DailyRow, type QuizType } from '../db/db'
import { dayEnd, dayKey } from '../lib/date'
import { getSettings } from '../lib/settings'
import type { Word } from '../types/vocab'
import { fromFsrs, toFsrs, wordCardId, type CardRow, type Grade, Rating, type RecordLogItem, State } from './scheduler'
import type { SessionItem } from './session'

export const getDaily = async (now: number): Promise<DailyRow> => (await db.daily.get(dayKey(now))) ?? emptyDaily(dayKey(now))

/** 今天到期（含短间隔中）的卡片 */
export const dueCards = (now: number) => db.cards.where('due').below(dayEnd(now)).toArray()

/** 今天还能学几个新词 */
export function newAllowance(daily: DailyRow, dailyNew: number) {
  return Math.max(0, dailyNew + daily.extraNew - daily.newCount)
}

/**
 * 按词书顺序挑新词：从当前词书开始，学完自动接下一本。
 * 返回 [bookId, wordId] 列表。
 */
export async function pickNewWords(n: number, startBookId: string): Promise<{ bookId: string; wordId: string }[]> {
  if (n <= 0) return []
  const { books } = await loadIndex()
  const start = Math.max(0, books.findIndex((b) => b.id === startBookId))
  const learned = new Set(await db.cards.toCollection().primaryKeys())
  const picked: { bookId: string; wordId: string }[] = []
  const pickedIds = new Set<string>()
  for (const meta of books.slice(start)) {
    await ensureBook(meta)
    for (const wordId of await bookWordIds(meta.id)) {
      if (learned.has(wordCardId(wordId)) || pickedIds.has(wordId)) continue
      picked.push({ bookId: meta.id, wordId })
      pickedIds.add(wordId)
      if (picked.length >= n) return picked
    }
  }
  return picked
}

export interface TodayPlan {
  reviews: SessionItem[]
  news: SessionItem[]
  words: Map<string, Word>
  /** 出干扰项用的词池，按 bookId */
  pools: Map<string, Word[]>
  dayEnd: number
}

export async function loadTodayPlan(now: number): Promise<TodayPlan> {
  const s = getSettings()
  const daily = await getDaily(now)
  const due = await dueCards(now)
  const news = await pickNewWords(newAllowance(daily, s.dailyNew), s.currentBookId)

  const reviews: SessionItem[] = due
    .sort((a, b) => a.due - b.due)
    .map((c) => ({ cardId: c.id, wordId: c.refId, bookId: c.bookId, card: toFsrs(c), encounters: 0 }))
  const newItems: SessionItem[] = news.map((n) => ({
    cardId: wordCardId(n.wordId),
    wordId: n.wordId,
    bookId: n.bookId,
    card: null,
    encounters: 0,
  }))

  const all = [...reviews, ...newItems]
  const words = new Map<string, Word>()
  for (const w of await db.words.bulkGet(all.map((i) => i.wordId))) if (w) words.set(w.id, w)

  const pools = new Map<string, Word[]>()
  for (const bookId of new Set(all.map((i) => i.bookId))) {
    const ids = await bookWordIds(bookId)
    pools.set(bookId, (await db.words.bulkGet(ids)).filter((w): w is Word => !!w))
  }
  // 卡片对应的词在库里找不到（比如词书被删）就跳过
  const has = (i: SessionItem) => words.has(i.wordId)
  return { reviews: reviews.filter(has), news: newItems.filter(has), words, pools, dayEnd: dayEnd(now) }
}

export interface AnswerInput {
  item: SessionItem
  grade: Grade
  record: RecordLogItem
  wasNew: boolean
  quiz: QuizType
  correct: boolean
  ms: number
  now: number
}

export async function saveAnswer(a: AnswerInput) {
  const day = dayKey(a.now)
  const prev = await db.cards.get(a.item.cardId)
  const row: CardRow = fromFsrs(a.record.card, {
    id: a.item.cardId,
    kind: 'word',
    refId: a.item.wordId,
    bookId: prev?.bookId ?? a.item.bookId,
    createdAt: prev?.createdAt ?? a.now,
  })
  await db.transaction('rw', [db.cards, db.reviewLogs, db.daily, db.mistakes], async () => {
    await db.cards.put(row)
    await db.reviewLogs.add({
      cardId: a.item.cardId,
      ts: a.now,
      day,
      rating: a.grade,
      state: a.record.log.state,
      quiz: a.quiz,
      correct: a.correct,
      ms: a.ms,
    })
    const d = (await db.daily.get(day)) ?? emptyDaily(day)
    if (a.wasNew) d.newCount++
    // 只有复习到期的旧词才算"复习"，新词当天的短间隔重复不算
    else if (a.item.card?.state === State.Review) d.reviewCount++
    if (a.correct) d.correct++
    else d.wrong++
    d.studyMs += Math.min(a.ms, 60_000)
    await db.daily.put(d)

    // 错题本：答错或点"忘记"进入；在错题本里时连续答对 3 次自动移出
    const m = await db.mistakes.get(a.item.cardId)
    const wrong = !a.correct || a.grade === Rating.Again
    if (wrong) {
      await db.mistakes.put({
        cardId: a.item.cardId,
        wrongCount: (m?.wrongCount ?? 0) + 1,
        lastWrongAt: a.now,
        byType: { ...m?.byType, [a.quiz]: (m?.byType[a.quiz] ?? 0) + 1 },
        correctStreak: 0,
        active: true,
      })
    } else if (m) {
      const streak = m.correctStreak + 1
      await db.mistakes.put({ ...m, correctStreak: streak, active: m.active && streak < 3 })
    }
  })
}

export async function addExtraNew(now: number, n: number) {
  const d = await getDaily(now)
  await db.daily.put({ ...d, extraNew: d.extraNew + n })
}

export interface TodaySummary {
  reviewDue: number
  newLeft: number
  daily: DailyRow
}

export async function todaySummary(now: number): Promise<TodaySummary> {
  const s = getSettings()
  const daily = await getDaily(now)
  const reviewDue = await db.cards.where('due').below(dayEnd(now)).count()
  const allowance = newAllowance(daily, s.dailyNew)
  const newLeft = allowance ? (await pickNewWords(allowance, s.currentBookId)).length : 0
  return { reviewDue, newLeft, daily }
}
