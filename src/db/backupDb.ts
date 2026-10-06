// 备份导出 / 导入（连接数据库的部分；合并规则在 lib/backup.ts，有单元测试）
import {
  BACKUP_APP,
  BACKUP_VERSION,
  mergeCards,
  mergeDaily,
  mergeFavorites,
  mergeLogs,
  mergeMistakes,
  validateBackup,
  type Backup,
} from '../lib/backup'
import { dayKey } from '../lib/date'
import { initSettings } from '../lib/settings'
import type { Word } from '../types/vocab'
import { isCustomBook } from './books'
import { db } from './db'

export const LAST_BACKUP_KEY = 'lastBackupAt'
export const SNOOZE_KEY = 'backupSnoozedUntil'

export async function buildBackup(): Promise<Backup> {
  const [cards, reviewLogs, daily, mistakes, favorites, kv, books] = await Promise.all([
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.daily.toArray(),
    db.mistakes.toArray(),
    db.favorites.toArray(),
    db.kv.toArray(),
    db.books.toArray(),
  ])
  const customBooks = books.filter((b) => isCustomBook(b.id))
  const bookWords = (await Promise.all(customBooks.map((b) => db.bookWords.where('bookId').equals(b.id).toArray()))).flat()
  const wordIds = new Set<string>([
    ...cards.map((c) => (c.kind === 'phrase' ? (c.wordId ?? '') : c.refId)),
    ...favorites.map((f) => f.wordId),
    ...bookWords.map((b) => b.wordId),
  ])
  const words = (await db.words.bulkGet([...wordIds])).filter((w): w is Word => !!w)
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: { cards, reviewLogs, daily, mistakes, favorites, kv, books: customBooks, bookWords, words },
  }
}

export const backupFileName = (now = Date.now()) => `背单词备份-${dayKey(now)}.json`

/** 导出：手机上优先用系统分享（存到"文件"、发微信都行），否则直接下载 */
export async function exportBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const backup = await buildBackup()
  const file = new File([JSON.stringify(backup)], backupFileName(), { type: 'application/json' })
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  let result: 'shared' | 'downloaded' | 'cancelled' = 'downloaded'
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '背单词备份' })
      result = 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      result = 'downloaded' // 分享失败就退回下载
    }
  }
  if (result === 'downloaded') {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  await db.kv.put({ key: LAST_BACKUP_KEY, value: Date.now() })
  return result
}

export interface ImportSummary {
  cards: number
  logs: number
  days: number
  mistakes: number
  favorites: number
  books: number
}

/** 导入备份。overwrite = 用备份替换现在的学习记录；merge = 两边合并 */
export async function importBackup(raw: unknown, mode: 'overwrite' | 'merge'): Promise<ImportSummary> {
  const { tables: t } = validateBackup(raw)
  const books = t.books ?? []
  const bookWords = t.bookWords ?? []
  await db.transaction('rw', [db.cards, db.reviewLogs, db.daily, db.mistakes, db.favorites, db.kv, db.books, db.bookWords, db.words], async () => {
    // 词条：只补没有的，不覆盖已下载词书里更完整的数据
    const have = new Set((await db.words.bulkGet((t.words ?? []).map((w) => w.id))).filter(Boolean).map((w) => w!.id))
    await db.words.bulkPut((t.words ?? []).filter((w) => !have.has(w.id)))

    if (mode === 'overwrite') {
      await Promise.all([db.cards.clear(), db.reviewLogs.clear(), db.daily.clear(), db.mistakes.clear(), db.favorites.clear()])
      for (const b of (await db.books.toArray()).filter((b) => isCustomBook(b.id))) {
        await db.bookWords.where('bookId').equals(b.id).delete()
        await db.books.delete(b.id)
      }
      await db.cards.bulkPut(t.cards)
      await db.reviewLogs.bulkAdd(t.reviewLogs.map(({ id: _id, ...rest }) => rest))
      await db.daily.bulkPut(t.daily)
      await db.mistakes.bulkPut(t.mistakes)
      await db.favorites.bulkPut(t.favorites)
      await db.kv.bulkPut(t.kv ?? [])
    } else {
      await db.cards.bulkPut(mergeCards(await db.cards.toArray(), t.cards))
      await db.reviewLogs.bulkAdd(mergeLogs(await db.reviewLogs.toArray(), t.reviewLogs))
      await db.daily.bulkPut(mergeDaily(await db.daily.toArray(), t.daily))
      await db.mistakes.bulkPut(mergeMistakes(await db.mistakes.toArray(), t.mistakes))
      await db.favorites.bulkPut(mergeFavorites(await db.favorites.toArray(), t.favorites))
      // 设置保留现在的；上次备份时间取较晚的
      const incoming = (t.kv ?? []).find((k) => k.key === LAST_BACKUP_KEY)?.value as number | undefined
      const current = (await db.kv.get(LAST_BACKUP_KEY))?.value as number | undefined
      if (incoming && (!current || incoming > current)) await db.kv.put({ key: LAST_BACKUP_KEY, value: incoming })
    }
    await db.books.bulkPut(books)
    await db.bookWords.bulkPut(bookWords)
  })
  await initSettings() // 覆盖模式下设置也换成备份里的
  return { cards: t.cards.length, logs: t.reviewLogs.length, days: t.daily.length, mistakes: t.mistakes.length, favorites: t.favorites.length, books: books.length }
}
