import { useEffect, useState } from 'react'
import { unlockAudio } from '../audio/player'
import { Card, PrimaryButton, ProgressBar } from '../components/ui'
import { loadIndex } from '../db/books'
import { navigate } from '../lib/router'
import { useSettings } from '../lib/settings'
import { useLive } from '../lib/useLive'
import { addExtraNew, todaySummary, type TodaySummary } from '../srs/store'
import { db } from '../db/db'
import { dayKey } from '../lib/date'

export function TodayPage() {
  const s = useSettings()
  const [sum, setSum] = useState<TodaySummary | null>(null)
  const [error, setError] = useState('')
  const [bookName, setBookName] = useState('')
  // 任何学习记录变化都刷新（liveQuery 监听 cards/daily 表）
  const tick = useLive(() => Promise.all([db.cards.count(), db.daily.get(dayKey(Date.now()))]), [])

  useEffect(() => {
    let alive = true
    todaySummary(Date.now())
      .then((r) => alive && (setSum(r), setError('')))
      .catch((e) => alive && setError(String(e.message ?? e)))
    loadIndex()
      .then((i) => alive && setBookName(i.books.find((b) => b.id === s.currentBookId)?.name ?? ''))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [s.currentBookId, s.dailyNew, tick])

  const start = () => {
    unlockAudio() // iOS：必须在点击里先解锁音频，后面才能自动发音
    navigate('study')
  }

  const todo = sum ? sum.reviewDue + sum.newLeft : 0
  const done = sum ? sum.daily.correct + sum.daily.wrong : 0
  const goal = Math.max(1, s.dailyNew + (sum?.daily.extraNew ?? 0))
  const now = new Date()
  const hour = now.getHours()
  const greet = hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top pb-2">
        <p className="pt-2 text-sm text-stone-400">
          {now.getMonth() + 1}月{now.getDate()}日 · 星期{'日一二三四五六'[now.getDay()]}
        </p>
        <h1 className="mt-1 text-2xl font-bold">{greet}</h1>
      </header>

      <button
        type="button"
        onClick={() => navigate('books')}
        className="mt-3 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left shadow-sm dark:bg-stone-900"
      >
        <span>
          <span className="block text-xs text-stone-400">当前词书</span>
          <span className="font-semibold">{bookName || '…'}</span>
        </span>
        <span className="text-sm text-emerald-600 dark:text-emerald-400">切换 ›</span>
      </button>

      {error && (
        <Card className="mt-4 text-sm text-rose-600">
          加载失败：{error}
          <br />
          第一次打开需要联网下载词书。
        </Card>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card>
          <p className="text-sm text-stone-400">待复习</p>
          <p className="mt-1 text-4xl font-bold tabular-nums">{sum?.reviewDue ?? '–'}</p>
        </Card>
        <Card>
          <p className="text-sm text-stone-400">新词</p>
          <p className="mt-1 text-4xl font-bold tabular-nums">{sum?.newLeft ?? '–'}</p>
        </Card>
      </div>

      <Card className="mt-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-stone-400">今日新词进度</p>
          <p className="text-sm tabular-nums text-stone-500">
            {sum?.daily.newCount ?? 0} / {goal}
          </p>
        </div>
        <ProgressBar className="mt-2" value={(sum?.daily.newCount ?? 0) / goal} />
        <p className="mt-2 text-xs text-stone-400">今天已答 {done} 次 · 复习 {sum?.daily.reviewCount ?? 0} 次</p>
      </Card>

      <div className="mt-8">
        {sum && todo > 0 && (
          <PrimaryButton onClick={start}>
            {done > 0 ? '继续学习' : '开始学习'}
          </PrimaryButton>
        )}
        {sum && todo === 0 && (
          <div className="text-center animate-rise">
            <p className="text-5xl">🎉</p>
            <p className="mt-3 text-xl font-bold">今天的任务完成了</p>
            <p className="mt-1 text-sm text-stone-400">明天记得回来复习</p>
            <button
              type="button"
              onClick={async () => {
                unlockAudio() // 要在 await 之前，否则 iOS 认为不是用户点击触发的
                await addExtraNew(Date.now(), 5)
                navigate('study')
              }}
              className="mt-6 min-h-12 rounded-2xl border-2 border-stone-200 px-6 font-semibold text-stone-600 active:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:active:bg-stone-800"
            >
              再学 5 个新词
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
