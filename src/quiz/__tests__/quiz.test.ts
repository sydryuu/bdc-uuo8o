import { describe, expect, it } from 'vitest'
import type { Word } from '../../types/vocab'
import { buildQuiz, chooseQuizType, pickDistractors, shortMeaning } from '../quiz'

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

describe('chooseQuizType', () => {
  it('第一次见是看英文选中文，之后不连续重复', () => {
    expect(chooseQuizType(0, undefined, seeded())).toBe('en2cn')
    expect(chooseQuizType(1, 'en2cn', seeded())).toBe('cn2en')
    expect(chooseQuizType(2, 'cn2en', seeded())).toBe('en2cn')
  })
})
