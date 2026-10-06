// 词库统一格式。构建脚本输出、应用读取都用这一份类型。

export interface Meaning {
  /** 词性缩写，如 n. / v. / adj.；未知为空串 */
  pos: string
  cn: string
}

export interface Example {
  en: string
  cn: string
}

export interface Phrase {
  /** 短语 id：小写短语文本 */
  id: string
  en: string
  cn: string
}

export interface Word {
  /** 小写单词，作为全局唯一 id（多本书共享） */
  id: string
  /** 原始大小写，如 OK、Mr */
  word: string
  uk?: string
  us?: string
  meanings: Meaning[]
  examples: Example[]
  phrases: Phrase[]
  /** ECDICT 考试标签：zk 中考 / gk 高考 / cet4 / cet6 / ky 考研 / ielts / toefl / gre */
  tags: string[]
  /** 当代语料库词频序号，越小越常用；0 或缺省为未知 */
  frq?: number
}

export interface BookFile {
  id: string
  name: string
  version: string
  words: Word[]
}

export interface BookMeta {
  id: string
  name: string
  stage: string
  stageName: string
  order: number
  wordCount: number
  /** 内容哈希；变化时应用会重新导入词条 */
  version: string
  file: string
}

export interface BookIndex {
  generatedAt: string
  books: BookMeta[]
}
