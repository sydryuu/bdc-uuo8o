// 构建词书：data/raw → public/books/*.json + index.json
// 用法：npm run vocab:fetch && npm run vocab:build
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BookFile, BookIndex, BookMeta } from '../../src/types/vocab.ts'
import { BOOKS, STAGE_NAMES } from './config.ts'
import { applyOverrides, cleanHeadword, dedupe, mergeEntry, type Overrides } from './merge.ts'
import { loadEcdict } from './sources/ecdict.ts'
import { parseKbFile, type KbEntry } from './sources/kylebing.ts'

const ROOT = join(import.meta.dirname, '../..')
const RAW = join(ROOT, 'data/raw')
const OUT = join(ROOT, 'public/books')

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
    .sort((a, b) => a.rank - b.rank)
}

const perBook = BOOKS.map((spec) => ({ spec, entries: entriesFor(spec) }))

// 只把用得到的词从 ECDICT 里挑出来
const wanted = new Map<string, string>()
for (const { entries } of perBook) for (const e of entries) {
  const w = cleanHeadword(e.word)
  wanted.set(w.toLowerCase(), w)
}
console.log(`读取 ECDICT（${wanted.size} 个目标词）…`)
const ec = await loadEcdict(join(RAW, 'ecdict.csv'), wanted)

const ovPath = join(ROOT, 'data/overrides/overrides.json')
const overrides: Overrides = existsSync(ovPath) ? JSON.parse(readFileSync(ovPath, 'utf8')) : {}

mkdirSync(OUT, { recursive: true })
const metas: BookMeta[] = []
for (const { spec, entries } of perBook) {
  const words = applyOverrides(spec.id, dedupe(entries.map((e) => mergeEntry(e, ec.get(cleanHeadword(e.word).toLowerCase())))), overrides)
  const body = JSON.stringify(words)
  const version = createHash('sha1').update(body).digest('hex').slice(0, 10)
  const file: BookFile = { id: spec.id, name: spec.name, version, words }
  writeFileSync(join(OUT, `${spec.id}.json`), JSON.stringify(file))
  metas.push({
    id: spec.id,
    name: spec.name,
    stage: spec.stage,
    stageName: STAGE_NAMES[spec.stage],
    order: spec.order,
    wordCount: words.length,
    version,
    file: `books/${spec.id}.json`,
  })
  // 统计只看单个词；短语本来就没有音标
  const single = words.filter((w) => !w.id.includes(' '))
  const miss = (f: (w: (typeof words)[number]) => boolean) => single.filter(f).length
  console.log(
    `${spec.name.padEnd(12)} ${String(words.length).padStart(4)} 词（短语 ${words.length - single.length}）| 单词缺英音 ${miss((w) => !w.uk)} 缺美音 ${miss((w) => !w.us)} ` +
      `缺词性 ${miss((w) => !w.meanings[0]?.pos)} 无例句 ${miss((w) => !w.examples.length)} 无短语 ${miss((w) => !w.phrases.length)} ` +
      `| ${(body.length / 1024).toFixed(0)}KB`,
  )
}

const index: BookIndex = { generatedAt: new Date().toISOString(), books: metas.sort((a, b) => a.order - b.order) }
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2))
console.log(`写入 ${metas.length} 本词书到 public/books/`)
