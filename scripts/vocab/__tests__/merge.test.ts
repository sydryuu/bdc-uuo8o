import { describe, expect, it } from 'vitest'
import { applyOverrides, cleanHeadword, dedupe, mergeEntry } from '../merge.ts'
import { toEcEntry } from '../sources/ecdict.ts'
import { parseKbLine } from '../sources/kylebing.ts'

// 与 KyleBing full_line_jsonl/full 格式一致的精简样本（来自人教小学三年级上 ruler）
const KB_RULER = JSON.stringify({
  wordRank: 1,
  headWord: 'ruler',
  bookId: 'PEPXiaoXue3_1',
  content: {
    word: {
      wordHead: 'ruler',
      content: {
        usphone: "'rulɚ",
        ukphone: "'ruːlə",
        trans: [{ tranCn: '尺子', tranOther: '...' }],
        sentence: { sentences: [{ sContent: 'a 12-inch ruler', sCn: '一把12英寸的尺子' }] },
      },
    },
  },
})

const EC_RULER = toEcEntry({
  word: 'ruler',
  phonetic: "'ru:lә",
  translation: 'n. 统治者, 管理者, 尺, 直尺\\nn. 划线板\\n[计] 标尺',
  tag: 'zk gk cet4 cet6 ky',
  frq: '5552',
})

describe('parseKbLine', () => {
  it('解析出 bookId、顺序和各字段', () => {
    const e = parseKbLine(KB_RULER)
    expect(e).toMatchObject({ bookId: 'PEPXiaoXue3_1', rank: 1, word: 'ruler', uk: "'ruːlə", us: "'rulɚ" })
    expect(e.trans).toEqual([{ pos: undefined, cn: '尺子' }])
    expect(e.sentences).toHaveLength(1)
    expect(e.phrases).toEqual([])
  })
})

describe('mergeEntry', () => {
  it('KyleBing 有音标时优先用 KyleBing，词性从 ECDICT 补', () => {
    const w = mergeEntry(parseKbLine(KB_RULER), EC_RULER)
    expect(w).toEqual({
      id: 'ruler',
      word: 'ruler',
      uk: 'ˈruːlə',
      us: 'ˈrulɚ',
      meanings: [{ pos: 'n.', cn: '尺子' }],
      examples: [{ en: 'a 12-inch ruler', cn: '一把12英寸的尺子' }],
      phrases: [],
      tags: ['zk', 'gk', 'cet4', 'cet6', 'ky'],
      frq: 5552,
    })
  })

  it('KyleBing 缺英音时用 ECDICT 补；美音不用 ECDICT 补（ECDICT 以英音为主）', () => {
    const kb = { ...parseKbLine(KB_RULER), uk: undefined, us: undefined }
    const w = mergeEntry(kb, EC_RULER)
    expect(w.uk).toBe('ˈruːlə')
    expect(w.us).toBeUndefined()
  })

  it('KyleBing 自带词性时不被 ECDICT 覆盖', () => {
    const kb = { ...parseKbLine(KB_RULER), trans: [{ pos: 'v', cn: '统治' }] }
    expect(mergeEntry(kb, EC_RULER).meanings).toEqual([{ pos: 'v.', cn: '统治' }])
  })

  it('KyleBing 没有释义时用 ECDICT 释义，跳过 [计] 行', () => {
    const kb = { ...parseKbLine(KB_RULER), trans: [] }
    expect(mergeEntry(kb, EC_RULER).meanings).toEqual([
      { pos: 'n.', cn: '统治者, 管理者, 尺, 直尺' },
      { pos: 'n.', cn: '划线板' },
    ])
  })

  it('多词条目标为短语，大小写保留在 word、id 用小写', () => {
    const kb = { ...parseKbLine(KB_RULER), word: 'Go to bed.', uk: undefined, us: undefined, trans: [{ cn: '上床睡觉' }] }
    const w = mergeEntry(kb)
    expect(w.id).toBe('go to bed')
    expect(w.word).toBe('Go to bed')
    expect(w.meanings[0].pos).toBe('phr.')
    expect(w.tags).toEqual([])
  })
})

describe('cleanHeadword', () => {
  it('去掉句末误加的句号，保留缩写', () => {
    expect(cleanHeadword('go swimming.')).toBe('go swimming')
    expect(cleanHeadword('wear.')).toBe('wear')
    expect(cleanHeadword('a.m.')).toBe('a.m.')
    expect(cleanHeadword('how about...')).toBe('how about...')
  })
})

describe('dedupe / applyOverrides', () => {
  const base = mergeEntry(parseKbLine(KB_RULER), EC_RULER)
  it('同一本书去重保留第一个', () => {
    const dup = { ...base, meanings: [{ pos: 'n.', cn: '第二个' }] }
    expect(dedupe([base, dup])).toEqual([base])
  })
  it('覆盖字段和删除词条', () => {
    const fixed = applyOverrides('pep-3a', [base], { words: { ruler: { meanings: [{ pos: 'n.', cn: '直尺' }] } } })
    expect(fixed[0].meanings[0].cn).toBe('直尺')
    expect(fixed[0].id).toBe('ruler')
    expect(applyOverrides('pep-3a', [base], { remove: { 'pep-3a': ['ruler'] } })).toEqual([])
    expect(applyOverrides('pep-3b', [base], { remove: { 'pep-3a': ['ruler'] } })).toHaveLength(1)
  })
})
