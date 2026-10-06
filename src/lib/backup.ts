// 备份：导出全部学习记录为 JSON；导入时可以覆盖或合并
import type { CardRow } from '../srs/scheduler'
import type { BookRow, BookWordRow, DailyRow, FavoriteRow, KV, MistakeRow, ReviewLogRow } from '../db/db'
import type { Word } from '../types/vocab'

export const BACKUP_APP = 'beidanci'
export const BACKUP_VERSION = 1

export interface BackupTables {
  cards: CardRow[]
  reviewLogs: ReviewLogRow[]
  daily: DailyRow[]
  mistakes: MistakeRow[]
  favorites: FavoriteRow[]
  kv: KV[]
  /** 只含自定义词书 */
  books: BookRow[]
  bookWords: BookWordRow[]
  /** 学过、收藏过、自定义词书里的词条（换设备时不用先下载词书也能复习） */
  words: Word[]
}

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  tables: BackupTables
}

export function validateBackup(data: unknown): Backup {
  const b = data as Backup
  if (!b || b.app !== BACKUP_APP || typeof b.version !== 'number' || !b.tables) throw new Error('不是背单词的备份文件')
  if (b.version > BACKUP_VERSION) throw new Error('备份文件来自更新的版本，请先更新应用')
  for (const k of ['cards', 'reviewLogs', 'daily', 'mistakes', 'favorites'] as const) {
    if (!Array.isArray(b.tables[k])) throw new Error(`备份文件缺少 ${k}`)
  }
  return b
}

const byKey = <T>(rows: T[], key: (r: T) => string) => new Map(rows.map((r) => [key(r), r]))

/** 合并两份卡片：保留最近一次复习更晚的（复习次数多的优先） */
export function mergeCards(local: CardRow[], incoming: CardRow[]): CardRow[] {
  const m = byKey(local, (c) => c.id)
  for (const c of incoming) {
    const cur = m.get(c.id)
    const newer = !cur || (c.last_review ?? 0) > (cur.last_review ?? 0) || ((c.last_review ?? 0) === (cur.last_review ?? 0) && c.reps > cur.reps)
    if (newer) m.set(c.id, c)
  }
  return [...m.values()]
}

/** 合并复习日志：同一张卡同一时刻的只留一条（去掉自增 id 让数据库重新编号） */
export function mergeLogs(local: ReviewLogRow[], incoming: ReviewLogRow[]): ReviewLogRow[] {
  const seen = new Set(local.map((l) => `${l.cardId}@${l.ts}`))
  return incoming.filter((l) => !seen.has(`${l.cardId}@${l.ts}`)).map(({ id: _id, ...rest }) => rest)
}

/** 合并每日统计：同一天每个数取较大值（同一份数据导两次不会翻倍） */
export function mergeDaily(local: DailyRow[], incoming: DailyRow[]): DailyRow[] {
  const m = byKey(local, (d) => d.day)
  for (const d of incoming) {
    const cur = m.get(d.day)
    if (!cur) m.set(d.day, d)
    else
      m.set(d.day, {
        day: d.day,
        newCount: Math.max(cur.newCount, d.newCount),
        reviewCount: Math.max(cur.reviewCount, d.reviewCount),
        correct: Math.max(cur.correct, d.correct),
        wrong: Math.max(cur.wrong, d.wrong),
        extraNew: Math.max(cur.extraNew, d.extraNew),
        studyMs: Math.max(cur.studyMs, d.studyMs),
      })
  }
  return [...m.values()]
}

/** 合并错题：保留最近出错更晚的那条 */
export function mergeMistakes(local: MistakeRow[], incoming: MistakeRow[]): MistakeRow[] {
  const m = byKey(local, (x) => x.cardId)
  for (const x of incoming) {
    const cur = m.get(x.cardId)
    if (!cur || x.lastWrongAt > cur.lastWrongAt || (x.lastWrongAt === cur.lastWrongAt && x.wrongCount > cur.wrongCount)) m.set(x.cardId, x)
  }
  return [...m.values()]
}

export function mergeFavorites(local: FavoriteRow[], incoming: FavoriteRow[]): FavoriteRow[] {
  const m = byKey(local, (f) => f.wordId)
  for (const f of incoming) {
    const cur = m.get(f.wordId)
    if (!cur || f.addedAt < cur.addedAt) m.set(f.wordId, f)
  }
  return [...m.values()]
}

const DAY = 86_400_000

/** 该不该提醒备份：关闭（0 天）、没学过、暂缓中都不提醒；否则距上次备份（或第一次学习）满 N 天就提醒 */
export function needsBackupReminder(o: { now: number; days: number; lastBackupAt?: number; firstLearnedAt?: number; snoozedUntil?: number }): boolean {
  if (!o.days || !o.firstLearnedAt) return false
  if (o.snoozedUntil && o.snoozedUntil > o.now) return false
  return o.now - (o.lastBackupAt ?? o.firstLearnedAt) >= o.days * DAY
}
