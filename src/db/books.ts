// 词书按需加载：index.json 很小，首屏只拉它；某本书要用时才拉对应 JSON 写进 IndexedDB
import type { BookFile, BookIndex, BookMeta } from '../types/vocab'
import { db } from './db'

let indexPromise: Promise<BookIndex> | null = null

export function loadIndex(): Promise<BookIndex> {
  indexPromise ??= fetch(`${import.meta.env.BASE_URL}books/index.json`).then((r) => {
    if (!r.ok) throw new Error(`词书目录加载失败 ${r.status}`)
    return r.json()
  })
  indexPromise.catch(() => (indexPromise = null))
  return indexPromise
}

/** 确保词书已导入且是最新版本。版本变化时更新词条，学习记录（卡片）不受影响 */
export async function ensureBook(meta: BookMeta): Promise<void> {
  if (meta.id.startsWith('custom-')) return // 自定义词书本来就在本地
  const row = await db.books.get(meta.id)
  if (row?.version === meta.version) return
  const res = await fetch(`${import.meta.env.BASE_URL}${meta.file}`)
  if (!res.ok) throw new Error(`词书 ${meta.name} 加载失败 ${res.status}`)
  const book = (await res.json()) as BookFile
  await db.transaction('rw', db.words, db.bookWords, db.books, async () => {
    await db.bookWords.where('[bookId+rank]').between([meta.id, -Infinity], [meta.id, Infinity]).delete()
    await db.words.bulkPut(book.words)
    await db.bookWords.bulkPut(book.words.map((w, i) => ({ bookId: meta.id, wordId: w.id, rank: i })))
    await db.books.put({ id: meta.id, name: meta.name, version: meta.version, wordCount: book.words.length, loadedAt: Date.now() })
  })
}

export async function bookWordIds(bookId: string): Promise<string[]> {
  const rows = await db.bookWords.where('[bookId+rank]').between([bookId, -Infinity], [bookId, Infinity]).toArray()
  return rows.map((r) => r.wordId)
}

/** 每本书已学（已有卡片）的词数 */
export async function bookProgress(bookId: string): Promise<{ learned: number; total: number }> {
  const ids = await bookWordIds(bookId)
  if (!ids.length) return { learned: 0, total: 0 }
  const learned = await db.cards.where('id').anyOf(ids.map((id) => `w:${id}`)).count()
  return { learned, total: ids.length }
}

// ---------- 自定义词书 ----------

export const isCustomBook = (id: string) => id.startsWith('custom-')

/** 内置词书 + 自定义词书（自定义的排在最后） */
export async function allBooks(): Promise<BookMeta[]> {
  const { books } = await loadIndex()
  const custom = (await db.books.toArray()).filter((b) => isCustomBook(b.id)).sort((a, b) => a.loadedAt - b.loadedAt)
  return [
    ...books,
    ...custom.map((b, i) => ({
      id: b.id,
      name: b.name,
      stage: 'custom',
      stageName: '我的词书',
      order: 10_000 + i,
      wordCount: b.wordCount,
      version: b.version,
      file: '',
    })),
  ]
}

/** 保存自定义词书。词库里已有的词条不覆盖（多本书共用） */
export async function saveCustomBook(name: string, words: import('../types/vocab').Word[]): Promise<string> {
  const id = `custom-${Date.now().toString(36)}`
  await db.transaction('rw', db.words, db.bookWords, db.books, async () => {
    const existing = new Set((await db.words.bulkGet(words.map((w) => w.id))).filter(Boolean).map((w) => w!.id))
    await db.words.bulkPut(words.filter((w) => !existing.has(w.id)))
    await db.bookWords.bulkPut(words.map((w, i) => ({ bookId: id, wordId: w.id, rank: i })))
    await db.books.put({ id, name, version: 'custom', wordCount: words.length, loadedAt: Date.now() })
  })
  return id
}

/** 删除自定义词书：只删书和书里的顺序，词条和学习记录保留 */
export async function deleteCustomBook(id: string) {
  if (!isCustomBook(id)) return
  await db.transaction('rw', db.bookWords, db.books, async () => {
    await db.bookWords.where('[bookId+rank]').between([id, -Infinity], [id, Infinity]).delete()
    await db.books.delete(id)
  })
}
