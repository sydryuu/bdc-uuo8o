import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { speak } from '../audio/player'
import { CloseIcon } from '../components/icons'
import { QuizView, type AnswerMeta } from '../components/QuizView'
import { SpeakButton } from '../components/SpeakButton'
import { PrimaryButton, ProgressBar } from '../components/ui'
import { WordCard } from '../components/WordCard'
import type { QuizType } from '../db/db'
import { vibrateCorrect, vibrateWrong } from '../lib/feedback'
import { navigate } from '../lib/router'
import { getSettings } from '../lib/settings'
import { buildQuiz, chooseQuizType, eligibleTypes, phraseAsWord, quizLevel, type Quiz } from '../quiz/quiz'
import { answerPractice, createPractice, currentPractice, type Practice } from '../srs/practice'
import { GRADE_LABEL, previewIntervals, Rating, State, type Grade } from '../srs/scheduler'
import { applyGrade, createSession, pickNext, type Session, type SessionItem } from '../srs/session'
import { loadMistakePlan, loadTodayPlan, savePractice, saveAnswer, type StudyPlan } from '../srs/store'
import type { Phrase, Word } from '../types/vocab'

type Mode = 'today' | 'practice'
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

const isFresh = (it: SessionItem) => !it.card || it.card.state === State.New

/** 学习项对应的单词和（短语卡的）短语 */
function lookup(plan: StudyPlan, it: SessionItem): { word: Word; phrase?: Phrase } {
  const word = plan.words.get(it.wordId)!
  return { word, phrase: it.phraseId ? word.phrases.find((p) => p.id === it.phraseId) : undefined }
}

