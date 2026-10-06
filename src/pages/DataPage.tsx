import { useState } from 'react'
import { Card, PrimaryButton, Segmented, SubHeader } from '../components/ui'
import { exportBackup, importBackup, LAST_BACKUP_KEY, type ImportSummary } from '../db/backupDb'
import { db } from '../db/db'
import { validateBackup, type Backup } from '../lib/backup'
import { isPersisted } from '../lib/feedback'
import { navigate } from '../lib/router'
import { updateSettings, useSettings } from '../lib/settings'
import { useLive } from '../lib/useLive'

const fmt = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function DataPage() {
  const s = useSettings()
  const last = useLive(async () => (await db.kv.get(LAST_BACKUP_KEY))?.value as number | undefined, [])
  const counts = useLive(async () => ({ cards: await db.cards.count(), logs: await db.reviewLogs.count() }), [])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, setPending] = useState<Backup | null>(null)
  const [busy, setBusy] = useState(false)
  const persisted = isPersisted()

  const doExport = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await exportBackup()
      if (r !== 'cancelled') setMsg({ ok: true, text: r === 'shared' ? '已打开分享，存到"文件"或发给自己就行' : '备份文件已下载' })
    } catch (e) {
      setMsg({ ok: false, text: `导出失败：${(e as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (f: File) => {
    setMsg(null)
    try {
      setPending(validateBackup(JSON.parse(await f.text())))
    } catch (e) {
      setPending(null)
      setMsg({ ok: false, text: e instanceof SyntaxError ? '文件不是有效的 JSON' : (e as Error).message })
    }
  }

  const doImport = async (mode: 'merge' | 'overwrite') => {
    if (!pending) return
    if (mode === 'overwrite' && !confirm('覆盖会用备份替换现在所有的学习记录，现在的记录会丢失。确定吗？')) return
    setBusy(true)
    try {
      const r: ImportSummary = await importBackup(pending, mode)
      setMsg({ ok: true, text: `${mode === 'merge' ? '已合并' : '已恢复'}：${r.cards} 个词的学习记录、${r.days} 天打卡、${r.mistakes} 条错题、${r.favorites} 个生词` })
      setPending(null)
    } catch (e) {
      setMsg({ ok: false, text: `导入失败：${(e as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <SubHeader title="数据与备份" back={() => navigate('me', { replace: true })} backLabel="我的" />
      <p className="mt-1 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
        学习记录只存在这台手机的浏览器里。换手机、清理浏览器数据、删掉主屏幕图标都可能丢失，记得定期备份。
      </p>

      {msg && <Card className={`mt-3 text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>{msg.text}</Card>}

      <Card className="mt-3">
        <h2 className="font-semibold">导出备份</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          {last ? `上次备份：${fmt(last)}` : '还没有备份过'}
          {counts && ` · 现有 ${counts.cards} 个词的记录`}
        </p>
        <PrimaryButton className="mt-3" disabled={busy} onClick={doExport}>
          导出备份文件
        </PrimaryButton>
      </Card>

      <Card className="mt-3">
        <h2 className="font-semibold">从备份恢复</h2>
        {!pending ? (
          <label className="mt-3 flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 font-semibold text-emerald-600 active:bg-stone-50 dark:border-stone-600 dark:text-emerald-400 dark:active:bg-stone-800">
            选择备份文件
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
                e.target.value = ''
              }}
            />
          </label>
        ) : (
          <div className="mt-2 text-sm">
            <p className="text-stone-600 dark:text-stone-300">
              备份时间：{fmt(Date.parse(pending.exportedAt))}
              <br />
              {pending.tables.cards.length} 个词的学习记录 · {pending.tables.daily.length} 天 · {pending.tables.favorites.length} 个生词
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => doImport('merge')}
                className="min-h-14 rounded-2xl bg-emerald-500 font-bold text-white shadow-[0_4px_0_#059669] active:translate-y-1 active:shadow-none"
              >
                合并
                <span className="block text-[10px] font-normal opacity-90">两边都保留，取较新的</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => doImport('overwrite')}
                className="min-h-14 rounded-2xl border-2 border-rose-300 font-bold text-rose-600 active:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:active:bg-rose-950"
              >
                覆盖
                <span className="block text-[10px] font-normal opacity-80">用备份替换现在的</span>
              </button>
            </div>
            <button type="button" onClick={() => setPending(null)} className="mt-2 w-full py-2 text-stone-400">
              取消
            </button>
          </div>
        )}
      </Card>

      <Card className="mt-3">
        <h2 className="font-semibold">备份提醒</h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">超过这么多天没备份，首页会提醒你</p>
        <div className="mt-3">
          <Segmented<string>
            value={String(s.backupDays)}
            options={[
              { value: '3', label: '3天' },
              { value: '7', label: '7天' },
              { value: '14', label: '14天' },
              { value: '30', label: '30天' },
              { value: '0', label: '不提醒' },
            ]}
            onChange={(v) => updateSettings({ backupDays: Number(v) })}
          />
        </div>
      </Card>

      <Card className="mt-3 text-sm">
        <h2 className="font-semibold">存储状态</h2>
        <p className="mt-1 text-stone-500 dark:text-stone-400">
          {persisted
            ? '已开启持久化存储，浏览器空间紧张时也不会自动清理。'
            : persisted === false
              ? '浏览器没有给持久化权限。添加到主屏幕后更安全；仍建议定期备份。'
              : '这个浏览器不支持查询存储状态。'}
        </p>
      </Card>
    </div>
  )
}
