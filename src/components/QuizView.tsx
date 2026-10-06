import { useEffect, useRef, useState } from 'react'
import { speak } from '../audio/player'
import { getSettings } from '../lib/settings'
import { checkSpelling, QUIZ_LABEL, type Quiz } from '../quiz/quiz'
import { BulbIcon, CheckIcon, SpeakerIcon } from './icons'
import { SpeakButton } from './SpeakButton'
import { Phonetics, PosTag } from './WordCard'

export interface AnswerMeta {
  /** 拼写题用了提示 */
  hint: boolean
}

/** 题目区。父组件用 key 保证每道题重新挂载 */
export function QuizView({ quiz, revealed, onAnswer }: { quiz: Quiz; revealed: boolean; onAnswer: (correct: boolean, meta: AnswerMeta) => void }) {
  const w = quiz.word
  const sayText = quiz.type === 'phrase' && quiz.phrase ? quiz.phrase.en : w.word

  // 出题时自动发音：听音、拼写必放；看英文选中文按设置；其余题型会泄露答案，不放
  useEffect(() => {
    const s = getSettings()
    if (quiz.type === 'listen' || quiz.type === 'spell' || (quiz.type === 'en2cn' && s.autoPlay)) speak(w.word, s.accent)
  }, [quiz, w.word])

  const answered = (correct: boolean, meta: AnswerMeta = { hint: false }) => {
    const s = getSettings()
    // 答完把答案读一遍（看英文选中文时已经读过）
    if (quiz.type !== 'en2cn' && (s.autoPlay || !correct)) speak(sayText, s.accent)
    onAnswer(correct, meta)
  }

  return (
    <div>
      <p className="text-center text-xs font-semibold tracking-wider text-stone-400">{QUIZ_LABEL[quiz.type]}</p>
      <div className="mt-3">
        <Prompt quiz={quiz} revealed={revealed} />
      </div>
      {quiz.type === 'spell' ? (
        <SpellInput quiz={quiz} onAnswer={answered} />
      ) : (
        <Choices quiz={quiz} onAnswer={answered} />
      )}
    </div>
  )
}

function BigSpeaker({ text, label }: { text: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => speak(text, getSettings().accent)}
      className="mx-auto flex size-24 items-center justify-center rounded-full bg-sky-500 text-white shadow-[0_5px_0_#0369a1] transition active:translate-y-1 active:shadow-none"
    >
      <SpeakerIcon className="size-11" />
    </button>
  )
}

function Meaning({ quiz }: { quiz: Quiz }) {
  const m = quiz.word.meanings[0]
  return (
    <p className="text-center text-3xl font-bold leading-snug">
      <PosTag pos={m?.pos ?? ''} />
      {m?.cn}
    </p>
  )
}

function RevealWord({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-center justify-center gap-1 animate-rise">
      <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{text}</span>
      <SpeakButton text={text} />
    </div>
  )
}

function Prompt({ quiz, revealed }: { quiz: Quiz; revealed: boolean }) {
  const w = quiz.word
  switch (quiz.type) {
    case 'en2cn':
      return (
        <div className="text-center">
          <h1 className="break-words text-5xl font-bold tracking-tight">{w.word}</h1>
          <div className="mt-2">
            <Phonetics word={w} />
          </div>
        </div>
      )
    case 'cn2en':
      return (
        <div className="pt-3">
          <Meaning quiz={quiz} />
          {revealed && <RevealWord text={w.word} />}
        </div>
      )
    case 'listen':
      return (
        <div className="pt-2 text-center">
          <BigSpeaker text={w.word} label="再听一遍" />
          <p className="mt-3 text-sm text-stone-400">{revealed ? w.meanings[0]?.cn : '点喇叭可以再听一遍'}</p>
        </div>
      )
    case 'spell':
      return (
        <div className="pt-1 text-center">
          <Meaning quiz={quiz} />
          <div className="mt-3 flex justify-center">
            <SpeakButton text={w.word} label="再听一遍" className="size-14 bg-sky-50 dark:bg-sky-950" />
          </div>
        </div>
      )
    case 'cloze': {
      const c = quiz.cloze!
      return (
        <div className="pt-2">
          <p className="text-center text-2xl leading-relaxed font-medium">
            {c.before}
            {revealed ? (
              <span className="rounded bg-emerald-100 px-1 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{c.answer}</span>
            ) : (
              <span className="inline-block w-20 border-b-2 border-stone-400 align-baseline">&nbsp;</span>
            )}
            {c.after}
          </p>
          <p className="mt-3 text-center text-sm text-stone-500 dark:text-stone-400">{c.cn}</p>
        </div>
      )
    }
    case 'phrase':
      return (
        <div className="pt-2 text-center">
          <p className="text-sm text-stone-400">
            和 <span className="font-semibold text-stone-600 dark:text-stone-300">{w.word}</span> 搭配，意思是
          </p>
          <p className="mt-2 text-3xl font-bold">{quiz.phrase?.cn}</p>
          {revealed && quiz.phrase && <RevealWord text={quiz.phrase.en} />}
        </div>
      )
  }
}

