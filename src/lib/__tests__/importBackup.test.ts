import { describe, expect, it } from 'vitest'
import type { DailyRow, MistakeRow, ReviewLogRow } from '../../db/db'
import type { CardRow } from '../../srs/scheduler'
import type { DictEntry, Word } from '../../types/vocab'
import { mergeCards, mergeDaily, mergeLogs, mergeMistakes, needsBackupReminder, validateBackup } from '../backup'
import { fillRows, parseCsv, parseCsvLine, parseImport, parseJson } from '../importBook'

describe('CSV 解析', () => {
  it('parseCsvLine 支持引号和转义', () => {
    expect(parseCsvLine('apple,"苹果, 苹果树","He said ""hi""."', ',')).toEqual(['apple', '苹果, 苹果树', 'He said "hi".'])
  })
  it('没有表头时按 单词,释义,音标,例句,例句翻译 的顺序', () => {
    const r = parseCsv('apple,苹果\nbanana,香蕉,bəˈnɑːnə\n\n')
    expect(r.rows).toEqual([{ word: 'apple', meaning: '苹果' }, { word: 'banana', meaning: '香蕉', uk: 'bəˈnɑːnə' }])
  })
  it('识别中英文表头、制表符分隔、BOM，列顺序随意', () => {
    const r = parseCsv('﻿释义\t单词\t例句\n苹果\tapple\tI like apples.\n')
    expect(r.rows).toEqual([{ word: 'apple', meaning: '苹果', example: 'I like apples.' }])
  })
  it('只有一列单词也行；跳过不像英文的行并报行号', () => {
    const r = parseCsv('word\napple\n苹果\n\nlook after\n')
    expect(r.rows.map((x) => x.word)).toEqual(['apple', 'look after'])
    expect(r.skipped).toEqual([{ line: 3, reason: '"苹果" 不像英文单词' }])
  })
})

describe('JSON 解析', () => {
  it('字符串数组', () => {
    expect(parseJson('["apple", " pear "]').rows).toEqual([{ word: 'apple' }, { word: 'pear' }])
  })
  it('对象数组，支持多种字段名', () => {
    const r = parseJson('[{"word":"apple","translation":"苹果","phonetic":"ˈæpl"},{"meaning":"无词"}]')
    expect(r.rows[0]).toMatchObject({ word: 'apple', meaning: '苹果', uk: 'ˈæpl' })
    expect(r.skipped).toEqual([{ line: 2, reason: '没有单词' }])
  })
  it('本应用的词书文件格式', () => {
    const book = { words: [{ word: 'ruler', meanings: [{ pos: 'n.', cn: '尺子' }], examples: [{ en: 'a ruler', cn: '一把尺子' }] }] }
    expect(parseJson(JSON.stringify(book)).rows[0]).toMatchObject({ word: 'ruler', meaning: '尺子', pos: 'n.', example: 'a ruler' })
  })
  it('parseImport 按扩展名或内容判断格式', () => {
    expect(parseImport('["a"]', 'list.txt').rows).toEqual([{ word: 'a' }])
    expect(parseImport('apple,苹果', 'list.csv').rows[0].meaning).toBe('苹果')
  })
})

describe('补全', () => {
  const lib: Word = { id: 'ruler', word: 'ruler', meanings: [{ pos: 'n.', cn: '尺子' }], examples: [{ en: 'a ruler', cn: '尺' }], phrases: [], tags: [] }
  const dict = new Map<string, DictEntry>([['apple', ['apple', 'ˈæpl', [['n.', '苹果，苹果树']]]]])
  it('词库已有的用词库数据；词典有的补音标和释义；用户填的释义优先；都没有就标记', () => {
    const { words, origins, noMeaning } = fillRows(
      [{ word: 'Ruler' }, { word: 'apple' }, { word: 'apple' }, { word: 'kiwi', meaning: '猕猴桃' }, { word: 'zzzz' }],
      { library: new Map([['ruler', lib]]), dict },
    )
    expect(origins).toEqual(['library', 'dict', 'user', 'user'])
    expect(words[0]).toBe(lib)
    expect(words[1]).toMatchObject({ id: 'apple', uk: 'ˈæpl', meanings: [{ pos: 'n.', cn: '苹果，苹果树' }] })
    expect(words[2]).toMatchObject({ id: 'kiwi', meanings: [{ pos: '', cn: '猕猴桃' }] })
    expect(noMeaning).toEqual(['zzzz'])
  })
  it('用户给了释义时沿用词典的词性和音标', () => {
    const { words } = fillRows([{ word: 'apple', meaning: '苹果手机' }], { library: new Map(), dict })
    expect(words[0]).toMatchObject({ uk: 'ˈæpl', meanings: [{ pos: 'n.', cn: '苹果手机' }] })
  })
})

