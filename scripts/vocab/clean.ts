// 纯函数：字段清洗规则。全部有单元测试。
import type { Example, Phrase } from '../../src/types/vocab.ts'

/**
 * 音标规范化：
 * - 多个变体只取第一个（"'əu'kei, ,əu'kei" → əuˈkei 的第一个）
 * - ' → ˈ，行首或空格后的 , → ˌ，: → ː
 * - 西里尔字母 ә（ECDICT 里常见）→ IPA ə
 * - 去掉首尾的 / [ ]
 */
export function normalizePhonetic(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined
  let s = raw.trim()
  if (!s) return undefined
  s = s.replace(/^[/[]+|[/\]]+$/g, '')
  // 变体分隔："a, b" 或 "a; b"。注意 ",əu" 是次重音不是分隔符，所以要求逗号后跟空格
  s = s.split(/[;；]\s*|,\s+(?=[,'ˈˌ]?[^\s,])/)[0]
  s = s
    .replace(/ә/g, 'ə')
    .replace(/'/g, 'ˈ')
    .replace(/(^|\s),/g, '$1ˌ')
    .replace(/:/g, 'ː')
    .replace(/\s+/g, ' ')
    .trim()
  return s || undefined
}

const POS_MAP: Record<string, string> = {
  n: 'n.', noun: 'n.',
  v: 'v.', vt: 'vt.', vi: 'vi.', verb: 'v.',
  adj: 'adj.', a: 'adj.',
  adv: 'adv.', ad: 'adv.',
  prep: 'prep.', pron: 'pron.', conj: 'conj.', num: 'num.',
  art: 'art.', int: 'int.', interj: 'int.', aux: 'aux.', abbr: 'abbr.',
}

export function normalizePos(raw: string | undefined | null): string {
  if (!raw) return ''
  const k = raw.trim().toLowerCase().replace(/\.$/, '')
  return POS_MAP[k] ?? ''
}

/** 从 ECDICT translation 字段（"n. 统治者, 尺\nvt. ..."）里取出各行词性，按出现顺序 */
export function ecdictPosList(translation: string): string[] {
  const out: string[] = []
  for (const line of translation.split(/\\n|\n|\r/)) {
    const m = line.trim().match(/^([a-z]+)\.\s/)
    if (!m) continue
    const pos = normalizePos(m[1])
    if (pos && !out.includes(pos)) out.push(pos)
  }
  return out
}

/** 例句清洗：去掉 "(= …)" 批注、标点前多余空格、弯引号 */
export function cleanSentence(s: string): string {
  return s
    .replace(/\s*\(\s*=[^)]*\)\s*/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 挑例句：清洗、去重、去掉超长的，按长度从短到长取前 n 句（初学者优先短句） */
export function pickExamples(raw: Example[], n = 3, maxLen = 90): Example[] {
  const seen = new Set<string>()
  const cleaned: Example[] = []
  for (const e of raw) {
    const en = cleanSentence(e.en)
    const cn = e.cn.trim()
    if (!en || !cn) continue
    const key = en.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push({ en, cn })
  }
  const short = cleaned.filter((e) => e.en.length <= maxLen)
  const pool = short.length ? short : cleaned
  return [...pool].sort((a, b) => a.en.length - b.en.length).slice(0, n)
}

// 翻译看起来是书名、机构、作品名的短语，对背单词没帮助
const PHRASE_NOISE = /[《》]|教程|出版社|公司|大学|学院|杂志|电影|歌曲|专辑|乐队|节目名|小说|游戏|软件|^\s*$/

/** 短语清洗：去噪、去掉翻译里的词性前缀、去重、最多 n 条（保留原顺序，原顺序大致按常用度） */
export function pickPhrases(raw: { en: string; cn: string }[], headword: string, n = 5): Phrase[] {
  const seen = new Set<string>()
  const out: Phrase[] = []
  const head = headword.toLowerCase()
  for (const p of raw) {
    const en = p.en.replace(/\s+/g, ' ').trim()
    const cn = p.cn.replace(/^\s*[a-z]+\.\s*/i, '').trim()
    const id = en.toLowerCase()
    if (!en || !cn || id === head || seen.has(id)) continue
    if (PHRASE_NOISE.test(cn)) continue
    seen.add(id)
    out.push({ id, en, cn })
    if (out.length >= n) break
  }
  return out
}

/** 中文释义清洗：去首尾空白、统一分号 */
export function cleanMeaning(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/;\s*/g, '；').trim()
}