function Choices({ quiz, onAnswer }: { quiz: Quiz; onAnswer: (correct: boolean) => void }) {
  const [picked, setPicked] = useState<string | null>(null)
  const big = quiz.type !== 'en2cn'
  return (
    <div className="mt-8 space-y-3">
      {quiz.options.map((o) => {
        const state = !picked ? 'idle' : o.correct ? 'right' : o.key === picked ? 'wrongPick' : 'dim'
        return (
          <button
            key={o.key}
            type="button"
            disabled={!!picked}
            onClick={() => {
              setPicked(o.key)
              onAnswer(o.correct)
            }}
            className={`flex min-h-14 w-full items-center justify-between rounded-2xl border-2 px-4 py-3 text-left transition ${
              big ? 'text-xl font-semibold' : 'text-lg'
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
  )
}

function SpellInput({ quiz, onAnswer }: { quiz: Quiz; onAnswer: (correct: boolean, meta: AnswerMeta) => void }) {
  const target = quiz.word.word
  const [value, setValue] = useState('')
  const [hint, setHint] = useState(false)
  const [result, setResult] = useState<null | boolean>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus() // 安卓会弹出键盘；iOS 需要用户点一下输入框
  }, [])

  const submit = () => {
    if (result !== null || !value.trim()) return
    const ok = checkSpelling(value, quiz.word)
    setResult(ok)
    input.current?.blur() // 收起键盘，露出下面的评分按钮
    onAnswer(ok, { hint })
  }

  const useHint = () => {
    setHint(true)
    if (!value.toLowerCase().startsWith(target[0].toLowerCase())) setValue(target[0])
    input.current?.focus()
  }

  return (
    <div className="mt-8">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          ref={input}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={result !== null}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label="输入单词"
          placeholder="输入听到的单词"
          className={`h-16 w-full rounded-2xl border-2 bg-white px-4 text-center text-2xl font-semibold tracking-wide outline-none placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-stone-300 dark:bg-stone-900 ${
            result === true
              ? 'animate-pop border-emerald-500 text-emerald-700 dark:text-emerald-300'
              : result === false
                ? 'animate-shake border-rose-400 text-rose-600 line-through dark:text-rose-300'
                : 'border-stone-200 focus:border-emerald-400 dark:border-stone-700'
          }`}
        />
        {hint && result === null && (
          <p className="mt-2 text-center font-mono text-lg tracking-[0.3em] text-stone-400" aria-label={`共 ${target.length} 个字母`}>
            {target
              .split('')
              .map((ch, i) => (i === 0 ? ch : ch === ' ' ? ' ' : '_'))
              .join('')}
          </p>
        )}
        {result === false && (
          <p className="mt-3 text-center text-lg">
            正确答案：<span className="font-bold text-emerald-600 dark:text-emerald-400">{target}</span>
          </p>
        )}
        {result === null && (
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={useHint}
              disabled={hint}
              className="flex min-h-14 items-center gap-1 rounded-2xl border-2 border-stone-200 px-4 font-semibold text-stone-600 disabled:opacity-40 dark:border-stone-700 dark:text-stone-300"
            >
              <BulbIcon />
              提示
            </button>
            <button
              type="submit"
              disabled={!value.trim()}
              className="min-h-14 flex-1 rounded-2xl bg-emerald-500 text-lg font-bold text-white shadow-[0_4px_0_#059669] transition active:translate-y-1 active:shadow-none disabled:opacity-40"
            >
              确定
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
