import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dictToWord, getWord, lookupMany, searchWords } from '../../lib/dict'
import { fillRows, parseImport } from '../../lib/importBook'
import { initSettings, updateSettings } from '../../lib/settings'
import { makeScheduler, Rating } from '../../srs/scheduler'
import { applyGrade, createSession, pickNext } from '../../srs/session'
import { addWordCard, loadTodayPlan, pickNewWords, saveAnswer, toggleFavorite } from '../../srs/store'
import { buildBackup, importBackup } from '../backupDb'
import { allBooks, deleteCustomBook, saveCustomBook } from '../books'
import { db } from '../db'

const PUBLIC = join(import.meta.dirname, '../../../public')
vi.stubGlobal('fetch', async (url: string) => {
  const path = join(PUBLIC, url.replace(/^\//, ''))
  return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(path, 'utf8')) }
})

const s = makeScheduler({ fuzz: false })
const T = new Date(2026, 9, 6, 10).getTime()

beforeEach(async () => {
  await db.delete()
  await db.open()
  await initSettings()
})

async function studySome(n: number) {
  await updateSettings({ dailyNew: n })
  const plan = await loadTodayPlan(T)
  let sess = createSession({ reviews: plan.reviews, news: plan.news, dayEnd: plan.dayEnd })
  let now = T
  for (let i = 0; i < 50 && sess.items.length; i++) {
    const item = pickNext(sess, now)!
    const correct = !(item.wordId === 'ruler' && i === 0)
    const grade = correct ? Rating.Good : Rating.Again
    const r = applyGrade(sess, item.cardId, grade, now, s)
    await saveAnswer({ item, grade, record: r.record, wasNew: r.wasNew, quiz: 'en2cn', correct, ms: 1000, now })
    sess = r.session
    now += 60_000
  }
}

describe('词书目录', () => {
  it('包含小学、人教初中、人教高中、四六级，顺序正确', async () => {
    const books = await allBooks()
    expect(books.map((b) => b.id)).toEqual([
      'pep-3a', 'pep-3b', 'pep-4a', 'pep-4b', 'pep-5a', 'pep-5b', 'pep-6a', 'pep-6b',
      'pep-7a', 'pep-7b', 'pep-8a', 'pep-8b', 'pep-9',
      ...Array.from({ length: 11 }, (_, i) => `pep-hs${i + 1}`),
      'cet4', 'cet6',
    ])
    expect(books.find((b) => b.id === 'cet4')!.bytes).toBeGreaterThan(1_000_000)
  })
})

describe('自定义词书', () => {
  it('导入 → 补全 → 保存 → 作为当前词书学习 → 删除后学习记录还在', async () => {
    await pickNewWords(1, 'pep-3a') // 下载一本内置词书，ruler 在词库里
    const { rows } = parseImport('word,meaning\nruler,\napple,\nkiwi,猕猴桃\n', 'my.csv')
    const library = new Map((await db.words.bulkGet(rows.map((r) => r.word))).filter((w) => !!w).map((w) => [w!.id, w!]))
    const dict = await lookupMany(rows.map((r) => r.word))
    const { words, origins } = fillRows(rows, { library, dict })
    expect(origins).toEqual(['library', 'dict', 'dict'])
    expect(words.find((w) => w.id === 'apple')!.meanings[0].cn).toContain('苹果')

    const id = await saveCustomBook('我的水果', words)
    expect((await allBooks()).at(-1)).toMatchObject({ id, name: '我的水果', stageName: '我的词书', wordCount: 3 })
    // 已有的 ruler 词条没有被覆盖成简版
    expect((await db.words.get('ruler'))!.examples.length).toBeGreaterThan(0)

    await updateSettings({ currentBookId: id })
    expect((await pickNewWords(5, id)).map((p) => p.wordId)).toEqual(['ruler', 'apple', 'kiwi'])
    await studySome(3)
    // 词池太小，用当前词书补足到能出干扰项
    await addWordCard(words[1], T)
    const plan = await loadTodayPlan(T + 2 * 86_400_000)
    expect([...plan.pools.values()].every((p) => p.length >= 3)).toBe(true)

    await deleteCustomBook(id)
    expect((await allBooks()).some((b) => b.id === id)).toBe(false)
    expect(await db.cards.get('w:kiwi')).toBeDefined()
  })
})

describe('查词与生词本', () => {
  it('英文前缀：已下载词书在前，再补词典；中文按释义查', async () => {
    await pickNewWords(1, 'pep-3a')
    const hits = await searchWords('pen')
    expect(hits[0]).toMatchObject({ source: 'library', word: { id: 'pen' } })
    expect(hits.some((h) => h.source === 'dict')).toBe(true)
    const zh = await searchWords('尺子')
    expect(zh[0].word.id).toBe('ruler')
  })
  it('词典里的词也能收藏，收藏时存进词库', async () => {
    const hit = (await getWord('serendipity')) ?? (await getWord('apple'))!
    expect(hit.source).toBe('dict')
    expect(await toggleFavorite(hit.word)).toBe(true)
    expect(await db.words.get(hit.word.id)).toBeDefined()
    expect(await toggleFavorite(hit.word)).toBe(false)
    expect(await db.favorites.count()).toBe(0)
  })
  it('dictToWord 转成统一格式', async () => {
    const e = (await lookupMany(['apple'])).get('apple')!
    expect(dictToWord(e)).toMatchObject({ id: 'apple', word: 'apple', examples: [], phrases: [] })
  })
})

describe('备份', () => {
  it('导出 → 清空 → 覆盖导入，数据一致；再合并导入不会重复', async () => {
    await studySome(3)
    await toggleFavorite((await db.words.get('pencil'))!)
    const id = await saveCustomBook('测试书', [(await db.words.get('ruler'))!])
    const before = await buildBackup()
    expect(before.tables.cards).toHaveLength(3)
    expect(before.tables.books.map((b) => b.id)).toEqual([id])
    expect(before.tables.words.map((w) => w.id).sort()).toEqual(['eraser', 'pencil', 'ruler'])

    // 模拟换手机：全新数据库
    await db.delete()
    await db.open()
    await initSettings()
    const json = JSON.parse(JSON.stringify(before))
    const sum = await importBackup(json, 'overwrite')
    expect(sum).toMatchObject({ cards: 3, favorites: 1, books: 1 })
    const after = await buildBackup()
    const strip = (b: typeof before) => ({ ...b.tables, reviewLogs: b.tables.reviewLogs.map(({ id: _i, ...r }) => r), exportedAt: 0 })
    expect(strip(after)).toEqual(strip(before))

    // 没下载词书也能直接复习
    const plan = await loadTodayPlan(T + 5 * 86_400_000)
    expect(plan.reviews.length).toBe(3)

    await importBackup(json, 'merge')
    expect(await db.reviewLogs.count()).toBe(before.tables.reviewLogs.length)
    expect((await db.daily.toArray())[0]).toEqual(before.tables.daily[0])
  })

  it('拒绝不是备份的文件', async () => {
    await expect(importBackup({ hello: 1 }, 'merge')).rejects.toThrow('不是背单词的备份文件')
  })
})
