import { db } from '../db/db'
import { useLive } from '../lib/useLive'
import { addPhraseCard, removePhraseCard, toggleFavorite } from '../srs/store'
import { phraseCardId, State } from '../srs/scheduler'
import type { Phrase, Word } from '../types/vocab'
import { CheckIcon, PlusIcon, StarIcon } from './icons'
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

/** 短语"加入学习"开关：没学过的可以再移出，学过的显示已加入 */
function AddPhraseButton({ word, phrase, bookId, state }: { word: Word; phrase: Phrase; bookId: string; state: State | undefined }) {
  const added = state !== undefined
  return (
    <button
      type="button"
      aria-label={added ? `已加入学习：${phrase.en}` : `把 ${phrase.en} 加入学习`}
      disabled={added && state !== State.New}
      onClick={(e) => {
        e.stopPropagation()
        if (added) removePhraseCard(phrase.id)
        else addPhraseCard(word, phrase, bookId)
      }}
      className={`inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full px-2.5 text-xs font-semibold transition ${
        added
          ? 'bg-emerald-500 text-white disabled:opacity-60'
          : 'border border-emerald-500 text-emerald-600 active:bg-emerald-50 dark:text-emerald-400 dark:active:bg-emerald-950'
      }`}
    >
      {added ? <CheckIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
      {added ? '已加' : '学'}
    </button>
  )
}

/** 收藏按钮（加入生词本） */
export function FavoriteButton({ word, className = '' }: { word: Word; className?: string }) {
  const fav = useLive(async () => !!(await db.favorites.get(word.id)), [word.id])
  return (
    <button
      type="button"
      aria-label={fav ? '已收藏，点击取消' : '收藏到生词本'}
      aria-pressed={!!fav}
      onClick={(e) => {
        e.stopPropagation()
        toggleFavorite(word)
      }}
      className={`flex size-11 items-center justify-center rounded-full ${fav ? 'text-amber-500' : 'text-stone-300 dark:text-stone-600'} ${className}`}
    >
      <StarIcon filled={!!fav} />
    </button>
  )
}

/** 完整单词卡：单词、音标、释义、例句、短语。传入 bookId 时短语可以单独加入学习 */
export function WordCard({ word, compact = false, bookId }: { word: Word; compact?: boolean; bookId?: string }) {
  const phraseStates = useLive(async () => {
    const rows = await db.cards.bulkGet(word.phrases.map((p) => phraseCardId(p.id)))
    return new Map(rows.filter((r) => !!r).map((r) => [r!.refId, r!.state]))
  }, [word.id])
  return (
    <div className="animate-rise">
      <div className="relative text-center">
        <FavoriteButton word={word} className="absolute -top-2 -right-2" />
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
          <h2 className="mb-2 text-sm font-semibold text-stone-400">
            常用短语{bookId && <span className="ml-2 font-normal">点"学"可以单独背这个短语</span>}
          </h2>
          <ul className="divide-y divide-stone-200 dark:divide-stone-800">
            {word.phrases.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-0.5">
                <div className="flex-1">
                  <span className="font-medium">{p.en}</span>
                  <span className="ml-2 text-sm text-stone-500 dark:text-stone-400">{p.cn}</span>
                </div>
                <SpeakButton text={p.en} label="朗读短语" />
                {bookId && <AddPhraseButton word={word} phrase={p} bookId={bookId} state={phraseStates?.get(p.id)} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
