import { describe, expect, it } from 'vitest'
import { cleanSentence, ecdictPosList, normalizePhonetic, normalizePos, pickExamples, pickPhrases } from '../clean.ts'

describe('normalizePhonetic', () => {
  it('把撇号和冒号换成 IPA 重音和长音符号', () => {
    expect(normalizePhonetic("'ruːlə")).toBe('ˈruːlə')
    expect(normalizePhonetic('tɒ:k')).toBe('tɒːk')
  })
  it('把 ECDICT 里的西里尔字母 ә 换成 IPA ə', () => {
    expect(normalizePhonetic("'ru:lә")).toBe('ˈruːlə')
  })
  it('多个变体只取第一个，并保留次重音', () => {
    expect(normalizePhonetic("'əu'kei, ,əu'kei, 'əukei")).toBe('ˈəuˈkei')
    expect(normalizePhonetic("'pens(ə)l; -sɪl")).toBe('ˈpens(ə)l')
    expect(normalizePhonetic(",ʌndə'stænd")).toBe('ˌʌndəˈstænd')
  })
  it('去掉外层斜杠/方括号，空值返回 undefined', () => {
    expect(normalizePhonetic('/pen/')).toBe('pen')
    expect(normalizePhonetic('[pen]')).toBe('pen')
    expect(normalizePhonetic('')).toBeUndefined()
    expect(normalizePhonetic(undefined)).toBeUndefined()
  })
  it('保留音节间空格（缩写词）', () => {
    expect(normalizePhonetic("ju: es 'ei")).toBe('juː es ˈei')
  })
})

describe('词性', () => {
  it('normalizePos 统一缩写，未知返回空串', () => {
    expect(normalizePos('n')).toBe('n.')
    expect(normalizePos('adj.')).toBe('adj.')
    expect(normalizePos('VT')).toBe('vt.')
    expect(normalizePos('xyz')).toBe('')
  })
  it('ecdictPosList 按行解析并去重，跳过 [计] 行', () => {
    expect(ecdictPosList('n. 统治者, 尺\\nn. 划线板\\n[计] 标尺')).toEqual(['n.'])
    expect(ecdictPosList('n. 谈话\nvi. 讲话\nvt. 讲')).toEqual(['n.', 'vi.', 'vt.'])
  })
})

describe('例句', () => {
  it('cleanSentence 去掉 (= …) 批注、修正标点空格、统一引号', () => {
    expect(cleanSentence('Sue and Bob still aren’t talking (= are refusing to talk to each other ) .')).toBe(
      "Sue and Bob still aren't talking.",
    )
    expect(cleanSentence('After a long talk , we decided.')).toBe('After a long talk, we decided.')
  })
  it('pickExamples 去重、过滤超长、短句优先、最多 n 句', () => {
    const long = 'x'.repeat(120)
    const res = pickExamples(
      [
        { en: 'A much longer sentence here.', cn: '长' },
        { en: long, cn: '超长' },
        { en: 'Short one.', cn: '短' },
        { en: 'short one.', cn: '重复' },
        { en: '', cn: '空' },
        { en: 'Mid size one.', cn: '中' },
      ],
      2,
    )
    expect(res.map((e) => e.cn)).toEqual(['短', '中'])
  })
  it('全都超长时仍然返回最短的', () => {
    expect(pickExamples([{ en: 'y'.repeat(200), cn: 'a' }, { en: 'y'.repeat(100), cn: 'b' }], 1)[0].cn).toBe('b')
  })
})

describe('pickPhrases', () => {
  it('过滤书名类噪声、去掉词性前缀、去掉和词头相同的、去重、限制条数', () => {
    const res = pickPhrases(
      [
        { en: 'talk about', cn: '谈论某事' },
        { en: "let's talk", cn: '大学英语基础口语教程' },
        { en: 'idle talk', cn: 'n. 闲谈，闲聊' },
        { en: 'Talk about', cn: '重复' },
        { en: 'talk', cn: '说' },
        { en: 'talk show', cn: '脱口秀' },
        { en: 'small talk', cn: '闲聊' },
      ],
      'talk',
      3,
    )
    expect(res).toEqual([
      { id: 'talk about', en: 'talk about', cn: '谈论某事' },
      { id: 'idle talk', en: 'idle talk', cn: '闲谈，闲聊' },
      { id: 'talk show', en: 'talk show', cn: '脱口秀' },
    ])
  })
})
