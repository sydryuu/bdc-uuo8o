// 学习数据读写：把纯逻辑（session / practice）和数据库连起来
import { createEmptyCard } from 'ts-fsrs'
import { bookWordIds, ensureBook, loadIndex } from '../db/books'
import { db, emptyDaily, type DailyRow, type MistakeRow, type QuizType } from '../db/db'
import { dayEnd, dayKey } from '../lib/date'
import { getSettings } from '../lib/settings'
import type { Phrase, Word } from '../types/vocab'
import { fromFsrs, phraseCardId, toFsrs, wordCardId, type CardRow, type Grade, Rating, type RecordLogItem, State } from './scheduler'
import type { SessionItem } from './session'

export const getDaily = async (now: number): Promise<DailyRow> => (await db.daily.get(dayKey(now))) ?? emptyDaily(dayKey(now))

/** 今天到期（含短间隔中、手动加入的短语）的卡片 */
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

export const itemFromCard = (c: CardRow): SessionItem => ({
  cardId: c.id,
  wordId: c.kind === 'phrase' ? (c.wordId ?? '') : c.refId,
  phraseId: c.kind === 'phrase' ? c.refId : undefined,
  bookId: c.bookId,
  card: toFsrs(c),
  encounters: 0,
})

export interface StudyPlan {
  reviews: SessionItem[]
  news: SessionItem[]
  words: Map<string, Word>
  /** 出干扰项用的词池，按 bookId */
  pools: Map<string, Word[]>
  dayEnd: number
}
/** 兼容旧名字 */
export type TodayPlan = StudyPlan

/** 读出这些学习项用到的单词和词池；找不到单词（或短语）的项会被丢掉 */
async function assemble(reviews: SessionItem[], news: SessionItem[], now: number): Promise<StudyPlan> {
  const all = [...reviews, ...news]
  const words = new Map<string, Word>()
  for (const w of await db.words.bulkGet([...new Set(all.map((i) => i.wordId))])) if (w) words.set(w.id, w)

  const pools = new Map<string, Word[]>()
  for (const bookId of new Set(all.map((i) => i.bookId))) {
    const ids = await bookWordIds(bookId)
    pools.set(bookId, (await db.words.bulkGet(ids)).filter((w): w is Word => !!w))
  }
  const has = (i: SessionItem) => {
    const w = words.get(i.wordId)
    return !!w && (!i.phraseId || w.phrases.some((p) => p.id === i.phraseId))
  }
  return { reviews: reviews.filter(has), news: news.filter(has), words, pools, dayEnd: dayEnd(now) }
}

export async function loadTodayPlan(now: number): Promise<StudyPlan> {
  const s = getSettings()
  const daily = await getDaily(now)
  const due = await dueCards(now)
  const news = await pickNewWords(newAllowance(daily, s.dailyNew), s.currentBookId)
  const reviews = due.sort((a, b) => a.due - b.due).map(itemFromCard)
  const newItems: SessionItem[] = news.map((n) => ({
    cardId: wordCardId(n.wordId),
    wordId: n.wordId,
    bookId: n.bookId,
    card: null,
    encounters: 0,
  }))
  return assemble(reviews, newItems, now)
}

/** 错题练习：错题本里的词，最常错的优先，最多 limit 个 */
export async function loadMistakePlan(now: number, limit = 20): Promise<StudyPlan> {
  const active = (await db.mistakes.toArray()).filter((m) => m.active)
  active.sort((a, b) => b.wrongCount - a.wrongCount || b.lastWrongAt - a.lastWrongAt)
  const cards = (await db.cards.bulkGet(active.slice(0, limit).map((m) => m.cardId))).filter((c): c is CardRow => !!c)
  return assemble(cards.map(itemFromCard), [], now)
}

// ---------- 写入 ----------

/** 更新错题本：答错进入（或计数 +1）；在错题本里时连续答对 3 次自动移出 */
async function updateMistake(cardId: string, quiz: QuizType, wrong: boolean, now: number) {
  const m = await db.mistakes.get(cardId)
  if (wrong) {
    await db.mistakes.put({
      cardId,
      wrongCount: (m?.wrongCount ?? 0) + 1,
      lastWrongAt: now,
      byType: { ...m?.byType, [quiz]: (m?.byType[quiz] ?? 0) + 1 },
      correctStreak: 0,
      active: true,
    })
  } else if (m) {
    const streak = m.correctStreak + 1
    await db.mistakes.put({ ...m, correctStreak: streak, active: m.active && streak < 3 })
  }
}