export function StudyPage({ mode = 'today' }: { mode?: Mode }) {
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [practice, setPractice] = useState<Practice | null>(null)
  const [item, setItem] = useState<SessionItem | null>(null)
  const [stage, setStage] = useState<Stage>('loading')
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [hintUsed, setHintUsed] = useState(false)
  const [error, setError] = useState('')
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({ newDone: 0, reviewDone: 0, correct: 0, wrong: 0 })
  const lastQuiz = useRef(new Map<string, QuizType>())
  const shownAt = useRef(0)
  const quizSeq = useRef(0)

  // 短语卡出题用的词池：同一本书所有单词的短语
  const phrasePools = useRef(new Map<string, Word[]>())
  const phrasePool = (p: StudyPlan, bookId: string) => {
    if (!phrasePools.current.has(bookId)) {
      const words = p.pools.get(bookId) ?? [...p.words.values()]
      phrasePools.current.set(bookId, words.flatMap((w) => w.phrases).map(phraseAsWord))
    }
    return phrasePools.current.get(bookId)!
  }

  const showQuiz = useCallback((p: StudyPlan, it: SessionItem, firstExposure: boolean) => {
    const { word, phrase } = lookup(p, it)
    const target = phrase ? phraseAsWord(phrase) : word
    const pool = phrase ? phrasePool(p, it.bookId) : (p.pools.get(it.bookId) ?? [...p.words.values()])
    const types = eligibleTypes(target, phrase ? 0 : quizLevel(it.card), !!phrase)
    const type = chooseQuizType(types, lastQuiz.current.get(it.cardId), firstExposure, Math.random)
    quizSeq.current++
    setQuiz(buildQuiz(type, target, pool, Math.random))
    setHintUsed(false)
    setStage('quiz')
    shownAt.current = Date.now()
    window.scrollTo(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const show = useCallback(
    (p: StudyPlan, next: SessionItem | null) => {
      setItem(next)
      if (!next) return setStage('done')
      if (mode === 'today' && isFresh(next)) {
        setStage('card')
        const { word, phrase } = lookup(p, next)
        if (getSettings().autoPlay) speak(phrase?.en ?? word.word, getSettings().accent)
        window.scrollTo(0, 0)
      } else {
        showQuiz(p, next, false)
      }
    },
    [mode, showQuiz],
  )

  useEffect(() => {
    const load = mode === 'practice' ? loadMistakePlan : loadTodayPlan
    load(Date.now())
      .then((p) => {
        setPlan(p)
        if (mode === 'practice') {
          const pr = createPractice(p.reviews)
          setPractice(pr)
          setTotal(pr.total)
          show(p, currentPractice(pr))
        } else {
          const s = createSession({ reviews: p.reviews, news: p.news, dayEnd: p.dayEnd })
          setSession(s)
          setTotal(s.items.length)
          show(p, pickNext(s, Date.now()))
        }
      })
      .catch((e) => {
        setError(String(e.message ?? e))
        setStage('error')
      })
  }, [mode, show])

  /** 今日模式：评分并保存，返回更新后的会话 */
  const commit = (grade: Grade, correct: boolean): Session => {
    const now = Date.now()
    const r = applyGrade(session!, item!.cardId, grade, now)
    saveAnswer({ item: item!, grade, record: r.record, wasNew: r.wasNew, quiz: quiz!.type, correct, ms: now - shownAt.current, now }).catch((e) =>
      console.error('保存失败', e),
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

  const onAnswer = (correct: boolean, meta: AnswerMeta) => {
    if (!item || !quiz || !plan) return
    lastQuiz.current.set(item.cardId, quiz.type)
    const seq = quizSeq.current
    const later = (f: () => void, ms: number) => setTimeout(() => quizSeq.current === seq && f(), ms)
    if (correct) vibrateCorrect()
    else vibrateWrong()

    if (mode === 'practice') {
      const now = Date.now()
      savePractice({ cardId: item.cardId, quiz: quiz.type, correct, ms: now - shownAt.current, now }).catch((e) => console.error(e))
      setStats((st) => ({ ...st, correct: st.correct + (correct ? 1 : 0), wrong: st.wrong + (correct ? 0 : 1) }))
      const next = answerPractice(practice!, correct)
      setPractice(next)
      if (correct) later(() => show(plan, currentPractice(next)), quiz.type === 'spell' ? 1100 : 750)
      else later(() => setStage('wrong'), 900)
      return
    }

    if (correct) {
      setHintUsed(meta.hint)
      later(() => setStage('rate'), quiz.type === 'spell' ? 300 : 450)
    } else {
      commit(Rating.Again, false) // 答错自动记为"忘记"
      later(() => setStage('wrong'), quiz.type === 'spell' ? 1400 : 900)
    }
  }

  const nextItem = (s?: Session) =>
    mode === 'practice' ? show(plan!, currentPractice(practice!)) : show(plan!, pickNext(s ?? session!, Date.now()))
  const onRate = (grade: Grade) => nextItem(commit(grade, true))
  const startQuiz = () => plan && item && showQuiz(plan, item, true)
  const swipeCard = useSwipeLeft(() => stage === 'card' && startQuiz())
  const swipeWrong = useSwipeLeft(() => stage === 'wrong' && nextItem())

  const intervals = useMemo(() => (stage === 'rate' && item ? previewIntervals(item.card, Date.now()) : null), [stage, item])
  const rateGrades: Grade[] = hintUsed ? [Rating.Hard, Rating.Good] : [Rating.Hard, Rating.Good, Rating.Easy]

  const remaining = mode === 'practice' ? (practice?.queue.length ?? 0) : (session?.items.length ?? 0)
  const counts = useMemo(() => {
    const c = { fresh: 0, learning: 0, review: 0 }
    for (const it of session?.items ?? []) {
      if (isFresh(it)) c.fresh++
      else if (it.card!.state === State.Review) c.review++
      else c.learning++
    }
    return c
  }, [session])
  const exit = () => navigate(mode === 'practice' ? 'mistakes' : 'today', { replace: true })
  const looked = plan && item ? lookup(plan, item) : null
  // 开发模式下暴露当前题目，方便自动化测试；生产包里会被移除
  if (import.meta.env.DEV) (window as unknown as { __quiz?: Quiz | null }).__quiz = stage === 'quiz' ? quiz : null

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col px-4">
      <header className="safe-top sticky top-0 z-10 -mx-4 bg-[var(--color-page)] px-4 pb-2 dark:bg-[var(--color-page-dark)]">
        <div className="flex items-center gap-3 pt-1">
          <button type="button" onClick={exit} aria-label="退出" className="-ml-2 flex size-11 items-center justify-center text-stone-400">
            <CloseIcon />
          </button>
          <ProgressBar
            className="flex-1"
            value={total ? (mode === 'practice' ? (practice?.cleared ?? 0) / total : (total - remaining) / total) : 0}
          />
        </div>
        {stage !== 'done' && stage !== 'loading' && (
          <p className="mt-1 text-center text-xs tabular-nums text-stone-400">
            {mode === 'practice' ? (
              <span className="text-rose-500">错题练习 · 剩 {remaining} 个</span>
            ) : (
              <>
                <span className="text-sky-600 dark:text-sky-400">新 {counts.fresh}</span> ·{' '}
                <span className="text-amber-500">学习中 {counts.learning}</span> ·{' '}
                <span className="text-emerald-600 dark:text-emerald-400">复习 {counts.review}</span>
              </>
            )}
          </p>
        )}
      </header>

      {stage === 'loading' && <p className="mt-24 text-center text-stone-400">准备题目…</p>}
      {stage === 'error' && (
        <div className="mt-24 text-center">
          <p className="text-rose-600">加载失败：{error}</p>
          <button type="button" className="mt-4 text-emerald-600" onClick={exit}>
            返回
          </button>
        </div>
      )}

      {stage === 'card' && looked && (
        <>
          <main className="flex-1 pt-6 pb-32" {...swipeCard}>
            <p className="mb-4 text-center text-xs font-semibold tracking-widest text-sky-600 dark:text-sky-400">
              {looked.phrase ? '新 短 语' : '新 词'}
            </p>
            {looked.phrase ? <PhraseCard phrase={looked.phrase} word={looked.word} /> : <WordCard word={looked.word} bookId={item!.bookId} />}
          </main>
          <BottomBar>
            <PrimaryButton onClick={startQuiz}>记住了，练一练</PrimaryButton>
            <p className="mt-2 text-center text-xs text-stone-400">也可以向左滑</p>
          </BottomBar>
        </>
      )}

      {(stage === 'quiz' || stage === 'rate') && quiz && (
        <>
          <main className="flex-1 pt-6 pb-56 animate-rise">
            <QuizView key={quizSeq.current} quiz={quiz} revealed={stage === 'rate'} onAnswer={onAnswer} />
          </main>
          {stage === 'rate' && intervals && (
            <BottomBar>
              <p className="mb-2 text-center text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {hintUsed ? '答对了！用了提示，记得还不太牢' : '答对了！记得有多牢？'}
              </p>
              <div className={`grid gap-2 ${rateGrades.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {rateGrades.map((g) => (
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

      {stage === 'wrong' && looked && (
        <>
          <main className="flex-1 pt-6 pb-32" {...swipeWrong}>
            <p className="mb-4 text-center text-sm font-semibold text-rose-500">再看一遍，等会儿还会考你</p>
            {looked.phrase ? <PhraseCard phrase={looked.phrase} word={looked.word} /> : <WordCard word={looked.word} bookId={item!.bookId} />}
          </main>
          <BottomBar>
            <PrimaryButton onClick={() => nextItem()}>继续</PrimaryButton>
          </BottomBar>
        </>
      )}

      {stage === 'done' && (
        <main className="flex flex-1 flex-col items-center justify-center pb-24 text-center animate-rise">
          <p className="text-6xl">🎉</p>
          <h1 className="mt-4 text-2xl font-bold">{mode === 'practice' ? '错题练完了！' : '完成！'}</h1>
          {stats.correct + stats.wrong > 0 ? (
            <p className="mt-2 text-stone-500">
              {mode === 'practice' ? `练了 ${total} 个` : `新学 ${stats.newDone} 个 · 复习 ${stats.reviewDone} 个`}
              <br />
              正确率 {Math.round((stats.correct / Math.max(1, stats.correct + stats.wrong)) * 100)}%
            </p>
          ) : (
            <p className="mt-2 text-stone-500">{mode === 'practice' ? '错题本是空的' : '今天没有要学的了'}</p>
          )}
          <div className="mt-10 w-full">
            <PrimaryButton onClick={exit}>{mode === 'practice' ? '返回错题本' : '返回首页'}</PrimaryButton>
          </div>
        </main>
      )}
    </div>
  )
}

function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[var(--color-page)] from-70% to-transparent pt-6 dark:from-[var(--color-page-dark)]">
      <div className="mx-auto max-w-lg px-4">{children}</div>
    </div>
  )
}

/** 短语卡：短语、释义、所属单词 */
function PhraseCard({ phrase, word }: { phrase: Phrase; word: Word }) {
  return (
    <div className="animate-rise text-center">
      <div className="flex items-center justify-center gap-1">
        <h1 className="break-words text-4xl font-bold tracking-tight">{phrase.en}</h1>
        <SpeakButton text={phrase.en} />
      </div>
      <p className="mt-4 text-2xl">{phrase.cn}</p>
      <div className="mt-10 rounded-2xl bg-white p-4 text-left shadow-sm dark:bg-stone-900">
        <p className="text-xs text-stone-400">来自单词</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xl font-semibold">{word.word}</span>
          <SpeakButton text={word.word} />
          <span className="text-stone-500 dark:text-stone-400">{word.meanings[0]?.cn}</span>
        </div>
      </div>
    </div>
  )
}
