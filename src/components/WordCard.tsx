import type { Word } from '../types/vocab'
import { SpeakButton } from './SpeakButton'

export function PosTag({ pos }: { pos: string }) {
  if (!pos) return null
  return (
    <span className="mr-1.5 inline-block rounded bg-stone-200/70 px-1.5 py-0.5 align-[1px] text-xs font-medium text-stone-600 dark:bg-stone-700/60 dark:text-stone-300">
      {pos === 'phr.' ? '短语' : pos}
    </span>
  )
}

export function Phonetics({ word }: { word: Word }) {
  const rows = [
    { label: '英', accent: 'uk' as const, ipa: word.uk },
    { label: '美', accent: 'us' as const, ipa: word.us },
  ]
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 text-stone-500 dark:text-stone-400">
      {rows.map((r) => (
        <span key={r.accent} className="inline-flex items-center">
          <span className="text-sm">{r.label}</span>
          {r.ipa && <span className="ml-1 font-ipa text-[15px]">/{r.ipa}/</span>}
          <SpeakButton text={word.word} accent={r.accent} label={`${r.label}式发音`} className="-ml-0.5" />
        </span>
      ))}
    </div>
  )
}

/** 完整单词卡：单词、音标、释义、例句、短语 */
export function WordCard({ word, compact = false }: { word: Word; compact?: boolean }) {
  return (
    <div className="animate-rise">
      <div className="text-center">
        <h1 className="break-words text-5xl font-bold tracking-tight text-stone-900 dark:text-white">{word.word}</h1>
        <div className="mt-2">
          <Phonetics word={word} />
        </div>
      </div>

      <ul className="mt-5 space-y-1.5 text-center text-lg">
        {word.meanings.map((m, i) => (
          <li key={i}>
            <PosTag pos={m.pos} />
            {m.cn}
          </li>
        ))}
      </ul>

      {!compact && word.examples.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2 text-sm font-semibold text-stone-400">例句</h2>
          <ul className="space-y-3">
            {word.examples.map((e, i) => (
              <li key={i} className="flex items-start gap-1">
                <div className="flex-1 pt-2.5">
                  <p className="leading-snug">{e.en}</p>
                  <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{e.cn}</p>
                </div>
                <SpeakButton text={e.en} label="朗读例句" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!compact && word.phrases.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-stone-400">常用短语</h2>
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {word.phrases.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-0.5">
                <div className="flex-1">
                  <span className="font-medium">{p.en}</span>
                  <span className="ml-2 text-sm text-stone-500 dark:text-stone-400">{p.cn}</span>
                </div>
                <SpeakButton text={p.en} label="朗读短语" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
