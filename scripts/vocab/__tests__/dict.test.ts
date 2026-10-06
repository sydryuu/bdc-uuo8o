import { describe, expect, it } from 'vitest'
import { frequencyRank, inDict, shardOf, toDictEntry } from '../dict.ts'
import { toEcEntry, type EcEntry } from '../sources/ecdict.ts'

const ec = (o: Partial<Record<string, string>>): EcEntry =>
  toEcEntry({ word: 'x', phonetic: '', translation: 'n. 某物', tag: '', frq: '0', bnc: '0', collins: '0', oxford: '0', ...o })

describe('inDict 收录标准', () => {
  it('常用词收录：词频前 3 万、BNC 前 3 万、有考试标签、柯林斯星级、牛津核心词', () => {
    expect(inDict(ec({ word: 'apple', frq: '2000' }))).toBe(true)
    expect(inDict(ec({ word: 'apple', bnc: '29999' }))).toBe(true)
    expect(inDict(ec({ word: 'abandon', tag: 'cet4' }))).toBe(true)
    expect(inDict(ec({ word: 'abacus', collins: '1' }))).toBe(true)
    expect(inDict(ec({ word: 'able', oxford: '1' }))).toBe(true)
  })
  it('生僻词、短语、带符号的词、没有中文释义的不收', () => {
    expect(inDict(ec({ word: 'zygote', frq: '45000' }))).toBe(false)
    expect(inDict(ec({ word: 'look after', tag: 'zk' }))).toBe(false)
    expect(inDict(ec({ word: '-gate', tag: 'zk' }))).toBe(false)
    expect(inDict(ec({ word: 'apple', frq: '10', translation: '' }))).toBe(false)
  })
})

describe('toDictEntry', () => {
  it('取最多 3 行释义，跳过 [计] [网络] 行，规范词性和音标', () => {
    const e = ec({ word: 'ruler', phonetic: "'ru:lә", translation: 'n. 统治者, 管理者, 尺\\nn. 划线板\\n[计] 标尺\\nvt. 统治\\nadj. 多余' })
    expect(toDictEntry(e)).toEqual(['ruler', 'ˈruːlə', [['n.', '统治者，管理者，尺'], ['n.', '划线板'], ['vt.', '统治']]])
  })
  it('过长的释义在义项边界截断', () => {
    const long = Array.from({ length: 20 }, (_, i) => `意思${i}`).join(', ')
    const [, , m] = toDictEntry(ec({ word: 'go', translation: `v. ${long}` }))
    expect(m[0][1].length).toBeLessThanOrEqual(40)
    expect(m[0][1].endsWith('，')).toBe(false)
  })
})

describe('分片和词频', () => {
  it('shardOf 按首字母，非字母归 "_"', () => {
    expect(shardOf('Apple')).toBe('a')
    expect(shardOf("'tis")).toBe('_')
  })
  it('frequencyRank：有词频用词频，只有 BNC 时略靠后，都没有排最后', () => {
    expect(frequencyRank({ frq: 100, bnc: 50 })).toBe(100)
    expect(frequencyRank({ frq: 0, bnc: 100 })).toBe(100.5)
    expect(frequencyRank({ frq: 0, bnc: 0 })).toBe(Infinity)
    expect(frequencyRank(undefined)).toBe(Infinity)
  })
})
