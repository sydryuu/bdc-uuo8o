import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { speak } from '../audio/player'
import { CheckIcon, CloseIcon } from '../components/icons'
import { SpeakButton } from '../components/SpeakButton'
import { PrimaryButton, ProgressBar } from '../components/ui'
import { Phonetics, PosTag, WordCard } from '../components/WordCard'
import type { QuizType } from '../db/db'
import { vibrateCorrect, vibrateWrong } from '../lib/feedback'
import { navigate } from '../lib/router'
import { getSettings, useSettings } from '../lib/settings'
import { buildQuiz, chooseQuizType, type Quiz } from '../quiz/quiz'
import { GRADE_LABEL, previewIntervals, Rating, State, type Grade } from '../srs/scheduler'
import { applyGrade, createSession, pickNext, type Session, type SessionItem } from '../srs/session'
import { loadTodayPlan, saveAnswer, type TodayPlan } from '../srs/store'
import type { Word } from '../types/vocab'

type Stage = 'loading' | 'card' | 'quiz' | 'rate' | 'wrong' | 'done' | 'error'

/** 左滑触发 */
function useSwipeLeft(onSwipe: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (e: TouchEvent) => (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }),
    onTouchEnd: (e: TouchEvent) => {
      if (!start.current) return
      const dx = e.changedTouches[0].clientX - start.current.x
      const dy = e.changedTouches[0].clientY - start.current.y
      start.current = null
      if (dx < -70 && Math.abs(dy) < 50) onSwipe()
    },
  }
}

