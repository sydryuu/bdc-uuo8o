import { useEffect, useState } from 'react'
import { BarChart, Heatmap, Legend, SERIES } from '../components/charts'
import { FlameIcon } from '../components/icons'
import { Card, ProgressBar } from '../components/ui'
import { bookProgress } from '../db/books'
import { db } from '../db/db'
import { dayKey } from '../lib/date'
import { useSettings } from '../lib/settings'
import { useLive } from '../lib/useLive'
import { cardStats, forecast, heatmap, MATURE_DAYS, recentDays, streak } from '../srs/stats'

const WEEK = '日一二三四五六'

function useDark() {
  const { theme } = useSettings()
  const [sys, setSys] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const f = () => setSys(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return theme === 'dark' || (theme === 'system' && sys)
}

export function StatsPage() {
  const dark = useDark()
  const data = useLive(async () => {
    const now = Date.now()
    const [cards, daily, books] = await Promise.all([db.cards.toArray(), db.daily.toArray(), db.books.toArray()])
    const progress = await Promise.all(books.map(async (b) => ({ ...b, ...(await bookProgress(b.id)) })))
    return { now, today: dayKey(now), cards, daily, progress }
  }, [])

  if (!data) return <div className="mx-auto max-w-lg px-4 pb-28" />
  const { now, today, cards, daily, progress } = data
  const st = streak(daily, today)
  const cs = cardStats(cards)
  const recent = recentDays(daily, today, 14)
  const fc = forecast(cards, now, 7)
  const started = progress.filter((b) => b.learned > 0).sort((a, b) => a.id.localeCompare(b.id))

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top pb-2">
        <h1 className="pt-2 text-2xl font-bold">统计</h1>
      </header>

      <Card className="mt-3 flex items-center gap-4">
        <FlameIcon className={`size-12 shrink-0 ${st.current > 0 ? 'text-amber-500' : 'text-stone-300 dark:text-stone-600'}`} />
        <div className="flex-1">
          <p className="text-3xl font-bold tabular-nums">
            {st.current}
            <span className="ml-1 text-base font-medium text-stone-500">天连续学习</span>
          </p>
          <p className="mt-0.5 text-xs text-stone-400">
            {st.todayDone ? '今天已打卡' : st.current > 0 ? '今天还没学，学 1 题就能续上' : '今天学 1 题就开始打卡'} · 最长 {st.longest} 天
          </p>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {[
          { label: '已学单词', value: cs.learned },
          { label: '已掌握', value: cs.mastered, hint: `复习间隔 ≥${MATURE_DAYS} 天` },
          { label: '在学短语', value: cs.phrases },
        ].map((x) => (
          <Card key={x.label} className="!p-3">
            <p className="text-xs text-stone-400">{x.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{x.value}</p>
            {x.hint && <p className="mt-0.5 text-[10px] leading-tight text-stone-400">{x.hint}</p>}
          </Card>
        ))}
      </div>

      <Card className="mt-3">
        <h2 className="mb-3 font-semibold">学习日历</h2>
        <Heatmap cols={heatmap(daily, today, 17)} dark={dark} />
      </Card>

      <Card className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">最近 14 天学习量</h2>
          <Legend items={[SERIES.fresh, SERIES.review]} />
        </div>
        <BarChart
          labelEvery={3}
          data={recent.map((d) => ({
            label: `${Number(d.day.slice(8))}`,
            title: `${Number(d.day.slice(5, 7))}月${Number(d.day.slice(8))}日`,
            segments: [
              { value: d.newCount, color: SERIES.fresh.color, name: SERIES.fresh.name },
              { value: d.reviewCount, color: SERIES.review.color, name: SERIES.review.name },
            ],
          }))}
        />
      </Card>

      <Card className="mt-3">
        <h2 className="mb-2 font-semibold">未来 7 天要复习</h2>
        <BarChart
          height={90}
          data={fc.map((n, i) => {
            const d = new Date(now + i * 86_400_000)
            const label = i === 0 ? '今天' : i === 1 ? '明天' : `周${WEEK[d.getDay()]}`
            return { label, title: label, segments: [{ value: n, color: SERIES.review.color, name: '到期' }] }
          })}
        />
        {/* 数字表：不用点也能直接看到每天的量 */}
        <div className="mt-1 flex gap-[3px] text-xs font-semibold tabular-nums text-stone-600 dark:text-stone-300">
          {fc.map((n, i) => (
            <span key={i} className="flex-1 text-center">
              {n}
            </span>
          ))}
        </div>
      </Card>

      {started.length > 0 && (
        <Card className="mt-3">
          <h2 className="mb-3 font-semibold">词书进度</h2>
          <ul className="space-y-3">
            {started.map((b) => (
              <li key={b.id}>
                <div className="flex justify-between text-sm">
                  <span>{b.name}</span>
                  <span className="tabular-nums text-stone-400">
                    {b.learned} / {b.total}
                  </span>
                </div>
                <ProgressBar className="mt-1 h-2" value={b.learned / Math.max(1, b.total)} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
