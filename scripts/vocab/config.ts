// 词书清单：要构建哪些书、从哪里来。加新词书只需要在这里加一项。
export type Stage = 'primary' | 'junior' | 'senior' | 'cet4' | 'cet6' | 'extra'

export interface BookSpec {
  id: string
  name: string
  stage: Stage
  order: number
  /** KyleBing full_line_jsonl/full/正序/ 下的文件名（不含扩展名） */
  kbFile: string
  /** 只取该文件里 bookId 等于此值的词（用来拆上下册）；不填则取整个文件 */
  kbBookId?: string
}

export const STAGE_NAMES: Record<Stage, string> = {
  primary: '小学',
  junior: '初中',
  senior: '高中',
  cet4: '四级',
  cet6: '六级',
  extra: '拓展',
}

const pep = (grade: number, half: 1 | 2): BookSpec => {
  const cn = ['', '', '', '三', '四', '五', '六'][grade]
  return {
    id: `pep-${grade}${half === 1 ? 'a' : 'b'}`,
    name: `人教PEP ${cn}年级${half === 1 ? '上' : '下'}`,
    stage: 'primary',
    order: grade * 10 + half,
    kbFile: `人教小学${cn}年级`,
    kbBookId: `PEPXiaoXue${grade}_${half}`,
  }
}

export const BOOKS: BookSpec[] = [3, 4, 5, 6].flatMap((g) => [pep(g, 1), pep(g, 2)])

const RAW = 'https://raw.githubusercontent.com'
/** 网络不好时可以设置 GH_RAW_BASE 换成镜像，例如 https://ghfast.top/https://raw.githubusercontent.com */
export const GH_RAW_BASE = process.env.GH_RAW_BASE || RAW

export const kbUrl = (file: string) =>
  `${GH_RAW_BASE}/KyleBing/english-vocabulary/master/${encodeURI(`full_line_jsonl/full/正序/${file}.jsonl`)}`
export const ECDICT_URL = `${GH_RAW_BASE}/skywind3000/ECDICT/master/ecdict.csv`
