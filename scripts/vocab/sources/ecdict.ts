// 流式读取 ECDICT CSV，只保留需要的词（整份 65MB，不能整体载入内存再处理）
import { createReadStream } from 'node:fs'
import { parse } from 'csv-parse'

export interface EcEntry {
  word: string
  phonetic: string
  translation: string
  tag: string
  frq: number
}

export function toEcEntry(row: Record<string, string>): EcEntry {
  return {
    word: row.word,
    phonetic: row.phonetic ?? '',
    translation: row.translation ?? '',
    tag: row.tag ?? '',
    frq: Number(row.frq) || 0,
  }
}

/** 返回 小写词 → 条目。同一个小写词有多条（如 OK / ok）时，优先大小写完全一致的 */
export async function loadEcdict(path: string, wanted: Map<string, string>): Promise<Map<string, EcEntry>> {
  const out = new Map<string, EcEntry>()
  const parser = createReadStream(path).pipe(parse({ columns: true, relax_quotes: true, relax_column_count: true }))
  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    const key = row.word?.toLowerCase()
    if (!key || !wanted.has(key)) continue
    const exact = row.word === wanted.get(key)
    if (out.has(key) && !exact) continue
    out.set(key, toEcEntry(row))
  }
  return out
}
