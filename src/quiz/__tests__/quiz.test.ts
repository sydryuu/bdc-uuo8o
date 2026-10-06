import { describe, expect, it } from 'vitest'
import type { Word } from '../../types/vocab'
import { createEmptyCard } from 'ts-fsrs'
import { State, type Card } from '../../srs/scheduler'
import {
  buildQuiz,
  canSpell,
  checkSpelling,
  chooseQuizType,
  collocations,
  eligibleTypes,
  makeCloze,
  phraseAsWord,
  pickDistractors,
  quizLevel,
  shortMeaning,
} from '../quiz'

const w = (id: string, pos: string, cn: string): Word => ({ id, word: id, meanings: [{ pos, cn }], examples: [], phrases: [], tags: [] })

// 固定种子的伪随机，保证测试可重复
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

const POOL = [
  w('ruler', 'n.', '尺子'),
  w('pen', 'n.', '钢笔'),
  w('pencil', 'n.', '铅笔'),
  w('book', 'n.', '书；书籍；书本'),
  w('red', 'adj.', '红色的'),
  w('green', 'adj.', '绿色的'),
  w('run', 'v.', '跑'),
  w('go to bed', 'phr.', '上床睡觉'),
  w('biro', 'n.', '钢笔'), // 和 pen 释义相同
]

describe('shortMeaning', () => {
  it('只取前两个义项', () => expect(shortMeaning(POOL[3])).toBe('书；书籍'))
})

describe('pickDistractors', () => {
  it('优先同词性，且不含目标本身', () => {
    const d = pickDistractors(POOL[0], POOL, 3, seeded())
    expect(d).toHaveLength(3)
    expect(d.map((x) => x.id)).not.toContain('ruler')
    expect(d.every((x) => x.meanings[0].pos === 'n.')).toBe(true)
  })
  it('排除和目标释义相同的词，干扰项之间释义也不重复', () => {
    for (let seed = 1; seed < 30; seed++) {
      const d = pickDistractors(POOL[1], POOL, 3, seeded(seed))
      expect(d.map((x) => x.id)).not.toContain('biro')
    }
    for (let seed = 1; seed < 30; seed++) {
      const d = pickDistractors(POOL[0], POOL, 4, seeded(seed))
      const ms = d.map(shortMeaning)
      expect(new Set(ms).size).toBe(ms.length)
    }
  })
  it('短语优先配短语，不够时从单词里补', () => {
    const d = pickDistractors(POOL[7], POOL, 3, seeded())
    expect(d).toHaveLength(3)
  })
  it('词池不够时返回能找到的全部', () => {
    expect(pickDistractors(POOL[0], POOL.slice(0, 2), 3, seeded())).toHaveLength(1)
  })
})

describe('buildQuiz', () => {
  it('看英文选中文：4 个选项，恰好一个正确，标签是中文释义', () => {
    const q = buildQuiz('en2cn', POOL[0], POOL, seeded())
    expect(q.options).toHaveLength(4)
    expect(q.options.filter((o) => o.correct)).toEqual([{ key: 'ruler', label: '尺子', correct: true }])
  })
  it('看中文选英文：标签是单词', () => {
    const q = buildQuiz('cn2en', POOL[0], POOL, seeded())
    expect(q.options.find((o) => o.correct)!.label).toBe('ruler')
  })
})

const TALK: Word = {
  id: 'talk',
  word: 'talk',
  meanings: [{ pos: 'v.', cn: '说话；谈话' }],
  examples: [
    { en: 'Talk!', cn: '说！' },
    { en: 'They talked for hours.', cn: '他们谈了几个小时。' },
    { en: 'We need to talk about it.', cn: '我们需要谈谈这件事。' },
  ],
  phrases: [
    { id: 'talk about', en: 'talk about', cn: '谈论某事' },
    { id: 'small talk', en: 'small talk', cn: '闲聊' },
    { id: 'chat show', en: 'chat show', cn: '访谈节目' }, // 不含 talk，不算搭配
  ],
  tags: [],
}

const reviewCard = (days: number): Card => ({ ...createEmptyCard(), state: State.Review, scheduled_days: days }) as Card

