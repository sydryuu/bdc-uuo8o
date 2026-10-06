import { useEffect, useRef, useState } from 'react'
import { SearchIcon } from '../components/icons'
import { SubHeader } from '../components/ui'
import { PosTag } from '../components/WordCard'
import { searchWords, type SearchHit } from '../lib/dict'
import { navigate, openWord } from '../lib/router'

const LAST_QUERY = 'beidanci.search'

export function SearchPage() {
  const [q, setQ] = useState(() => {
    try {
      return sessionStorage.getItem(LAST_QUERY) ?? ''
    } catch {
      return ''
    }
  })
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => input.current?.focus(), [])

  useEffect(() => {
    try {
      sessionStorage.setItem(LAST_QUERY, q)
    } catch {
      /* 隐私模式下不可用，忽略 */
    }
    if (!q.trim()) return setHits(null)
    let alive = true
    const t = setTimeout(() => {
      searchWords(q)
        .then((r) => alive && (setHits(r), setError('')))
        .catch((e) => alive && setError(String(e.message ?? e)))
    }, 200)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <SubHeader title="查词" back={() => navigate('me', { replace: true })} backLabel="我的" />
      <div className="sticky top-0 z-10 -mx-4 bg-[var(--color-page)] px-4 py-2 dark:bg-[var(--color-page-dark)]">
        <label className="flex h-12 items-center gap-2 rounded-2xl bg-white px-4 shadow-sm dark:bg-stone-900">
          <SearchIcon className="size-5 text-stone-400" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            enterKeyHint="search"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="输入英文或中文"
            aria-label="查词"
            className="h-full flex-1 bg-transparent text-lg outline-none placeholder:text-base placeholder:text-stone-300"
          />
        </label>
      </div>

      {error && <p className="mt-6 text-center text-sm text-rose-600">查询失败：{error}</p>}
      {!q.trim() && <p className="mt-10 text-center text-sm leading-relaxed text-stone-400">能查到已下载词书里的词，和约 3.7 万个常用词</p>}
      {hits && hits.length === 0 && <p className="mt-10 text-center text-stone-400">没找到"{q}"</p>}

      <ul className="mt-2 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm empty:hidden dark:divide-stone-800 dark:bg-stone-900">
        {hits?.map(({ word, source }) => (
          <li key={word.id}>
            <button type="button" onClick={() => openWord(word.id)} className="flex w-full items-baseline gap-2 px-4 py-3 text-left active:bg-stone-50 dark:active:bg-stone-800">
              <span className="shrink-0 text-lg font-semibold">{word.word}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-stone-500 dark:text-stone-400">
                <PosTag pos={word.meanings[0]?.pos ?? ''} />
                {word.meanings.map((m) => m.cn).join('；')}
              </span>
              {source === 'dict' && <span className="shrink-0 text-[10px] text-stone-300 dark:text-stone-600">词典</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
