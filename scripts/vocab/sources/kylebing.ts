// 解析 KyleBing full_line_jsonl/full 格式（一行一个 JSON）
export interface KbEntry {
  bookId: string
  rank: number
  word: string
  uk?: string
  us?: string
  /** 只有 4 个缩写词（OK/UK/USA 等）会用到的通用音标 */
  phone?: string
  trans: { pos?: string; cn: string }[]
  sentences: { en: string; cn: string }[]
  phrases: { en: string; cn: string }[]
}

interface RawLine {
  bookId: string
  wordRank: number
  headWord: string
  content: { word: { content: RawContent } }
}
interface RawContent {
  ukphone?: string
  usphone?: string
  phone?: string
  trans?: { pos?: string; tranCn?: string }[]
  sentence?: { sentences?: { sContent?: string; sCn?: string }[] }
  phrase?: { phrases?: { pContent?: string; pCn?: string }[] }
}

export function parseKbLine(line: string): KbEntry {
  const r = JSON.parse(line) as RawLine
  const c = r.content.word.content
  return {
    bookId: r.bookId,
    rank: r.wordRank,
    word: r.headWord.trim(),
    uk: c.ukphone,
    us: c.usphone,
    phone: c.phone,
    trans: (c.trans ?? [])
      .filter((t) => t.tranCn?.trim())
      .map((t) => ({ pos: t.pos, cn: t.tranCn!.trim() })),
    sentences: (c.sentence?.sentences ?? []).map((s) => ({ en: s.sContent ?? '', cn: s.sCn ?? '' })),
    phrases: (c.phrase?.phrases ?? []).map((p) => ({ en: p.pContent ?? '', cn: p.pCn ?? '' })),
  }
}

export function parseKbFile(text: string): KbEntry[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map(parseKbLine)
}
