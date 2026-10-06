// 构建词书和常用词典：data/raw → public/books/*.json + index.json、public/dict/*.json
// 用法：npm run vocab:fetch && npm run vocab:build
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BookFile, BookIndex, BookMeta, DictEntry } from '../../src/types/vocab.ts'
import { BOOKS, STAGE_NAMES } from './config.ts'
import { frequencyRank, inDict, shardOf, toDictEntry } from './dict.ts'
import { applyOverrides, cleanHeadword, dedupe, mergeEntry, type Overrides } from './merge.ts'
import { pickWanted, scanEcdict, type EcEntry } from './sources/ecdict.ts'
import { parseKbFile, type KbEntry } from './sources/kylebing.ts'

const ROOT = join(import.meta.dirname, '../..')
const RAW = join(ROOT, 'data/raw')
const OUT = join(ROOT, 'public/books')
const DICT_OUT = join(ROOT, 'public/dict')

function readRaw(file: string) {
  const p = join(RAW, file)
  if (!existsSync(p)) throw new Error(`缺少 ${p}，先运行 npm run vocab:fetch`)
  return readFileSync(p, 'utf8')
}

const kbCache = new Map<string, KbEntry[]>()
const entriesFor = (spec: (typeof BOOKS)[number]) => {
  if (!kbCache.has(spec.kbFile)) kbCache.set(spec.kbFile, parseKbFile(readRaw(`kb-${spec.kbFile}.jsonl`)))
  return kbCache
    .get(spec.kbFile)!
    .filter((e) => !spec.kbBookId || e.bookId === spec.kbBookId)
    .sort((a, b) => a.bookId.localeCompare(b.bookId) || a.rank - b.rank)
}

const perBook = BOOKS.map((spec) => ({ spec, entries: entriesFor(spec) }))

// ECDICT 只扫一遍：挑出词书用到的词，同时收集常用词典
const wanted = new Map<string, string>()
for (const { entries } of perBook)
  for (const e of entries) {
    const w = cleanHeadword(e.word)
    wanted.set(w.toLowerCase(), w)
  }
console.log(`扫描 ECDICT（词书目标词 ${wanted.size} 个）…`)
const ec = new Map<string, EcEntry>()
const dict = new Map<string, DictEntry>() // 小写词 → 条目
const dictRank = new Map<string, number>()
await scanEcdict(join(RAW, 'ecdict.csv'), (e) => {
  pickWanted(ec, wanted, e)
  const key = e.word.toLowerCase()
  if (!(inDict(e) || (wanted.has(key) && !key.includes(' ')))) return
  // 同一个词有多种大小写（apple / Apple，iPhone / iphone）时，收更常用的那个；一样常用就要全小写的
  const rank = frequencyRank(e) - (e.word === key ? 0.1 : 0)
  if (!dict.has(key) || rank < dictRank.get(key)!) {
    dict.set(key, toDictEntry(e))
    dictRank.set(key, rank)
  }
})

const ovPath = join(ROOT, 'data/overrides/overrides.json')
const overrides: Overrides = existsSync(ovPath) ? JSON.parse(readFileSync(ovPath, 'utf8')) : {}

mkdirSync(OUT, { recursive: true })
const metas: BookMeta[] = []
for (const { spec, entries } of perBook) {
  let words = applyOverrides(spec.id, dedupe(entries.map((e) => mergeEntry(e, ec.get(cleanHeadword(e.word).toLowerCase())))), overrides)
  if (spec.excludeTags?.length) {
    const before = words.length
    words = words.filter((w) => !w.tags.some((t) => spec.excludeTags!.includes(t)))
    console.log(`  ${spec.name}：去掉中学已覆盖的 ${before - words.length} 个词`)
  }
  if (spec.sort === 'frequency') {
    // 稳定排序：词频相同（或未知）时保持原顺序
    words = words
      .map((w, i) => ({ w, i, r: frequencyRank(ec.get(w.id)) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.w)
  }
  const body = JSON.stringify(words)
  const version = createHash('sha1').update(body).digest('hex').slice(0, 10)
  const file: BookFile = { id: spec.id, name: spec.name, version, words }
  const json = JSON.stringify(file)
  writeFileSync(join(OUT, `${spec.id}.json`), json)
  metas.push({
    id: spec.id,
    name: spec.name,
    stage: spec.stage,
    stageName: STAGE_NAMES[spec.stage],
    order: spec.order,
    wordCount: words.length,
    version,
    file: `books/${spec.id}.json`,
    bytes: Buffer.byteLength(json),
  })
  const single = words.filter((w) => !w.id.includes(' '))
  const miss = (f: (w: (typeof words)[number]) => boolean) => single.filter(f).length
  console.log(
    `${spec.name.padEnd(12)} ${String(words.length).padStart(5)} 词（短语 ${words.length - single.length}）| 单词缺英音 ${miss((w) => !w.uk)} ` +
      `缺词性 ${miss((w) => !w.meanings[0]?.pos)} 无例句 ${miss((w) => !w.examples.length)} | ${(json.length / 1024).toFixed(0)}KB` +
      (spec.sort === 'frequency' ? ` | 前 8 个：${words.slice(0, 8).map((w) => w.word).join(' ')}` : ''),
  )
}

const index: BookIndex = { generatedAt: new Date().toISOString(), books: metas.sort((a, b) => a.order - b.order) }
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2))
console.log(`写入 ${metas.length} 本词书到 public/books/`)

// 词典分片
rmSync(DICT_OUT, { recursive: true, force: true })
mkdirSync(DICT_OUT, { recursive: true })
const shards = new Map<string, DictEntry[]>()
for (const [key, entry] of dict) {
  const s = shardOf(key)
  if (!shards.has(s)) shards.set(s, [])
  shards.get(s)!.push(entry)
}
let total = 0
for (const [s, list] of shards) {
  list.sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
  const json = JSON.stringify(list)
  total += json.length
  writeFileSync(join(DICT_OUT, `${s}.json`), json)
}
console.log(`常用词典：${dict.size} 词，${shards.size} 个分片，共 ${(total / 1024 / 1024).toFixed(1)}MB`)
