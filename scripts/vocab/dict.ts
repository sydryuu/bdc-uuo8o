// 常用词典：从 ECDICT 挑约 3 万个常用词，给查词和自定义导入补全用
import type { DictEntry } from '../../src/types/vocab.ts'
import { cleanMeaning, normalizePhonetic, normalizePos } from './clean.ts'
import type { EcEntry } from './sources/ecdict.ts'

export const DICT_RANK_LIMIT = 30000

/** 收录标准：单个英文词，有中文释义，并且（词频前 3 万 / BNC 前 3 万 / 有考试标签 / 柯林斯星级 / 牛津核心词） */
export function inDict(e: EcEntry): boolean {
  if (!/^[A-Za-z][A-Za-z'-]*$/.test(e.word) || !e.translation.trim()) return false
  const ranked = (n: number) => n > 0 && n <= DICT_RANK_LIMIT
  return ranked(e.frq) || ranked(e.bnc) || !!e.tag.trim() || e.collins > 0 || e.oxford
}

/** ECDICT 条目 → 词典条目：最多 3 行释义，跳过 [计] [网络] 这类行，单行过长时截断 */
export function toDictEntry(e: EcEntry): DictEntry {
  const meanings: [string, string][] = []
  for (const line of e.translation.split(/\\n|\n|\r/)) {
    const t = line.trim()
    if (!t || t.startsWith('[')) continue
    const m = t.match(/^([a-z]+)\.\s*(.*)$/)
    let cn = cleanMeaning(m ? m[2] : t).replace(/,\s*/g, '，')
    if (cn.length > 40) cn = cn.slice(0, 40).replace(/[，；][^，；]*$/, '')
    if (cn) meanings.push([m ? normalizePos(m[1]) : '', cn])
    if (meanings.length >= 3) break
  }
  return [e.word, normalizePhonetic(e.phonetic) ?? '', meanings]
}

/** 分片键：首字母 a–z，其余归到 "_" */
export const shardOf = (word: string) => {
  const c = word[0]?.toLowerCase() ?? '_'
  return c >= 'a' && c <= 'z' ? c : '_'
}

/** 考试词书的新词顺序：常用词先学。词频未知的（多为短语）排在最后，保持原顺序 */
export function frequencyRank(e?: Pick<EcEntry, 'frq' | 'bnc'>): number {
  if (!e) return Infinity
  if (e.frq > 0) return e.frq
  if (e.bnc > 0) return e.bnc + 0.5 // 只有 BNC 词频时略靠后
  return Infinity
}
