import type { ReactNode } from 'react'
import { ChevronIcon } from '../components/icons'
import { db } from '../db/db'
import { navigate, type Route } from '../lib/router'
import { useLive } from '../lib/useLive'

function Entry({ title, hint, to, badge }: { title: string; hint: string; to: Route; badge?: ReactNode }) {
  return (
    <button type="button" onClick={() => navigate(to)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left active:bg-stone-50 dark:active:bg-stone-800">
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-stone-400">{hint}</p>
      </div>
      {badge}
      <ChevronIcon className="size-5 text-stone-300" />
    </button>
  )
}

export function MePage() {
  const mistakes = useLive(() => db.mistakes.filter((m) => m.active).count(), [])
  const favorites = useLive(() => db.favorites.count(), [])
  const badge = (n: number | undefined, color: string) =>
    n ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums text-white ${color}`}>{n}</span> : null
  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top pb-2">
        <h1 className="pt-2 text-2xl font-bold">我的</h1>
      </header>
      <div className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm dark:divide-stone-800 dark:bg-stone-900">
        <Entry title="查词" hint="英文前缀或中文释义，约 3.7 万常用词" to="search" />
        <Entry title="生词本" hint="收藏的词，可以一键加入学习" to="favorites" badge={badge(favorites, 'bg-amber-500')} />
        <Entry title="错题本" hint="答错或点了忘记的词，连续答对 3 次自动移出" to="mistakes" badge={badge(mistakes, 'bg-rose-500')} />
      </div>
      <div className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm dark:divide-stone-800 dark:bg-stone-900">
        <Entry title="导入词书" hint="从 CSV 或 JSON 导入自己的单词表" to="import" />
        <Entry title="数据与备份" hint="导出、恢复学习记录，备份提醒" to="data" />
        <Entry title="设置" hint="每日新词、发音、深色模式" to="settings" />
      </div>
    </div>
  )
}
