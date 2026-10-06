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
  /** 新词顺序：source = 按课本原顺序；frequency = 常用词先学（ECDICT 词频） */
  sort?: 'source' | 'frequency'
  /** 是否预缓存进 Service Worker（小学词书小，随应用一起离线；大词书选中时再下载） */
  precache?: boolean
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
    precache: true,
  }
}

const junior = (grade: 7 | 8 | 9, half?: 1 | 2): BookSpec => {
  const cn = { 7: '七', 8: '八', 9: '九' }[grade]
  return {
    id: `pep-${grade}${half === 1 ? 'a' : half === 2 ? 'b' : ''}`,
    name: `人教初中 ${cn}年级${half === 1 ? '上' : half === 2 ? '下' : '全一册'}`,
    stage: 'junior',
    order: grade * 10 + (half ?? 1),
    kbFile: `人教初中${cn}年级`,
    kbBookId: `PEPChuZhong${grade}_${half ?? 1}`,
  }
}

// 人教版高中（2007 版）：必修 1–5、选修 6–11
const senior = (n: number): BookSpec => ({
  id: `pep-hs${n}`,
  name: `人教高中 ${n <= 5 ? '必修' : '选修'}${n}`,
  stage: 'senior',
  order: 100 + n,
  kbFile: '人教高中',
  kbBookId: `PEPGaoZhong_${n}`,
})

export const BOOKS: BookSpec[] = [
  ...[3, 4, 5, 6].flatMap((g) => [pep(g, 1), pep(g, 2)]),
  junior(7, 1),
  junior(7, 2),
  junior(8, 1),
  junior(8, 2),
  junior(9),
  ...Array.from({ length: 11 }, (_, i) => senior(i + 1)),
  // 四六级原始数据由几个版本拼成且接近字母序，按词频重排、去重
  { id: 'cet4', name: '大学英语四级', stage: 'cet4', order: 200, kbFile: '四级', sort: 'frequency' },
  { id: 'cet6', name: '大学英语六级', stage: 'cet6', order: 300, kbFile: '六级', sort: 'frequency' },
]

const RAW = 'https://raw.githubusercontent.com'
/** 网络不好时可以设置 GH_RAW_BASE 换成镜像，例如 https://ghfast.top/https://raw.githubusercontent.com */
export const GH_RAW_BASE = process.env.GH_RAW_BASE || RAW

export const kbUrl = (file: string) =>
  `${GH_RAW_BASE}/KyleBing/english-vocabulary/master/${encodeURI(`full_line_jsonl/full/正序/${file}.jsonl`)}`
export const ECDICT_URL = `${GH_RAW_BASE}/skywind3000/ECDICT/master/ecdict.csv`
