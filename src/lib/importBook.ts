// 自定义词书导入：解析 CSV / JSON，用词库和常用词典补全缺的字段。纯函数，方便测试。
import type { DictEntry, Example, Meaning, Word } from '../types/vocab'

export interface ImportRow {
  word: string
  meaning?: string
  uk?: string
  us?: string
  pos?: string
  example?: string
  exampleCn?: string
}

export interface ParseResult {
  rows: ImportRow[]
  /** 跳过的行（行号从 1 开始）和原因 */
  skipped: { line: number; reason: string }[]
}

/** 解析一行 CSV，支持双引号包裹和 "" 转义 */
export function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') (cur += '"'), i++
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"' && cur === '') q = true
    else if (c === sep) out.push(cur.trim()), (cur = '')
    else cur += c
  }
  out.push(cur.trim())
  return out
}

// 表头别名 → 字段
const HEADERS: Record<string, keyof ImportRow> = {
  word: 'word', 单词: 'word', 英文: 'word', english: 'word',
  meaning: 'meaning', 释义: 'meaning', 中文: 'meaning', 意思: 'meaning', translation: 'meaning', chinese: 'meaning',
  uk: 'uk', 英音: 'uk', phonetic: 'uk', 音标: 'uk',
  us: 'us', 美音: 'us',
  pos: 'pos', 词性: 'pos',
  example: 'example', 例句: 'example', sentence: 'example',
  example_cn: 'exampleCn', examplecn: 'exampleCn', 例句翻译: 'exampleCn', 例句中文: 'exampleCn',
}
const DEFAULT_COLS: (keyof ImportRow)[] = ['word', 'meaning', 'uk', 'example', 'exampleCn']

const isEnglishWord = (s: string) => /^[A-Za-z][A-Za-z0-9 '’.\-!?,()…]*$/.test(s) && s.length <= 60

export function parseCsv(text: string): ParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const first = lines.find((l) => l.trim()) ?? ''
  const sep = first.includes('\t') ? '\t' : first.includes(',') ? ',' : first.includes('，') ? '，' : ','
  let cols = DEFAULT_COLS
  let start = 0
  const head = parseCsvLine(first, sep).map((h) => h.toLowerCase().replace(/\s+/g, '_'))
  if (head.some((h) => HEADERS[h])) {
    cols = head.map((h) => HEADERS[h] ?? ('' as keyof ImportRow))
    start = lines.indexOf(first) + 1
  }
  const rows: ImportRow[] = []
  const skipped: ParseResult['skipped'] = []
  for (let i = start; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const cells = parseCsvLine(lines[i], sep)
    const row: ImportRow = { word: '' }
    cols.forEach((c, j) => {
      if (c && cells[j]) row[c] = cells[j]
    })
    if (!row.word) skipped.push({ line: i + 1, reason: '没有单词' })
    else if (!isEnglishWord(row.word)) skipped.push({ line: i + 1, reason: `"${row.word}" 不像英文单词` })
    else rows.push(row)
  }
  return { rows, skipped }
}

/** JSON：字符串数组、对象数组，或本应用导出的词书文件 {words: Word[]} */
export function parseJson(text: string): ParseResult {
  const data = JSON.parse(text)
  const list: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.words) ? data.words : []
  const rows: ImportRow[] = []
  const skipped: ParseResult['skipped'] = []
  list.forEach((item, i) => {
    let row: ImportRow | null = null
    if (typeof item === 'string') row = { word: item.trim() }
    else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
      const meanings = Array.isArray(o.meanings) ? (o.meanings as Meaning[]) : null
      const examples = Array.isArray(o.examples) ? (o.examples as Example[]) : null
      row = {
        word: str(o.word) ?? '',
        meaning: str(o.meaning) ?? str(o.translation) ?? (meanings ? meanings.map((m) => m.cn).join('；') : undefined),
        pos: str(o.pos) ?? meanings?.[0]?.pos,
        uk: str(o.uk) ?? str(o.phonetic),
        us: str(o.us),
        example: str(o.example) ?? examples?.[0]?.en,
        exampleCn: str(o.exampleCn) ?? str(o.example_cn) ?? examples?.[0]?.cn,
      }
    }
    if (!row?.word) skipped.push({ line: i + 1, reason: '没有单词' })
    else if (!isEnglishWord(row.word)) skipped.push({ line: i + 1, reason: `"${row.word}" 不像英文单词` })
    else rows.push(row)
  })
  return { rows, skipped }
}

export function parseImport(text: string, filename: string): ParseResult {
  const t = text.trim()
  if (/\.json$/i.test(filename) || t.startsWith('[') || t.startsWith('{')) return parseJson(t)
  return parseCsv(text)
}

export interface FillSource {
  /** 已下载词书里的完整词条（有例句、短语） */
  library: Map<string, Word>
  /** 常用词典 */
  dict: Map<string, DictEntry>
}

export type FillOrigin = 'library' | 'dict' | 'user'

/**
 * 把导入行变成 Word：
 * - 词库里已有的词：直接用词库的完整数据（多本书共用一个词条，不覆盖）
 * - 否则用常用词典补音标、释义；用户填的内容优先
 * - 都没有：只有用户填的内容（没释义的会被标记）
 */
export function fillRows(rows: ImportRow[], src: FillSource): { words: Word[]; origins: FillOrigin[]; noMeaning: string[] } {
  const words: Word[] = []
  const origins: FillOrigin[] = []
  const noMeaning: string[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    const word = r.word.replace(/\s+/g, ' ').trim()
    const id = word.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    const lib = src.library.get(id)
    if (lib) {
      words.push(lib)
      origins.push('library')
      continue
    }
    const d = src.dict.get(id)
    const meanings: Meaning[] = r.meaning
      ? [{ pos: r.pos ? r.pos.replace(/\.?$/, '.') : (d?.[2][0]?.[0] ?? ''), cn: r.meaning }]
      : (d?.[2].map(([pos, cn]) => ({ pos, cn })) ?? [])
    if (!meanings.length) noMeaning.push(word)
    const w: Word = {
      id,
      word: d && !r.word.match(/[A-Z]/) ? d[0] : word,
      meanings,
      examples: r.example ? [{ en: r.example, cn: r.exampleCn ?? '' }] : [],
      phrases: [],
      tags: [],
    }
    const uk = r.uk?.replace(/^[/[]|[/\]]$/g, '') || d?.[1]
    if (uk) w.uk = uk
    if (r.us) w.us = r.us.replace(/^[/[]|[/\]]$/g, '')
    words.push(w)
    origins.push(d ? 'dict' : 'user')
  }
  return { words, origins, noMeaning }
}
