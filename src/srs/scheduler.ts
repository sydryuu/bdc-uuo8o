// FSRS 调度封装。卡片在数据库里用时间戳存储，交给 ts-fsrs 时转成 Date。
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade, type RecordLogItem } from 'ts-fsrs'
import { formatInterval } from '../lib/date'

export { Rating, State }
export type { Card, Grade, RecordLogItem }

export function makeScheduler(opts: { fuzz?: boolean } = {}): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: 0.9,
      maximum_interval: 3650,
      enable_fuzz: opts.fuzz ?? true,
      // 短间隔重复：新词当天 1 分钟、10 分钟后再出现；忘记的词 10 分钟后重学
      enable_short_term: true,
      learning_steps: ['1m', '10m'],
      relearning_steps: ['10m'],
    }),
  )
}

export const scheduler = makeScheduler()

export type CardKind = 'word' | 'phrase'

/** 数据库里的卡片行 */
export interface CardRow {
  id: string // "w:ruler" / "p:talk about"
  kind: CardKind
  refId: string // 单词 id 或短语 id
  bookId: string // 从哪本书学的（出干扰项用）
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: State
  last_review?: number
  createdAt: number
}

export const wordCardId = (wordId: string) => `w:${wordId}`

export function toFsrs(row: CardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  }
}

export function fromFsrs(card: Card, meta: Pick<CardRow, 'id' | 'kind' | 'refId' | 'bookId' | 'createdAt'>): CardRow {
  return {
    ...meta,
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.getTime(),
  }
}

export const GRADES: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]
export const GRADE_LABEL: Record<Grade, string> = {
  [Rating.Again]: '忘记',
  [Rating.Hard]: '模糊',
  [Rating.Good]: '认识',
  [Rating.Easy]: '简单',
}

/** 每个评分按钮上显示的下次间隔。card 为 null 表示还没学过的新词 */
export function previewIntervals(card: Card | null, now: number, s: FSRS = scheduler): Record<Grade, string> {
  const preview = s.repeat(card ?? createEmptyCard(new Date(now)), new Date(now))
  const out = {} as Record<Grade, string>
  for (const g of GRADES) out[g] = formatInterval(preview[g].card.due.getTime() - now)
  return out
}

export function rate(card: Card | null, grade: Grade, now: number, s: FSRS = scheduler) {
  return s.next(card ?? createEmptyCard(new Date(now)), new Date(now), grade)
}
