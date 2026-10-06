// 常用词典：按首字母分片，用到哪片下载哪片（Service Worker 会缓存，下载过的离线也能查）
import { db } from '../db/db'
import type { DictEntry, Word } from '../types/vocab'

// 词典只收字母开头的词，所以只有 a–z 26 个分片
const SHARDS = 'abcdefghijklmnopqrstuvwxyz'.split('')
const cache = new Map<string, Promise<DictEntry[]>>()

export const shardOf = (word: string) => {
  const c = word[0]?.toLowerCase() ?? '_'
  return c >= 'a' && c <= 'z' ? c : '_'
}

export function loadShard(s: string): Promise<DictEntry[]> {
  if (!SHARDS.includes(s)) return Promise.resolve([])
  let p = cache.get(s)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}dict/${s}.json`).then((r) => {
      if (!r.ok) throw new Error(`词典加载失败 ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(s))
    cache.set(s, p)
  }
  return p
}

export const loadAllShards = async () => (await Promise.all(SHARDS.map(loadShard))).flat()

export async function lookupDict(word: string): Promise<DictEntry | undefined> {
  const id = word.toLowerCase()
  return (await loadShard(shardOf(id))).find((e) => e[0].toLowerCase() === id)
}

/** 批量查：返回 小写词 → 条目 */
export async function lookupMany(words: string[]): Promise<Map<string, DictEntry>> {
  const ids = [...new Set(words.map((w) => w.toLowerCase()))]
  const shards = [...new Set(ids.map(shardOf))]
  const all = (await Promise.all(shards.map(loadShard))).flat()
  const want = new Set(ids)
  return new Map(all.filter((e) => want.has(e[0].toLowerCase())).map((e) => [e[0].toLowerCase(), e]))
}

export function dictToWord(e: DictEntry): Word {
  const w: Word = {
    id: e[0].toLowerCase(),
    word: e[0],
    meanings: e[2].map(([pos, cn]) => ({ pos, cn })),
    examples: [],
    phrases: [],
    tags: [],
  }
  if (e[1]) w.uk = e[1]
  return w
}

export interface SearchHit {
  word: Word
  /** library = 已下载词书里的完整词条；dict = 只有词典释义 */
  source: 'library' | 'dict'
}

const hasChinese = (s: string) => /[一-鿿]/.test(s)

/**
 * 查词：英文按前缀匹配，中文按释义包含匹配。
 * 已下载词书里的词排前面（有例句、短语），再补词典里的。
 */
export async function searchWords(q: string, limit = 30): Promise<SearchHit[]> {
  const query = q.trim().toLowerCase()
  if (!query) return []
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  const push = (word: Word, source: SearchHit['source']) => {
    if (seen.has(word.id) || hits.length >= limit) return
    seen.add(word.id)
    hits.push({ word, source })
  }

  if (hasChinese(query)) {
    const lib = await db.words.filter((w) => w.meanings.some((m) => m.cn.includes(query))).limit(limit).toArray()
    lib.sort((a, b) => a.word.length - b.word.length).forEach((w) => push(w, 'library'))
    if (hits.length < limit) {
      const all = await loadAllShards()
      all
        .filter((e) => e[2].some(([, cn]) => cn.includes(query)))
        .sort((a, b) => a[0].length - b[0].length)
        .forEach((e) => push(dictToWord(e), 'dict'))
    }
    return hits
  }

  const exact = await db.words.get(query)
  if (exact) push(exact, 'library')
  ;(await db.words.where('id').startsWith(query).limit(limit).toArray())
    .sort((a, b) => a.id.length - b.id.length || a.id.localeCompare(b.id))
    .forEach((w) => push(w, 'library'))
  if (hits.length < limit) {
    const shard = await loadShard(shardOf(query))
    shard
      .filter((e) => e[0].toLowerCase().startsWith(query))
      .sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0]))
      .forEach((e) => push(dictToWord(e), 'dict'))
  }
  return hits
}

/** 取一个词的完整信息：优先词库，没有就查词典 */
export async function getWord(id: string): Promise<SearchHit | undefined> {
  const w = await db.words.get(id.toLowerCase())
  if (w) return { word: w, source: 'library' }
  const e = await lookupDict(id)
  return e ? { word: dictToWord(e), source: 'dict' } : undefined
}
