import { useEffect, useState } from 'react'
import { ProgressBar } from '../components/ui'
import { bookProgress, ensureBook, loadIndex } from '../db/books'
import { db } from '../db/db'
import { updateSettings, useSettings } from '../lib/settings'
import { useLive } from '../lib/useLive'
import type { BookMeta } from '../types/vocab'

export function BooksPage() {
  const s = useSettings()
  const [books, setBooks] = useState<BookMeta[]>([])
  const [error, setError] = useState('')
  const [switching, setSwitching] = useState('')
  const progress = useLive(async () => {
    const out: Record<string, number> = {}
    for (const b of await db.books.toArray()) out[b.id] = (await bookProgress(b.id)).learned
    return out
  }, [])

  useEffect(() => {
    loadIndex()
      .then((i) => setBooks(i.books))
      .catch((e) => setError(String(e.message ?? e)))
  }, [])

  const choose = async (b: BookMeta) => {
    setSwitching(b.id)
    try {
      await ensureBook(b)
      await updateSettings({ currentBookId: b.id })
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setSwitching('')
    }
  }

  const stages = [...new Set(books.map((b) => b.stageName))]

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top pb-2">
        <h1 className="pt-2 text-2xl font-bold">词书</h1>
        <p className="mt-1 text-sm text-stone-400">点一本作为当前词书。学完会自动接着学下一本。</p>
      </header>
      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
      {stages.map((stage) => (
        <section key={stage} className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-stone-400">{stage}</h2>
          <div className="space-y-2">
            {books
              .filter((b) => b.stageName === stage)
              .map((b) => {
                const learned = progress?.[b.id] ?? 0
                const current = s.currentBookId === b.id
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => choose(b)}
                    className={`w-full rounded-2xl border-2 bg-white p-4 text-left shadow-sm transition dark:bg-stone-900 ${
                      current ? 'border-emerald-500' : 'border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{b.name}</span>
                      {current ? (
                        <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white">当前</span>
                      ) : switching === b.id ? (
                        <span className="text-xs text-stone-400">加载中…</span>
                      ) : null}
                    </div>
                    <ProgressBar className="mt-3 h-2" value={learned / b.wordCount} />
                    <p className="mt-1.5 text-xs tabular-nums text-stone-400">
                      已学 {learned} / {b.wordCount}
                    </p>
                  </button>
                )
              })}
          </div>
        </section>
      ))}
      <p className="mt-8 text-center text-xs text-stone-400">初中、高中、四六级词书会在后续版本加入</p>
    </div>
  )
}
