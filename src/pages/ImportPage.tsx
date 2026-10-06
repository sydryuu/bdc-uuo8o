import { useState } from 'react'
import { Card, PrimaryButton, SubHeader, Toggle } from '../components/ui'
import { saveCustomBook } from '../db/books'
import { db } from '../db/db'
import { lookupMany } from '../lib/dict'
import { fillRows, parseImport, type FillOrigin, type ParseResult } from '../lib/importBook'
import { navigate } from '../lib/router'
import { updateSettings } from '../lib/settings'
import type { Word } from '../types/vocab'

interface Preview {
  parsed: ParseResult
  words: Word[]
  origins: FillOrigin[]
  noMeaning: string[]
}

const SAMPLE = `单词,释义,音标,例句,例句翻译
apple,苹果,ˈæpl,I eat an apple every day.,我每天吃一个苹果。
banana
look after,照顾`

export function ImportPage() {
  const [name, setName] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [makeCurrent, setMakeCurrent] = useState(true)
  const [done, setDone] = useState('')

  const onFile = async (file: File) => {
    setError('')
    setDone('')
    setBusy(true)
    try {
      const text = await file.text()
      const parsed = parseImport(text, file.name)
      if (!parsed.rows.length) throw new Error('文件里没有找到英文单词')
      const ids = parsed.rows.map((r) => r.word.toLowerCase())
      const library = new Map((await db.words.bulkGet(ids)).filter((w): w is Word => !!w).map((w) => [w.id, w]))
      let dict = new Map()
      try {
        dict = await lookupMany(ids)
      } catch {
        // 离线又没缓存词典：只用词库和文件里的内容
      }
      setPreview({ parsed, ...fillRows(parsed.rows, { library, dict }) })
      setName((n) => n || file.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setPreview(null)
      setError(e instanceof SyntaxError ? 'JSON 格式不对' : String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!preview) return
    setBusy(true)
    const id = await saveCustomBook(name.trim() || '我的词书', preview.words)
    if (makeCurrent) await updateSettings({ currentBookId: id })
    setBusy(false)
    setDone(`已保存"${name.trim() || '我的词书'}"，共 ${preview.words.length} 个词`)
    setPreview(null)
    setName('')
  }

  const count = (o: FillOrigin) => preview?.origins.filter((x) => x === o).length ?? 0

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <SubHeader title="导入词书" back={() => navigate('me', { replace: true })} backLabel="我的" />

      {done && (
        <Card className="mt-3 border-2 border-emerald-500">
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">{done}</p>
          <button type="button" onClick={() => navigate('books')} className="mt-2 text-sm text-emerald-600 underline dark:text-emerald-400">
            去词书页看看
          </button>
        </Card>
      )}

      <Card className="mt-3">
        <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 px-4 text-center font-semibold text-emerald-600 active:bg-stone-50 dark:border-stone-600 dark:text-emerald-400 dark:active:bg-stone-800">
          {busy ? '处理中…' : preview ? '换一个文件' : '选择 CSV 或 JSON 文件'}
          <input
            type="file"
            accept=".csv,.txt,.json,.tsv,text/csv,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
              e.target.value = ''
            }}
          />
        </label>
        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      </Card>

      {preview && (
        <Card className="mt-3 space-y-3">
          <label className="block">
            <span className="text-sm text-stone-400">词书名称</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              className="mt-1 h-12 w-full rounded-xl border-2 border-stone-200 bg-transparent px-3 text-lg outline-none focus:border-emerald-400 dark:border-stone-700"
            />
          </label>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { n: count('library'), label: '词库已有', hint: '有例句短语' },
              { n: count('dict'), label: '词典补全', hint: '有音标释义' },
              { n: count('user'), label: '只用你填的', hint: '' },
            ].map((x) => (
              <div key={x.label} className="rounded-xl bg-stone-100 p-2 dark:bg-stone-800">
                <p className="text-xl font-bold tabular-nums">{x.n}</p>
                <p className="text-xs text-stone-500">{x.label}</p>
                {x.hint && <p className="text-[10px] text-stone-400">{x.hint}</p>}
              </div>
            ))}
          </div>
          {preview.noMeaning.length > 0 && (
            <p className="text-sm text-amber-600">
              {preview.noMeaning.length} 个词没有释义（文件里没写，词典里也查不到），学的时候只能听音和拼写：
              {preview.noMeaning.slice(0, 8).join('、')}
              {preview.noMeaning.length > 8 && ' …'}
            </p>
          )}
          {preview.parsed.skipped.length > 0 && (
            <p className="text-sm text-stone-500">
              跳过 {preview.parsed.skipped.length} 行：
              {preview.parsed.skipped
                .slice(0, 3)
                .map((s) => `第 ${s.line} 行${s.reason}`)
                .join('；')}
            </p>
          )}
          <ul className="divide-y divide-stone-100 text-sm dark:divide-stone-800">
            {preview.words.slice(0, 5).map((w) => (
              <li key={w.id} className="flex gap-2 py-1.5">
                <span className="font-semibold">{w.word}</span>
                <span className="truncate text-stone-500">{w.meanings.map((m) => m.cn).join('；') || '（无释义）'}</span>
              </li>
            ))}
            {preview.words.length > 5 && <li className="py-1.5 text-stone-400">… 共 {preview.words.length} 个</li>}
          </ul>
          <div className="flex items-center justify-between">
            <span>设为当前词书</span>
            <Toggle label="设为当前词书" checked={makeCurrent} onChange={setMakeCurrent} />
          </div>
          <PrimaryButton disabled={busy} onClick={save}>
            保存词书（{preview.words.length} 个词）
          </PrimaryButton>
        </Card>
      )}

      <section className="mt-6 px-1 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
        <h2 className="mb-1 font-semibold text-stone-600 dark:text-stone-300">文件格式</h2>
        <p>
          <b>CSV</b>（Excel / WPS 另存为 CSV，或纯文本一行一个词）：第一行可以是表头，认识"单词、释义、音标、词性、例句、例句翻译"及英文写法。没有表头时按
          单词、释义、音标、例句、例句翻译 的顺序。只写单词也行，会自动从词典补全。
        </p>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-white p-3 text-xs dark:bg-stone-900">{SAMPLE}</pre>
        <p className="mt-2">
          <b>JSON</b>：单词数组 <code>["apple","banana"]</code>，或对象数组 <code>{'[{"word":"apple","meaning":"苹果"}]'}</code>。
        </p>
        <p className="mt-2">词库里已经有的词会直接用词库的完整数据（例句、短语），学习记录和其他词书共享。</p>
      </section>
    </div>
  )
}