async function bumpDaily(now: number, f: (d: DailyRow) => void) {
  const day = dayKey(now)
  const d = (await db.daily.get(day)) ?? emptyDaily(day)
  f(d)
  await db.daily.put(d)
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
  const prev = await db.cards.get(a.item.cardId)
  const isPhrase = !!a.item.phraseId
  const row: CardRow = fromFsrs(a.record.card, {
    id: a.item.cardId,
    kind: isPhrase ? 'phrase' : 'word',
    refId: isPhrase ? a.item.phraseId! : a.item.wordId,
    wordId: isPhrase ? a.item.wordId : undefined,
    bookId: prev?.bookId ?? a.item.bookId,
    createdAt: prev?.createdAt ?? a.now,
  })
  await db.transaction('rw', [db.cards, db.reviewLogs, db.daily, db.mistakes], async () => {
    await db.cards.put(row)
    await db.reviewLogs.add({
      cardId: a.item.cardId,
      ts: a.now,
      day: dayKey(a.now),
      rating: a.grade,
      state: a.record.log.state,
      quiz: a.quiz,
      correct: a.correct,
      ms: a.ms,
    })
    await bumpDaily(a.now, (d) => {
      if (a.wasNew) d.newCount++
      // 只有复习到期的旧词才算"复习"，新词当天的短间隔重复不算
      else if (a.item.card?.state === State.Review) d.reviewCount++
      if (a.correct) d.correct++
      else d.wrong++
      d.studyMs += Math.min(a.ms, 60_000)
    })
    await updateMistake(a.item.cardId, a.quiz, !a.correct || a.grade === Rating.Again, a.now)
  })
}

/** 错题练习的作答：只更新错题本和当天答题数（算打卡），不碰 FSRS */
export async function savePractice(a: { cardId: string; quiz: QuizType; correct: boolean; ms: number; now: number }) {
  await db.transaction('rw', [db.daily, db.mistakes], async () => {
    await bumpDaily(a.now, (d) => {
      if (a.correct) d.correct++
      else d.wrong++
      d.studyMs += Math.min(a.ms, 60_000)
    })
    await updateMistake(a.cardId, a.quiz, !a.correct, a.now)
  })
}

/** 手动移出错题本 / 加回错题本 */
export async function setMistakeActive(cardId: string, active: boolean) {
  const m = await db.mistakes.get(cardId)
  if (m) await db.mistakes.put({ ...m, active, correctStreak: active ? 0 : m.correctStreak })
}

/** 把短语单独加入学习队列：今天就会作为新卡出现 */
export async function addPhraseCard(word: Word, phrase: Phrase, bookId: string, now = Date.now()) {
  const id = phraseCardId(phrase.id)
  if (await db.cards.get(id)) return
  await db.cards.put(fromFsrs(createEmptyCard(new Date(now)), { id, kind: 'phrase', refId: phrase.id, wordId: word.id, bookId, createdAt: now }))
}

/** 移出还没开始学的短语卡（学过的保留记录，不删除） */
export async function removePhraseCard(phraseId: string) {
  const c = await db.cards.get(phraseCardId(phraseId))
  if (c && c.state === State.New) await db.cards.delete(c.id)
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

/** 错题本列表需要的展示信息 */
export interface MistakeView extends MistakeRow {
  title: string
  meaning: string
  kind: 'word' | 'phrase'
}

export async function mistakeViews(): Promise<MistakeView[]> {
  const ms = await db.mistakes.toArray()
  const cards = await db.cards.bulkGet(ms.map((m) => m.cardId))
  const wordIds = cards.map((c) => (c ? (c.kind === 'phrase' ? c.wordId : c.refId) : undefined))
  const words = await db.words.bulkGet(wordIds.map((id) => id ?? ''))
  const out: MistakeView[] = []
  ms.forEach((m, i) => {
    const c = cards[i]
    const w = words[i]
    if (!c || !w) return
    if (c.kind === 'phrase') {
      const p = w.phrases.find((x) => x.id === c.refId)
      if (p) out.push({ ...m, kind: 'phrase', title: p.en, meaning: p.cn })
    } else {
      out.push({ ...m, kind: 'word', title: w.word, meaning: w.meanings.map((x) => x.cn).join('；') })
    }
  })
  return out
}
