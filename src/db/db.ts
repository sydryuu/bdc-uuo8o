import Dexie, { type EntityTable } from 'dexie'
import type { Word } from '../types/vocab'
import type { CardRow } from '../srs/scheduler'
import type { Rating, State } from 'ts-fsrs'

export interface BookRow {
  id: string
  name: string
  version: string
  wordCount: number
  loadedAt: number
}

export interface BookWordRow {
  bookId: string
  wordId: string
  rank: number
}

export type QuizType = 'en2cn' | 'cn2en'

export interface ReviewLogRow {
  id?: number
  cardId: string
  ts: number
  day: string
  rating: Rating
  /** 评分前的状态 */
  state: State
  quiz: QuizType
  correct: boolean
  ms: number
}

export interface DailyRow {
  day: string
  newCount: number
  reviewCount: number
  correct: number
  wrong: number
  /** 当天点了"再学 N 个"追加的新词额度 */
  extraNew: number
  studyMs: number
}

export interface MistakeRow {
  cardId: string
  wrongCount: number
  lastWrongAt: number
  byType: Partial<Record<QuizType, number>>
  correctStreak: number
  /** 是否在错题本里（连续答对 3 次自动移出） */
  active: boolean
}

export interface FavoriteRow {
  wordId: string
  addedAt: number
}

export interface KV {
  key: string
  value: unknown
}

export const db = new Dexie('beidanci') as Dexie & {
  books: EntityTable<BookRow, 'id'>
  words: EntityTable<Word, 'id'>
  bookWords: EntityTable<BookWordRow, 'bookId'>
  cards: EntityTable<CardRow, 'id'>
  reviewLogs: EntityTable<ReviewLogRow, 'id'>
  daily: EntityTable<DailyRow, 'day'>
  mistakes: EntityTable<MistakeRow, 'cardId'>
  favorites: EntityTable<FavoriteRow, 'wordId'>
  kv: EntityTable<KV, 'key'>
}

db.version(1).stores({
  books: 'id',
  words: 'id',
  bookWords: '[bookId+wordId], [bookId+rank], wordId',
  cards: 'id, due, state, refId, bookId',
  reviewLogs: '++id, cardId, ts, day',
  daily: 'day',
  mistakes: 'cardId, wrongCount, lastWrongAt',
  favorites: 'wordId, addedAt',
  kv: 'key',
})

export const emptyDaily = (day: string): DailyRow => ({
  day,
  newCount: 0,
  reviewCount: 0,
  correct: 0,
  wrong: 0,
  extraNew: 0,
  studyMs: 0,
})