describe('备份合并', () => {
  const card = (id: string, last: number, reps: number) => ({ id, last_review: last, reps }) as CardRow
  it('卡片：保留最近复习更晚的，同时间取复习次数多的', () => {
    const merged = mergeCards([card('a', 100, 3), card('b', 200, 5)], [card('a', 150, 1), card('b', 200, 6), card('c', 50, 1)])
    expect(merged.map((c) => [c.id, c.last_review, c.reps])).toEqual([
      ['a', 150, 1],
      ['b', 200, 6],
      ['c', 50, 1],
    ])
  })
  it('日志：按卡片+时间去重，去掉自增 id', () => {
    const l = (cardId: string, ts: number, id?: number) => ({ id, cardId, ts }) as ReviewLogRow
    expect(mergeLogs([l('a', 1, 1)], [l('a', 1, 9), l('a', 2, 10)])).toEqual([{ cardId: 'a', ts: 2 }])
  })
  it('每日统计：同一天取较大值，重复导入不翻倍', () => {
    const d = (day: string, correct: number, wrong: number) => ({ day, newCount: 0, reviewCount: 0, correct, wrong, extraNew: 0, studyMs: 0 }) as DailyRow
    const merged = mergeDaily([d('x', 10, 1)], [d('x', 4, 3), d('y', 1, 0)])
    expect(merged.map((m) => [m.day, m.correct, m.wrong])).toEqual([
      ['x', 10, 3],
      ['y', 1, 0],
    ])
    expect(mergeDaily(merged, merged)).toEqual(merged)
  })
  it('错题：保留最近出错更晚的', () => {
    const m = (cardId: string, lastWrongAt: number, wrongCount: number) => ({ cardId, lastWrongAt, wrongCount }) as MistakeRow
    expect(mergeMistakes([m('a', 10, 5)], [m('a', 20, 1), m('b', 1, 1)]).map((x) => [x.cardId, x.wrongCount])).toEqual([
      ['a', 1],
      ['b', 1],
    ])
  })
  it('validateBackup 拒绝不认识的文件', () => {
    expect(() => validateBackup({ foo: 1 })).toThrow('不是背单词的备份文件')
    expect(() => validateBackup({ app: 'beidanci', version: 99, tables: {} })).toThrow('更新的版本')
    expect(() => validateBackup({ app: 'beidanci', version: 1, tables: { cards: [] } })).toThrow('缺少')
  })
})

describe('备份提醒', () => {
  const DAY = 86_400_000
  const now = 100 * DAY
  it('满 N 天提醒；从未备份时从第一次学习算起', () => {
    expect(needsBackupReminder({ now, days: 7, lastBackupAt: now - 7 * DAY, firstLearnedAt: 1 })).toBe(true)
    expect(needsBackupReminder({ now, days: 7, lastBackupAt: now - 6 * DAY, firstLearnedAt: 1 })).toBe(false)
    expect(needsBackupReminder({ now, days: 7, firstLearnedAt: now - 8 * DAY })).toBe(true)
    expect(needsBackupReminder({ now, days: 7, firstLearnedAt: now - 2 * DAY })).toBe(false)
  })
  it('关闭、没学过、暂缓中都不提醒', () => {
    expect(needsBackupReminder({ now, days: 0, firstLearnedAt: 1 })).toBe(false)
    expect(needsBackupReminder({ now, days: 7 })).toBe(false)
    expect(needsBackupReminder({ now, days: 7, firstLearnedAt: 1, snoozedUntil: now + 1 })).toBe(false)
  })
})
