import { useState } from 'react'
import { SpeakButton } from '../components/SpeakButton'
import { PrimaryButton, SubHeader } from '../components/ui'
import { PosTag } from '../components/WordCard'
import { db } from '../db/db'
import { navigate, openWord } from '../lib/router'
import { useLive } from '../lib/useLive'
import { wordCardId } from '../srs/scheduler'
import { addWordCard } from '../srs/store'
import type { Word } from '../types/vocab'

export function FavoritesPage() {
  const [adding, setAdding] = useState(false)
  const data = useLive(async () => {
    const favs = (await db.favorites.toArray()).sort((a, b) => b.addedAt - a.addedAt)
    const words = await db.words.bulkGet(favs.map((f) => f.wordId))
    const cards = await db.cards.bulkGet(favs.map((f) => wordCardId(f.wordId)))
    return favs
      .map((_, i) => ({ word: words[i], learning: !!cards[i] }))
      .filter((x): x is { word: Word; learning: boolean } => !!x.word)
  }, [])
  const notLearning = (data ?? []).filter((x) => !x.learning)

  return (
    <div className="mx-auto max-w-lg px-4 pb-48">
      <SubHeader title="生词本" back={() => navigate('me', { replace: true })} backLabel="我的" />
      {data && data.length === 0 && (
        <p className="mt-16 text-center leading-relaxed text-stone-400">
          还没有收藏的词
          <br />
          在单词卡右上角点 ☆ 就能收藏
        </p>
      )}
      <ul className="mt-3 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm empty:hidden dark:divide-stone-800 dark:bg-stone-900">
        {data?.map(({ word, learning }) => (
          <li key={word.id} className="flex items-center">
            <button type="button" onClick={() => openWord(word.id)} className="min-w-0 flex-1 px-4 py-3 text-left active:bg-stone-50 dark:active:bg-stone-800">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold">{word.word}</span>
                {learning && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">学习中</span>}
              </div>
              <p className="truncate text-sm text-stone-500 dark:text-stone-400">
                <PosTag pos={word.meanings[0]?.pos ?? ''} />
                {word.meanings.map((m) => m.cn).join('；')}
              </p>
            </button>
            <SpeakButton text={word.word} className="mr-2" />
          </li>
        ))}
      </ul>
      {notLearning.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),12px)+52px)] z-10 bg-gradient-to-t from-[var(--color-page)] from-60% to-transparent pt-6 pb-3 dark:from-[var(--color-page-dark)]">
          <div className="mx-auto max-w-lg px-4">
            <PrimaryButton
              disabled={adding}
              onClick={async () => {
                setAdding(true)
                for (const x of notLearning) await addWordCard(x.word)
                setAdding(false)
              }}
            >
              把 {notLearning.length} 个生词加入学习
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  )
}
