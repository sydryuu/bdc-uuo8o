// 出题：纯函数。阶段 1 两种题型（看英文选中文、看中文选英文），阶段 2 会加更多
import type { QuizType } from '../db/db'
import type { Word } from '../types/vocab'

export type Rng = () => number

export interface QuizOption {
  key: string
  label: string
  correct: boolean
}

export interface Quiz {
  type: QuizType
  word: Word
  options: QuizOption[]
}

export const QUIZ_TYPES: QuizType[] = ['en2cn', 'cn2en']

const isPhrase = (w: Word) => w.id.includes(' ')
const primaryPos = (w: Word) => w.meanings[0]?.pos ?? ''

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

/**
 * 干扰项：优先同词性、同类型（单词配单词、短语配短语），不够再从其余里补。
 * 排除释义和目标完全一样的词，避免出现两个正确答案。
 */
export function pickDistractors(target: Word, pool: Word[], n: number, rng: Rng): Word[] {
  const tMeaning = shortMeaning(target)
  const seenMeaning = new Set([tMeaning])
  const seenWord = new Set([target.id])
  const ok = pool.filter((w) => {
    if (seenWord.has(w.id)) return false
    const m = shortMeaning(w)
    if (!m || m === tMeaning) return false
    return true
  })
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
      if (seenWord.has(w.id) || seenMeaning.has(m)) continue
      seenWord.add(w.id)
      seenMeaning.add(m)
      out.push(w)
    }
  }
  return out
}

/** 题型轮换：第一次见看英文选中文（最容易），之后换着来，不连续两次同一种 */
export function chooseQuizType(encounters: number, last: QuizType | undefined, rng: Rng): QuizType {
  if (encounters === 0) return 'en2cn'
  const choices = QUIZ_TYPES.filter((t) => t !== last)
  return choices[Math.floor(rng() * choices.length)]
}

export function buildQuiz(type: QuizType, word: Word, pool: Word[], rng: Rng): Quiz {
  const distractors = pickDistractors(word, pool, 3, rng)
  const label = (w: Word) => (type === 'en2cn' ? shortMeaning(w) : w.word)
  const options = shuffle(
    [word, ...distractors].map((w) => ({ key: w.id, label: label(w), correct: w.id === word.id })),
    rng,
  )
  return { type, word, options }
}
