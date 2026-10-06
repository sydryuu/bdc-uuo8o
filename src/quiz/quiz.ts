// 出题：纯函数。
// 六种题型按熟练度递进：新词和学习中只出选择题和听音选词；
// 复习间隔 ≥3 天加入短语搭配、例句填空；≥7 天加入拼写。
import type { QuizType } from '../db/db'
import { State, type Card } from '../srs/scheduler'
import type { Phrase, Word } from '../types/vocab'

export type Rng = () => number

export interface QuizOption {
  key: string
  label: string
  correct: boolean
}

export interface Cloze {
  before: string
  /** 句子里实际出现的形式（可能带 -s/-ed/-ing） */
  answer: string
  after: string
  cn: string
}

export interface Quiz {
  type: QuizType
  /** 考查对象；短语卡时是由短语转成的"伪单词" */
  word: Word
  /** 选择题选项；拼写题为空 */
  options: QuizOption[]
  cloze?: Cloze
  /** 短语搭配题考的那条短语 */
  phrase?: Phrase
}

export const QUIZ_LABEL: Record<QuizType, string> = {
  en2cn: '英选中',
  cn2en: '中选英',
  listen: '听音选词',
  spell: '拼写',
  cloze: '例句填空',
  phrase: '短语搭配',
}

const isPhrase = (w: Word) => w.id.includes(' ')
const primaryPos = (w: Word) => w.meanings[0]?.pos ?? ''
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 选项里显示的简短中文释义：第一条释义的前两个义项 */
export function shortMeaning(w: Word): string {
  const m = w.meanings[0]
  if (!m) return ''
  return m.cn
    .split(/[；;]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('；')
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 短语 → 伪单词，让短语卡复用单词的题型 */
export function phraseAsWord(p: Phrase): Word {
  return { id: p.id, word: p.en, meanings: [{ pos: 'phr.', cn: p.cn }], examples: [], phrases: [], tags: [] }
}

/**
 * 干扰项：优先同词性、同类型（单词配单词、短语配短语），不够再从其余里补。
 * 排除释义和目标完全一样的词，避免出现两个正确答案。
 */
export function pickDistractors(target: Word, pool: Word[], n: number, rng: Rng): Word[] {
  const tMeaning = shortMeaning(target)
  const tWord = target.word.toLowerCase()
  const seenMeaning = new Set([tMeaning])
  const seenWord = new Set([target.id, tWord])
  const ok = pool.filter((w) => !seenWord.has(w.id) && w.word.toLowerCase() !== tWord && shortMeaning(w) && shortMeaning(w) !== tMeaning)
  const tiers = [
    ok.filter((w) => isPhrase(w) === isPhrase(target) && primaryPos(w) === primaryPos(target)),
    ok.filter((w) => isPhrase(w) === isPhrase(target)),
    ok,
  ]
  const out: Word[] = []
  for (const tier of tiers) {
    for (const w of shuffle(tier, rng)) {
      if (out.length >= n) return out
      const m = shortMeaning(w)
      if (seenWord.has(w.id) || seenWord.has(w.word.toLowerCase()) || seenMeaning.has(m)) continue
      seenWord.add(w.id)
      seenWord.add(w.word.toLowerCase())
      seenMeaning.add(m)
      out.push(w)
    }
  }
  return out
}

// ---------- 各题型能不能出 ----------

/** 拼写题只考纯字母（可含空格、连字符、撇号）且不太长的词 */
export const canSpell = (w: Word) => /^[A-Za-z][A-Za-z' -]*$/.test(w.word) && w.word.length <= 20

export const normalizeAnswer = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

export const checkSpelling = (input: string, w: Word) => normalizeAnswer(input) === normalizeAnswer(w.word)

/** 例句挖空：在例句里找这个词（允许 -s/-es/-ed/-d/-ing 词尾），句子至少 3 个词 */
export function makeCloze(w: Word): Cloze | null {
  if (!canSpell(w)) return null
  const re = new RegExp(`(^|[^A-Za-z'])(${escapeRe(w.word)}(?:s|es|ed|d|ing)?)(?![A-Za-z])`, 'i')
  const candidates = w.examples
    .map((e) => ({ e, m: e.en.match(re) }))
    .filter((x) => x.m && x.e.en.split(/\s+/).length >= 3)
  // 优先 4 个词以上的句子，信息更多
  const best = candidates.find((x) => x.e.en.split(/\s+/).length >= 4) ?? candidates[0]
  if (!best?.m) return null
  const start = best.m.index! + best.m[1].length
  const answer = best.m[2]
  return { before: best.e.en.slice(0, start), answer, after: best.e.en.slice(start + answer.length), cn: best.e.cn }
}

/** 含有词头本身的短语才适合做搭配题 */
export function collocations(w: Word): Phrase[] {
  const re = new RegExp(`(^|[^A-Za-z])${escapeRe(w.word)}(?![A-Za-z])`, 'i')
  return w.phrases.filter((p) => re.test(p.en))
}

// ---------- 熟练度和题型选择 ----------

/** 0：新词/学习中；1：复习间隔 ≥3 天；2：复习间隔 ≥7 天 */
export function quizLevel(card: Card | null): 0 | 1 | 2 {
  if (!card || card.state !== State.Review) return 0
  if (card.scheduled_days >= 7) return 2
  if (card.scheduled_days >= 3) return 1
  return 0
}

export function eligibleTypes(w: Word, level: 0 | 1 | 2, isPhraseCard = false): QuizType[] {
  // 自定义词书里没有释义的词：看释义的题都出不了，只能听音选词
  if (!shortMeaning(w)) return ['listen']
  const types: QuizType[] = ['en2cn', 'cn2en', 'listen']
  if (isPhraseCard) return types
  if (level >= 1) {
    if (collocations(w).length) types.push('phrase')
    if (makeCloze(w)) types.push('cloze')
  }
  if (level >= 2 && canSpell(w)) types.push('spell')
  return types
}

/** 第一次见固定"看英文选中文"（最容易，出不了时用第一个可出的）；之后在可出的题型里随机，不连续两次同一种 */
export function chooseQuizType(eligible: QuizType[], last: QuizType | undefined, firstExposure: boolean, rng: Rng): QuizType {
  if (firstExposure) return eligible.includes('en2cn') ? 'en2cn' : eligible[0]
  const choices = eligible.filter((t) => t !== last)
  const from = choices.length ? choices : eligible
  return from[Math.floor(rng() * from.length)]
}

// ---------- 组题 ----------

function choiceOptions(word: Word, distractors: Word[], label: (w: Word) => string, rng: Rng): QuizOption[] {
  return shuffle(
    [word, ...distractors].map((w) => ({ key: w.id, label: label(w), correct: w.id === word.id })),
    rng,
  )
}

function buildPhraseQuiz(word: Word, pool: Word[], rng: Rng): Quiz {
  const cands = collocations(word)
  const target = cands[Math.floor(rng() * cands.length)]
  // 干扰项：同一个词的其他短语（意思不同）最有迷惑性，不够再从词池的短语里补
  const seenCn = new Set([target.cn])
  const seenEn = new Set([target.id])
  const distractors: Phrase[] = []
  const take = (p: Phrase) => {
    if (distractors.length >= 3 || seenEn.has(p.id) || seenCn.has(p.cn)) return
    seenEn.add(p.id)
    seenCn.add(p.cn)
    distractors.push(p)
  }
  shuffle(word.phrases, rng).forEach(take)
  shuffle(pool.flatMap((w) => w.phrases), rng).forEach(take)
  const options = shuffle(
    [target, ...distractors].map((p) => ({ key: p.id, label: p.en, correct: p.id === target.id })),
    rng,
  )
  return { type: 'phrase', word, options, phrase: target }
}

export function buildQuiz(type: QuizType, word: Word, pool: Word[], rng: Rng): Quiz {
  switch (type) {
    case 'en2cn':
      return { type, word, options: choiceOptions(word, pickDistractors(word, pool, 3, rng), shortMeaning, rng) }
    case 'cn2en':
    case 'listen':
      return { type, word, options: choiceOptions(word, pickDistractors(word, pool, 3, rng), (w) => w.word, rng) }
    case 'cloze': {
      const cloze = makeCloze(word)
      if (!cloze) return buildQuiz('cn2en', word, pool, rng)
      return { type, word, cloze, options: choiceOptions(word, pickDistractors(word, pool, 3, rng), (w) => w.word, rng) }
    }
    case 'phrase':
      return collocations(word).length ? buildPhraseQuiz(word, pool, rng) : buildQuiz('en2cn', word, pool, rng)
    case 'spell':
      return { type, word, options: [] }
  }
}
