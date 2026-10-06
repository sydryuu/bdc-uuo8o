import { useMemo, useState } from 'react'
import { unlockAudio } from '../audio/player'
import { SpeakButton } from '../components/SpeakButton'
import { PrimaryButton, Segmented, SubHeader } from '../components/ui'
import { db, type QuizType } from '../db/db'
import { navigate } from '../lib/router'
import { useLive } from '../lib/useLive'
import { QUIZ_LABEL } from '../quiz/quiz'
import { mistakeViews, setMistakeActive } from '../srs/store'

type Tab = 'active' | 'removed'
type Sort = 'count' | 'recent'

function ago(ts: number) {
  const min = Math.round((Date.now() - ts) / 60_000)
  if (min < 60) return `${Math.max(1, min)} 分钟前`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} 小时前`
  return `${Math.round(h / 24)} 天前`
}

export function MistakesPage() {
  const [tab, setTab] = useState<Tab>('active')
  const [sort, setSort] = useState<Sort>('count')
  // 监听错题表和卡片表，任何变化都刷新列表
  const views = useLive(async () => {
    await db.mistakes.count()
    return mistakeViews()
  }, [])

  const list = useMemo(() => {
    const l = (views ?? []).filter((v) => (tab === 'active' ? v.active : !v.active))
    return l.sort((a, b) => (sort === 'count' ? b.wrongCount - a.wrongCount || b.lastWrongAt - a.lastWrongAt : b.lastWrongAt - a.lastWrongAt))
  }, [views, tab, sort])
  const activeCount = (views ?? []).filter((v) => v.active).length

  return (
    <div className="mx-auto max-w-lg px-4 pb-48">
      <SubHeader title="错题本" back={() => navigate('me', { replace: true })} backLabel="我的" />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented<Tab>
          value={tab}
          options={[
            { value: 'active', label: `在本中 ${activeCount}` },
            { value: 'removed', label: '已移出' },
          ]}
          onChange={setTab}
        />
        <Segmented<Sort>
          value={sort}
          options={[
            { value: 'count', label: '最常错' },
            { value: 'recent', label: '最近' },
          ]}
          onChange={setSort}
        />
      </div>

      {views && list.length === 0 && (
        <p className="mt-16 text-center text-stone-400">{tab === 'active' ? '没有错题，继续保持！' : '还没有移出的词'}</p>
      )}

      <ul className="mt-4 space-y-2">
        {list.map((v) => (
          <li key={v.cardId} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-stone-900">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center">
                  <span className="truncate text-xl font-semibold">{v.title}</span>
                  <SpeakButton text={v.title} className="-my-2" />
                </div>
                <p className="truncate text-sm text-stone-500 dark:text-stone-400">{v.meaning}</p>
              </div>
              <button
                type="button"
                onClick={() => setMistakeActive(v.cardId, !v.active)}
                className="min-h-10 shrink-0 rounded-xl border-2 border-stone-200 px-3 text-sm font-semibold text-stone-500 active:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:active:bg-stone-800"
              >
                {v.active ? '移出' : '加回'}
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold text-rose-500">错 {v.wrongCount} 次</span>
              <span className="text-stone-400">· {ago(v.lastWrongAt)}</span>
              {v.active && v.correctStreak > 0 && <span className="text-emerald-600 dark:text-emerald-400">· 已连对 {v.correctStreak}/3</span>}
              {v.kind === 'phrase' && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-700 dark:bg-sky-950 dark:text-sky-300">短语</span>}
              {(Object.entries(v.byType) as [QuizType, number][])
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([t, n]) => (
                  <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                    {QUIZ_LABEL[t]} ×{n}
                  </span>
                ))}
            </div>
          </li>
        ))}
      </ul>

      {activeCount > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),12px)+52px)] z-10 bg-gradient-to-t from-[var(--color-page)] from-60% to-transparent pt-6 pb-3 dark:from-[var(--color-page-dark)]">
          <div className="mx-auto max-w-lg px-4">
            <PrimaryButton
              onClick={() => {
                unlockAudio()
                navigate('practice')
              }}
            >
              练习错题（{Math.min(activeCount, 20)} 个）
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  )
}
