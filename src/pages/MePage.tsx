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
  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top pb-2">
        <h1 className="pt-2 text-2xl font-bold">我的</h1>
      </header>
      <div className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm dark:divide-stone-800 dark:bg-stone-900">
        <Entry
          title="错题本"
          hint="答错或点了忘记的词，连续答对 3 次自动移出"
          to="mistakes"
          badge={
            mistakes ? (
              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">{mistakes}</span>
            ) : null
          }
        />
        <Entry title="设置" hint="每日新词、发音、深色模式" to="settings" />
      </div>
      <p className="mt-6 text-center text-xs text-stone-400">生词本、查词、备份会在下个版本加入</p>
    </div>
  )
}
