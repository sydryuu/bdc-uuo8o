// 统计图表：纯 SVG/HTML，点按（手机）或悬停（电脑）显示数值
import { useState } from 'react'
import { heatLevel, type HeatCell } from '../srs/stats'

/** 系列配色（已用 dataviz 校验脚本验证：浅色、深色背景下色盲区分度和对比度都通过） */
export const SERIES = {
  fresh: { color: '#0284c7', name: '新学' },
  review: { color: '#059669', name: '复习' },
}

export interface BarDatum {
  label: string
  /** 提示里显示的完整标签 */
  title: string
  segments: { value: number; color: string; name: string }[]
}

export function Legend({ items }: { items: { color: string; name: string }[] }) {
  return (
    <div className="flex gap-4 text-xs text-stone-500 dark:text-stone-400">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.name}
        </span>
      ))}
    </div>
  )
}

/** 堆叠柱状图：段之间 2px 间隙，顶部 4px 圆角，从基线长出 */
export function BarChart({ data, height = 120, labelEvery = 1 }: { data: BarDatum[]; height?: number; labelEvery?: number }) {
  const [sel, setSel] = useState<number | null>(null)
  const totals = data.map((d) => d.segments.reduce((s, x) => s + x.value, 0))
  const max = Math.max(1, ...totals)
  const active = sel ?? null
  const GAP = 2

  return (
    <div>
      <div className="h-5 text-xs text-stone-500 dark:text-stone-400" aria-live="polite">
        {active !== null ? (
          <span>
            <span className="font-semibold text-stone-700 dark:text-stone-200">{data[active].title}</span>
            {data[active].segments.map((s) => (
              <span key={s.name} className="ml-2">
                {s.name} <span className="font-semibold tabular-nums text-stone-700 dark:text-stone-200">{s.value}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-stone-400">点柱子看数字</span>
        )}
      </div>
      <div className="relative mt-1" style={{ height }}>
        {/* 最大值刻度线 */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-stone-200 dark:border-stone-700" />
        <span className="absolute -top-2 right-0 bg-white pl-1 text-[10px] tabular-nums text-stone-400 dark:bg-stone-900">{max}</span>
        <div className="absolute inset-0 flex items-end gap-[3px] border-b border-stone-300 dark:border-stone-600">
          {data.map((d, i) => {
            const nonZero = d.segments.filter((s) => s.value > 0)
            return (
              <button
                key={i}
                type="button"
                aria-label={`${d.title}：${d.segments.map((s) => `${s.name}${s.value}`).join('，')}`}
                onClick={() => setSel(sel === i ? null : i)}
                onMouseEnter={() => setSel(i)}
                className="flex h-full flex-1 flex-col-reverse items-stretch"
                style={{ opacity: active === null || active === i ? 1 : 0.45 }}
              >
                {nonZero.map((s, j) => (
                  <div
                    key={s.name}
                    style={{
                      height: Math.max(2, (s.value / max) * height - (j > 0 ? GAP : 0)),
                      marginTop: j < nonZero.length - 1 ? GAP : 0,
                      background: s.color,
                      borderRadius: j === nonZero.length - 1 ? '4px 4px 0 0' : 0,
                    }}
                  />
                ))}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-[3px] text-[10px] text-stone-400">
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center tabular-nums">
            {i % labelEvery === 0 || i === data.length - 1 ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

const HEAT_LIGHT = ['#e7e5e4', '#a7f3d0', '#34d399', '#059669', '#065f46']
const HEAT_DARK = ['#292524', '#064e3b', '#047857', '#10b981', '#6ee7b7']

/** 学习日历热力图：列 = 周（周一在上），单元格 = 当天答题数 */
export function Heatmap({ cols, dark }: { cols: HeatCell[][]; dark: boolean }) {
  const [sel, setSel] = useState<HeatCell | null>(null)
  const ramp = dark ? HEAT_DARK : HEAT_LIGHT
  const CELL = 15
  const GAP = 3
  // 月份标签：每列第一天换月时显示
  const months = cols.map((c, i) => {
    const m = Number(c[0].day.slice(5, 7))
    const prev = i > 0 ? Number(cols[i - 1][0].day.slice(5, 7)) : -1
    return m !== prev ? `${m}月` : ''
  })
  return (
    <div>
      <div className="flex">
        <div className="mr-1 flex flex-col text-[10px] text-stone-400" style={{ gap: GAP, paddingTop: 14 }}>
          {['一', '', '三', '', '五', '', '日'].map((d, i) => (
            <span key={i} style={{ height: CELL, lineHeight: `${CELL}px` }}>
              {d}
            </span>
          ))}
        </div>
        <div className="overflow-hidden">
          <div className="flex text-[10px] text-stone-400" style={{ gap: GAP, height: 14 }}>
            {months.map((m, i) => (
              <span key={i} style={{ width: CELL }} className="whitespace-nowrap">
                {m}
              </span>
            ))}
          </div>
          <div className="flex" style={{ gap: GAP }}>
            {cols.map((col, i) => (
              <div key={i} className="flex flex-col" style={{ gap: GAP }}>
                {col.map((cell) => (
                  <button
                    key={cell.day}
                    type="button"
                    disabled={cell.future}
                    aria-label={`${cell.day} 答题 ${cell.count} 次`}
                    onClick={() => setSel(cell)}
                    className="rounded-[3px] disabled:opacity-0"
                    style={{
                      width: CELL,
                      height: CELL,
                      background: ramp[heatLevel(cell.count)],
                      outline: sel?.day === cell.day ? `2px solid ${dark ? '#e7e5e4' : '#44403c'}` : undefined,
                      outlineOffset: 1,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
        <span>{sel ? `${Number(sel.day.slice(5, 7))}月${Number(sel.day.slice(8))}日：答题 ${sel.count} 次` : '点格子看当天'}</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-stone-400">
          少
          {ramp.map((c) => (
            <span key={c} className="inline-block size-2.5 rounded-[2px]" style={{ background: c }} />
          ))}
          多
        </span>
      </div>
    </div>
  )
}