export function StudyPage() {
  const settings = useSettings()
  const [plan, setPlan] = useState<TodayPlan | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [item, setItem] = useState<SessionItem | null>(null)
  const [stage, setStage] = useState<Stage>('loading')
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ newDone: 0, reviewDone: 0, correct: 0, wrong: 0 })
  const lastQuiz = useRef(new Map<string, QuizType>())
  const shownAt = useRef(0)

  const word: Word | undefined = item ? plan?.words.get(item.wordId) : undefined

  const showQuiz = useCallback(
    (p: TodayPlan, it: SessionItem) => {
      const w = p.words.get(it.wordId)!
      // 只有从没评过分的新词才算"第一次见"；中途退出再进来的卡也要轮换题型
      const seen = it.card ? Math.max(1, it.encounters) : 0
      const type = chooseQuizType(seen, lastQuiz.current.get(it.cardId), Math.random)
      const pool = p.pools.get(it.bookId) ?? [...p.words.values()]
      setQuiz(buildQuiz(type, w, pool, Math.random))
      setPicked(null)
      setStage('quiz')
      shownAt.current = Date.now()
      if (type === 'en2cn' && getSettings().autoPlay) speak(w.word, getSettings().accent)
    },
    [],
  )

  const advance = useCallback(
    (p: TodayPlan, s: Session) => {
      const next = pickNext(s, Date.now())
      setItem(next)
      if (!next) {
        setStage('done')
        return
      }
      if (next.card === null) {
        setStage('card')
        const w = p.words.get(next.wordId)!
        if (getSettings().autoPlay) speak(w.word, getSettings().accent)
      } else {
        showQuiz(p, next)
      }
      window.scrollTo(0, 0)
    },
    [showQuiz],
  )

  useEffect(() => {
    loadTodayPlan(Date.now())
      .then((p) => {
        const s = createSession({ reviews: p.reviews, news: p.news, dayEnd: p.dayEnd })
        setPlan(p)
        setSession(s)
        setTotal(s.items.length)
        advance(p, s)
      })
      .catch((e) => {
        setError(String(e.message ?? e))
        setStage('error')
      })
  }, [advance])

  /** 评分并保存；返回更新后的会话 */
  const commit = (grade: Grade, correct: boolean): Session => {
    const now = Date.now()
    const r = applyGrade(session!, item!.cardId, grade, now)
    lastQuiz.current.set(item!.cardId, quiz!.type)
    saveAnswer({ item: item!, grade, record: r.record, wasNew: r.wasNew, quiz: quiz!.type, correct, ms: now - shownAt.current, now }).catch(
      (e) => console.error('保存失败', e),
    )
    setStats((st) => ({
      newDone: st.newDone + (r.wasNew ? 1 : 0),
      reviewDone: st.reviewDone + (!r.wasNew && item!.card?.state === State.Review ? 1 : 0),
      correct: st.correct + (correct ? 1 : 0),
      wrong: st.wrong + (correct ? 0 : 1),
    }))
    setSession(r.session)
    return r.session
  }

  const onPick = (key: string) => {
    if (picked || !quiz || !word) return
    setPicked(key)
    const correct = quiz.options.find((o) => o.key === key)!.correct
    if (correct) {
      vibrateCorrect()
      if (quiz.type !== 'en2cn' && settings.autoPlay) speak(word.word, settings.accent)
      setTimeout(() => setStage('rate'), 450)
    } else {
      vibrateWrong()
      commit(Rating.Again, false) // 答错自动记为"忘记"
      speak(word.word, settings.accent)
      setTimeout(() => setStage('wrong'), 700)
    }
  }

  const onRate = (grade: Grade) => advance(plan!, commit(grade, true))
  const onContinue = () => advance(plan!, session!)
  const swipeCard = useSwipeLeft(() => stage === 'card' && plan && item && showQuiz(plan, item))
  const swipeWrong = useSwipeLeft(() => stage === 'wrong' && onContinue())

  const intervals = useMemo(() => (stage === 'rate' && item ? previewIntervals(item.card, Date.now()) : null), [stage, item])

  const remaining = session?.items.length ?? 0
  const counts = useMemo(() => {
    const c = { fresh: 0, learning: 0, review: 0 }
    for (const it of session?.items ?? []) {
      if (!it.card) c.fresh++
      else if (it.card.state === State.Review) c.review++
      else c.learning++
    }
    return c
  }, [session])
  const exit = () => navigate('today', { replace: true })

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col px-4">
      <header className="safe-top sticky top-0 z-10 -mx-4 bg-[var(--color-page)] px-4 pb-2 dark:bg-[var(--color-page-dark)]">
        <div className="flex items-center gap-3 pt-1">
          <button type="button" onClick={exit} aria-label="退出学习" className="-ml-2 flex size-11 items-center justify-center text-stone-400">
            <CloseIcon />
          </button>
          <ProgressBar className="flex-1" value={total ? (total - remaining) / total : 0} />
        </div>
        {stage !== 'done' && stage !== 'loading' && (
          <p className="mt-1 text-center text-xs tabular-nums text-stone-400">
            <span className="text-sky-500">新 {counts.fresh}</span> · <span className="text-amber-500">学习中 {counts.learning}</span> ·{' '}
            <span className="text-emerald-500">复习 {counts.review}</span>
          </p>
        )}
      </header>

      {stage === 'loading' && <p className="mt-24 text-center text-stone-400">准备今天的单词…</p>}
      {stage === 'error' && (
        <div className="mt-24 text-center">
          <p className="text-rose-600">加载失败：{error}</p>
          <button type="button" className="mt-4 text-emerald-600" onClick={exit}>
            返回
          </button>
        </div>
      )}

      {stage === 'card' && word && (
        <>
          <main className="flex-1 pt-6 pb-32" {...swipeCard}>
            <p className="mb-4 text-center text-xs font-semibold tracking-widest text-sky-500">新 词</p>
            <WordCard word={word} />
          </main>
          <BottomBar>
            <PrimaryButton onClick={() => showQuiz(plan!, item!)}>记住了，练一练</PrimaryButton>
            <p className="mt-2 text-center text-xs text-stone-400">也可以向左滑</p>
          </BottomBar>
        </>
      )}

      {(stage === 'quiz' || stage === 'rate') && quiz && word && (
        <>
          <main key={`${item!.cardId}-${item!.encounters}`} className="flex-1 pt-8 pb-56 animate-rise">
            <QuizPrompt quiz={quiz} revealed={stage === 'rate'} />
            <div className="mt-8 space-y-3">
              {quiz.options.map((o) => {
                const state = !picked ? 'idle' : o.correct ? 'right' : o.key === picked ? 'wrongPick' : 'dim'
                return (
                  <button
                    key={o.key}
                    type="button"
                    disabled={!!picked}
                    onClick={() => onPick(o.key)}
                    className={`flex min-h-14 w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition ${
                      quiz.type === 'cn2en' ? 'text-xl font-semibold' : 'text-lg'
                    } ${
                      state === 'right'
                        ? 'animate-pop border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : state === 'wrongPick'
                          ? 'animate-shake border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : state === 'dim'
                            ? 'border-stone-200 opacity-40 dark:border-stone-800'
                            : 'border-stone-200 bg-white active:border-emerald-400 active:bg-emerald-50 dark:border-stone-800 dark:bg-stone-900 dark:active:bg-emerald-950'
                    }`}
                  >
                    <span>{o.label}</span>
                    {state === 'right' && <CheckIcon className="size-6 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </main>
          {stage === 'rate' && intervals && (
            <BottomBar>
              <p className="mb-2 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400">答对了！记得有多牢？</p>
              <div className="grid grid-cols-3 gap-2">
                {([Rating.Hard, Rating.Good, Rating.Easy] as Grade[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onRate(g)}
                    className={`flex min-h-16 flex-col items-center justify-center rounded-2xl font-bold text-white transition active:translate-y-1 active:shadow-none ${
                      g === Rating.Hard
                        ? 'bg-amber-500 shadow-[0_4px_0_#b45309]'
                        : g === Rating.Good
                          ? 'bg-emerald-500 shadow-[0_4px_0_#059669]'
                          : 'bg-sky-500 shadow-[0_4px_0_#0369a1]'
                    }`}
                  >
                    <span className="text-lg">{GRADE_LABEL[g]}</span>
                    <span className="text-xs font-medium opacity-90">{intervals[g]}</span>
                  </button>
                ))}
              </div>
            </BottomBar>
          )}
        </>
      )}

      {stage === 'wrong' && word && (
        <>
          <main className="flex-1 pt-6 pb-32" {...swipeWrong}>
            <p className="mb-4 text-center text-sm font-semibold text-rose-500">再看一遍，等会儿还会考你</p>
            <WordCard word={word} />
          </main>
          <BottomBar>
            <PrimaryButton onClick={onContinue}>继续</PrimaryButton>
          </BottomBar>
        </>
      )}

      {stage === 'done' && (
        <main className="flex flex-1 flex-col items-center justify-center pb-24 text-center animate-rise">
          <p className="text-6xl">🎉</p>
          <h1 className="mt-4 text-2xl font-bold">完成！</h1>
          {stats.newDone + stats.reviewDone + stats.correct + stats.wrong > 0 ? (
            <p className="mt-2 text-stone-500">
              新学 {stats.newDone} 个 · 复习 {stats.reviewDone} 个
              <br />
              正确率 {Math.round((stats.correct / Math.max(1, stats.correct + stats.wrong)) * 100)}%
            </p>
          ) : (
            <p className="mt-2 text-stone-500">今天没有要学的了</p>
          )}
          <div className="mt-10 w-full">
            <PrimaryButton onClick={exit}>返回首页</PrimaryButton>
          </div>
        </main>
      )}
    </div>
  )
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[var(--color-page)] from-70% to-transparent pt-6 dark:from-[var(--color-page-dark)]">
      <div className="mx-auto max-w-lg px-4">{children}</div>
    </div>
  )
}

function QuizPrompt({ quiz, revealed }: { quiz: Quiz; revealed: boolean }) {
  const w = quiz.word
  if (quiz.type === 'en2cn') {
    return (
      <div className="text-center">
        <p className="text-sm text-stone-400">选择正确的中文意思</p>
        <h1 className="mt-4 break-words text-5xl font-bold tracking-tight">{w.word}</h1>
        <div className="mt-2">
          <Phonetics word={w} />
        </div>
      </div>
    )
  }
  return (
    <div className="text-center">
      <p className="text-sm text-stone-400">选择对应的英文</p>
      <p className="mt-6 text-3xl font-bold">
        <PosTag pos={w.meanings[0]?.pos ?? ''} />
        {w.meanings[0]?.cn}
      </p>
      {revealed && (
        <div className="mt-3 flex items-center justify-center gap-1 animate-rise">
          <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{w.word}</span>
          <SpeakButton text={w.word} />
        </div>
      )}
    </div>
  )
}
