// 学习会话：纯逻辑，不碰数据库，方便测试。
// 顺序：到期的短间隔卡 → 今天到期的复习 → 新词 → 提前出现的短间隔卡（直到全部过关）
import type { FSRS } from 'ts-fsrs'
import { rate, State, type Card, type Grade } from './scheduler'

export interface SessionItem {
  cardId: string
  wordId: string
  bookId: string
  /** null 表示今天要学、但还没见过的新词 */
  card: Card | null
  /** 本次会话里出现过几次（决定题型轮换） */
  encounters: number
}

export interface Session {
  items: SessionItem[]
  dayEnd: number
  lastCardId?: string
}

export function createSession(input: { reviews: SessionItem[]; news: SessionItem[]; dayEnd: number }): Session {
  return { items: [...input.reviews, ...input.news], dayEnd: input.dayEnd }
}

const isLearning = (c: Card | null) => !!c && (c.state === State.Learning || c.state === State.Relearning)

export function pickNext(s: Session, now: number): SessionItem | null {
  const notLast = (it: SessionItem) => it.cardId !== s.lastCardId
  const byDue = (a: SessionItem, b: SessionItem) => a.card!.due.getTime() - b.card!.due.getTime()

  const learningDue = s.items.filter((it) => isLearning(it.card) && it.card!.due.getTime() <= now).sort(byDue)
  if (learningDue.length) return learningDue.find(notLast) ?? learningDue[0]

  const review = s.items.find((it) => it.card?.state === State.Review)
  if (review) return review

  const fresh = s.items.find((it) => it.card === null || it.card.state === State.New)
  if (fresh) return fresh

  // 只剩还没到时间的短间隔卡：提前出，但尽量不连着出同一张
  const ahead = s.items.filter((it) => isLearning(it.card)).sort(byDue)
  return ahead.find(notLast) ?? ahead[0] ?? null
}

/** 评分后更新会话。卡片毕业（进入复习且明天以后才到期）就移出会话 */
export function applyGrade(s: Session, cardId: string, grade: Grade, now: number, scheduler?: FSRS) {
  const item = s.items.find((it) => it.cardId === cardId)
  if (!item) throw new Error(`会话里没有 ${cardId}`)
  const record = rate(item.card, grade, now, scheduler)
  const updated: SessionItem = { ...item, card: record.card, encounters: item.encounters + 1 }
  const done = record.card.state === State.Review && record.card.due.getTime() >= s.dayEnd
  const items = done ? s.items.filter((it) => it.cardId !== cardId) : s.items.map((it) => (it.cardId === cardId ? updated : it))
  return { session: { ...s, items, lastCardId: cardId }, record, wasNew: item.card === null, graduated: done }
}
