// 学习日以凌晨 4 点为界（和 Anki 一样）：凌晨 2 点学的仍算前一天
export const DAY_START_HOUR = 4

const pad = (n: number) => String(n).padStart(2, '0')

/** 学习日的键，例如 "2026-10-06" */
export function dayKey(now: number): string {
  const d = new Date(now - DAY_START_HOUR * 3600_000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 当前学习日结束的时间戳（下一个凌晨 4 点） */
export function dayEnd(now: number): number {
  const d = new Date(now)
  d.setHours(DAY_START_HOUR, 0, 0, 0)
  if (d.getTime() <= now) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/** 把一段时长格式化成按钮上的中文间隔："1分钟" "10分钟" "3小时" "4天" "1.5个月" "2年" */
export function formatInterval(ms: number): string {
  const min = ms / 60_000
  if (min < 60) return `${Math.max(1, Math.round(min))}分钟`
  const h = min / 60
  if (h < 24) return `${Math.round(h)}小时`
  const d = h / 24
  if (d < 30) return `${Math.round(d)}天`
  const mo = d / 30
  if (mo < 12) return `${trim(mo)}个月`
  return `${trim(d / 365)}年`
}

const trim = (n: number) => (n < 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n)))
