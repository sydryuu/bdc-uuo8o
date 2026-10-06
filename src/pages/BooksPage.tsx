import { useState } from 'react'
import { SearchIcon } from '../components/icons'
import { ProgressBar } from '../components/ui'
import { allBooks, bookProgress, deleteCustomBook, ensureBook, isCustomBook } from '../db/books'
import { db } from '../db/db'
import { navigate } from '../lib/router'
import { updateSettings, useSettings } from '../lib/settings'
import { useLive } from '../lib/useLive'
import type { BookMeta } from '../types/vocab'

const mb = (bytes?: number) => (bytes ? (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`) : '')

export function BooksPage() {
  const s = useSettings()
  const [error, setError] = useState('')
  const [switching, setSwitching] = useState('')
  // 词书列表和进度：db.books 变化（下载、导入、删除）时自动刷新
  const data = useLive(async () => {
    const books = await allBooks()
    const local = new Map((await db.books.toArray()).map((b) => [b.id, b]))
    const progress: Record<string, number> = {}
    for (const id of local.keys()) progress[id] = (await bookProgress(id)).learned
    return { books, local, progress }
  }, [])

  const choose = async (b: BookMeta) => {
    if (switching) return
    setSwitching(b.id)
    setError('')
    try {
      await ensureBook(b)
      await updateSettings({ currentBookId: b.id })
    } catch (e) {
      setError(`${b.name} 下载失败：${(e as Error).message}。请检查网络后再试。`)
    } finally {
      setSwitching('')
    }
  }

  const remove = async (b: BookMeta) => {
    if (!confirm(`删除"${b.name}"？已经学过的词和学习记录会保留。`)) return
    await deleteCustomBook(b.id)
    if (s.currentBookId === b.id) await updateSettings({ currentBookId: 'pep-3a' })
  }

  const books = data?.books ?? []
  const stages = [...new Set(books.map((b) => b.stageName))]

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top pb-2">
        <div className="flex items-center justify-between pt-2">
          <h1 className="text-2xl font-bold">词书</h1>
          <button type="button" aria-label="查词" onClick={() => navigate('search')} className="-mr-2 flex size-11 items-center justify-center text-stone-500">
            <SearchIcon className="size-6" />
          </button>
        </div>
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
                const learned = data?.progress[b.id] ?? 0
                const current = s.currentBookId === b.id
                const downloaded = data?.local.has(b.id)
                const custom = isCustomBook(b.id)
                return (
                  <div
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => choose(b)}
                    onKeyDown={(e) => e.key === 'Enter' && choose(b)}
                    className={`w-full cursor-pointer rounded-2xl border-2 bg-white p-4 text-left shadow-sm transition dark:bg-stone-900 ${
                      current ? 'border-emerald-500' : 'border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{b.name}</span>
                      {current ? (
                        <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-semibold text-white">当前</span>
                      ) : switching === b.id ? (
                        <span className="shrink-0 text-xs text-stone-400">{downloaded ? '切换中…' : `下载中（${mb(b.bytes)}）…`}</span>
                      ) : custom ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            remove(b)
                          }}
                          className="-my-2 shrink-0 px-2 py-2 text-xs text-stone-400"
                        >
                          删除
                        </button>
                      ) : null}
                    </div>
                    <ProgressBar className="mt-3 h-2" value={learned / Math.max(1, b.wordCount)} />
                    <p className="mt-1.5 text-xs tabular-nums text-stone-400">
                      已学 {learned} / {b.wordCount}
                      {!downloaded && !custom && b.bytes && b.bytes > 300 * 1024 && ` · 约 ${mb(b.bytes)}，选中时下载`}
                    </p>
                  </div>
                )
              })}
          </div>
        </section>
      ))}
      <button
        type="button"
        onClick={() => navigate('import')}
        className="mt-6 w-full rounded-2xl border-2 border-dashed border-stone-300 py-4 font-semibold text-emerald-600 active:bg-stone-100 dark:border-stone-700 dark:text-emerald-400 dark:active:bg-stone-800"
      >
        + 导入自己的词书
      </button>
    </div>
  )
}