describe('熟练度与可出题型', () => {
  it('quizLevel：新词/学习中 0，间隔 ≥3 天 1，≥7 天 2', () => {
    expect(quizLevel(null)).toBe(0)
    expect(quizLevel({ ...createEmptyCard(), state: State.Learning } as Card)).toBe(0)
    expect(quizLevel(reviewCard(2))).toBe(0)
    expect(quizLevel(reviewCard(3))).toBe(1)
    expect(quizLevel(reviewCard(7))).toBe(2)
  })
  it('新词只出选择题和听音；熟了才出搭配、填空、拼写', () => {
    expect(eligibleTypes(TALK, 0)).toEqual(['en2cn', 'cn2en', 'listen'])
    expect(eligibleTypes(TALK, 1)).toEqual(['en2cn', 'cn2en', 'listen', 'phrase', 'cloze'])
    expect(eligibleTypes(TALK, 2)).toEqual(['en2cn', 'cn2en', 'listen', 'phrase', 'cloze', 'spell'])
  })
  it('没有例句、短语的词不出对应题型；短语卡只出三种基础题', () => {
    expect(eligibleTypes(POOL[0], 2)).toEqual(['en2cn', 'cn2en', 'listen', 'spell'])
    expect(eligibleTypes(TALK, 2, true)).toEqual(['en2cn', 'cn2en', 'listen'])
  })
  it('没有释义的词只出听音选词，第一次见也一样', () => {
    const bare = { ...TALK, meanings: [] }
    expect(eligibleTypes(bare, 2)).toEqual(['listen'])
    expect(chooseQuizType(eligibleTypes(bare, 0), undefined, true, seeded())).toBe('listen')
  })
  it('chooseQuizType：第一次见固定英选中，之后不连续重复', () => {
    const types = eligibleTypes(TALK, 2)
    expect(chooseQuizType(types, undefined, true, seeded())).toBe('en2cn')
    for (let seed = 1; seed < 40; seed++) {
      const t = chooseQuizType(types, 'spell', false, seeded(seed))
      expect(t).not.toBe('spell')
      expect(types).toContain(t)
    }
    expect(chooseQuizType(['en2cn'], 'en2cn', false, seeded())).toBe('en2cn')
  })
})

describe('拼写', () => {
  it('canSpell 只接受纯字母词', () => {
    expect(canSpell(TALK)).toBe(true)
    expect(canSpell(w('pencil box', 'phr.', '铅笔盒'))).toBe(true)
    expect(canSpell(w('a.m.', '', '上午'))).toBe(false)
    expect(canSpell(w('how about...', '', '怎么样'))).toBe(false)
  })
  it('checkSpelling 忽略大小写、首尾空格、多余空格和弯撇号', () => {
    const ok = w('OK', 'adj.', '好')
    expect(checkSpelling(' ok ', ok)).toBe(true)
    expect(checkSpelling('pencil  box', w('pencil box', 'phr.', '铅笔盒'))).toBe(true)
    expect(checkSpelling('don’t', w("don't", 'v.', '不要'))).toBe(true)
    expect(checkSpelling('talks', TALK)).toBe(false)
  })
})

describe('例句填空', () => {
  it('挖掉带词尾的形式，优先 4 个词以上的句子', () => {
    expect(makeCloze(TALK)).toEqual({ before: 'They ', answer: 'talked', after: ' for hours.', cn: '他们谈了几个小时。' })
  })
  it('不会匹配到别的词里（talk 不匹配 talkative / stalk）', () => {
    const t = { ...TALK, examples: [{ en: 'She is very talkative today.', cn: '' }, { en: 'Cats stalk the bird.', cn: '' }] }
    expect(makeCloze(t)).toBeNull()
  })
  it('句子太短不出', () => {
    expect(makeCloze({ ...TALK, examples: [{ en: 'Talk!', cn: '说！' }] })).toBeNull()
  })
  it('buildQuiz 填空题：选项是单词，正确项是目标词', () => {
    const q = buildQuiz('cloze', TALK, POOL, seeded())
    expect(q.cloze!.answer).toBe('talked')
    expect(q.options.find((o) => o.correct)!.label).toBe('talk')
  })
})

describe('短语搭配', () => {
  it('collocations 只保留含词头的短语', () => {
    expect(collocations(TALK).map((p) => p.id)).toEqual(['talk about', 'small talk'])
  })
  it('考一条搭配短语，选项都是短语且释义互不相同', () => {
    for (let seed = 1; seed < 20; seed++) {
      const q = buildQuiz('phrase', TALK, POOL, seeded(seed))
      expect(['talk about', 'small talk']).toContain(q.phrase!.id)
      expect(q.options.filter((o) => o.correct)).toHaveLength(1)
      expect(q.options.find((o) => o.correct)!.key).toBe(q.phrase!.id)
    }
  })
  it('没有搭配短语时退回英选中', () => {
    expect(buildQuiz('phrase', POOL[0], POOL, seeded()).type).toBe('en2cn')
  })
})

describe('短语卡', () => {
  it('phraseAsWord 让短语复用单词题型', () => {
    const pw = phraseAsWord(TALK.phrases[0])
    expect(pw).toMatchObject({ id: 'talk about', word: 'talk about', meanings: [{ pos: 'phr.', cn: '谈论某事' }] })
    const pool = POOL.concat(TALK).flatMap((x) => x.phrases).map(phraseAsWord)
    const q = buildQuiz('cn2en', pw, pool, seeded())
    expect(q.options.find((o) => o.correct)!.label).toBe('talk about')
  })
})

describe('听音选词', () => {
  it('选项是单词', () => {
    const q = buildQuiz('listen', POOL[0], POOL, seeded())
    expect(q.options).toHaveLength(4)
    expect(q.options.find((o) => o.correct)!.label).toBe('ruler')
  })
})
