// 把一条 KyleBing 词条和（可选的）ECDICT 词条合并成统一格式 Word
import type { Meaning, Word } from '../../src/types/vocab.ts'
import { cleanMeaning, ecdictPosList, normalizePhonetic, normalizePos, pickExamples, pickPhrases } from './clean.ts'
import type { EcEntry } from './sources/ecdict.ts'
import type { KbEntry } from './sources/kylebing.ts'

/** ECDICT 释义行 → Meaning（KyleBing 没给释义时才用），跳过 [计] [网络] 这类专业/网络释义 */
function ecMeanings(ec: EcEntry, max = 3): Meaning[] {
  const out: Meaning[] = []
  for (const line of ec.translation.split(/\\n|\n|\r/)) {
    const t = line.trim()
    if (!t || t.startsWith('[')) continue
    const m = t.match(/^([a-z]+)\.\s*(.*)$/)
    out.push(m ? { pos: normalizePos(m[1]), cn: cleanMeaning(m[2]) } : { pos: '', cn: cleanMeaning(t) })
    if (out.length >= max) break
  }
  return out
}

/** 词头清洗：去掉误加的句末句号（"go swimming." / "wear." → 去掉句号），保留 a.m. / p.m. 这类中间也有点的缩写 */
export function cleanHeadword(w: string): string {
  const t = w.replace(/\s+/g, ' ').trim()
  return /^[^.]{2,}\.$/.test(t) ? t.slice(0, -1) : t
}

export function mergeEntry(kbRaw: KbEntry, ec?: EcEntry): Word {
  const kb = { ...kbRaw, word: cleanHeadword(kbRaw.word) }
  const ecPos = ec ? ecdictPosList(ec.translation) : []

  let meanings: Meaning[] = kb.trans.map((t) => ({ pos: normalizePos(t.pos), cn: cleanMeaning(t.cn) }))
  if (!meanings.length && ec) meanings = ecMeanings(ec)
  // 人教小学词书完全没有词性：第一条释义补上 ECDICT 的主词性，其余留空，避免张冠李戴
  if (meanings.length && meanings.every((m) => !m.pos) && ecPos.length) {
    meanings[0] = { ...meanings[0], pos: ecPos[0] }
  }
  // 多词条目（go to bed / of course）没有词性，标成短语
  if (kb.word.includes(' ') && meanings.length && meanings.every((m) => !m.pos)) {
    meanings[0] = { ...meanings[0], pos: 'phr.' }
  }

  const word: Word = {
    id: kb.word.toLowerCase(),
    word: kb.word,
    meanings,
    examples: pickExamples(kb.sentences),
    phrases: pickPhrases(kb.phrases, kb.word),
    tags: ec?.tag ? ec.tag.split(/\s+/).filter(Boolean) : [],
  }
  const uk = normalizePhonetic(kb.uk) ?? normalizePhonetic(kb.phone) ?? normalizePhonetic(ec?.phonetic)
  const us = normalizePhonetic(kb.us) ?? normalizePhonetic(kb.phone)
  if (uk) word.uk = uk
  if (us) word.us = us
  if (ec?.frq) word.frq = ec.frq
  return word
}

export interface Overrides {
  /** 按单词 id 覆盖字段，例如修正释义或例句 */
  words?: Record<string, Partial<Omit<Word, 'id'>>>
  /** 按词书 id 删除词条 */
  remove?: Record<string, string[]>
}

export function applyOverrides(bookId: string, words: Word[], ov: Overrides): Word[] {
  const removed = new Set(ov.remove?.[bookId] ?? [])
  return words.filter((w) => !removed.has(w.id)).map((w) => (ov.words?.[w.id] ? { ...w, ...ov.words[w.id], id: w.id } : w))
}

/** 同一本书里去重（保留首次出现） */
export function dedupe(words: Word[]): Word[] {
  const seen = new Set<string>()
  return words.filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)))
}
