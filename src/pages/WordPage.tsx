import { useEffect, useState } from 'react'
import { BackIcon } from '../components/icons'
import { PrimaryButton } from '../components/ui'
import { WordCard } from '../components/WordCard'
import { db } from '../db/db'
import { formatInterval } from '../lib/date'
import { getWord, type SearchHit } from '../lib/dict'
import { navigate, useRouteParam } from '../lib/router'
import { useLive } from '../lib/useLive'
import { State, wordCardId } from '../srs/scheduler'
import { addWordCard } from '../srs/store'

export function WordPage() {
  const id = useRouteParam()
  const [hit, setHit] = useState<SearchHit | null | undefined>(undefined)
  const card = useLive(() => db.cards.get(wordCardId(id.toLowerCase())), [id])
  const bookId = useLive(async () => (await db.bookWords.where('wordId').equals(id.toLowerCase()).first())?.bookId ?? 'manual', [id])

  useEffect(() => {
    setHit(undefined)
    getWord(id)
      .then((h) => setHit(h ?? null))
      .catch(() => setHit(null))
  }, [id])

  const back = () => (history.length > 1 ? history.back() : navigate('search', { replace: true }))

  return (
    <div className="mx-auto max-w-lg px-4 pb-44">
      <header className="safe-top pb-2">
        <button type="button" onClick={back} className="-ml-2 flex min-h-11 items-center pr-3 text-emerald-600 dark:text-emerald-400">
          <BackIcon />
          返回
        </button>
      </header>
      {hit === undefined && <p className="mt-20 text-center text-stone-400">查询中…</p>}
      {hit === null && <p className="mt-20 text-center text-stone-400">没有找到"{id}"</p>}
      {hit && (
        <>
          <div className="pt-4">
            <WordCard word={hit.word} bookId={bookId} />
          </div>
          {hit.source === 'dict' && <p className="mt-8 text-center text-xs text-stone-400">这个词来自常用词典，没有例句和短语</p>}
          <div className="fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),12px)+52px)] z-10 bg-gradient-to-t from-[var(--color-page)] from-60% to-transparent pt-6 pb-3 dark:from-[var(--color-page-dark)]">
            <div className="mx-auto max-w-lg px-4">
              {card ? (
                <p className="py-3 text-center text-sm text-stone-500">
                  {card.state === State.New
                    ? '已加入学习，下次学习时会出现'
                    : card.due <= Date.now()
                      ? '已在学习中 · 今天要复习'
                      : `已在学习中 · ${formatInterval(card.due - Date.now())}后复习`}
                </p>
              ) : (
                <PrimaryButton onClick={() => addWordCard(hit.word)}>加入学习</PrimaryButton>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
