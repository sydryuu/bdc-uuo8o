import type { ReactNode } from 'react'

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-13 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-stone-300 dark:bg-stone-600'}`}
    >
      <span className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-xl bg-stone-200/70 p-1 dark:bg-stone-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-9 rounded-lg px-3 text-sm font-medium transition ${
            value === o.value ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-600 dark:text-white' : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const btn = 'size-10 rounded-full bg-stone-200/70 text-xl font-semibold text-stone-700 disabled:opacity-30 dark:bg-stone-800 dark:text-stone-200'
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="减少" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <span className="w-8 text-center text-lg font-semibold tabular-nums">{value}</span>
      <button type="button" aria-label="增加" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm dark:bg-stone-900 ${className}`}>{children}</div>
}

export function PrimaryButton({ children, onClick, disabled, className = '' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-14 w-full rounded-2xl bg-emerald-500 px-6 text-lg font-bold text-white shadow-[0_4px_0_#059669] transition active:translate-y-1 active:shadow-none disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  )
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-3 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800 ${className}`}>
      <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  )
}

/** 环形进度（多邻国式的每日目标环） */
export function Ring({ value, size = 96, stroke = 10, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.min(1, Math.max(0, value))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-stone-200 dark:stroke-stone-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className="stroke-emerald-500 transition-[stroke-dashoffset] duration-500"
          style={{ opacity: v > 0 ? 1 : 0 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

/** 子页面顶部：返回按钮 + 标题 */
export function SubHeader({ title, back, backLabel }: { title: string; back: () => void; backLabel: string }) {
  return (
    <header className="safe-top pb-2">
      <button type="button" onClick={back} className="-ml-2 flex min-h-11 items-center pr-3 text-emerald-600 dark:text-emerald-400">
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 6-6 6 6 6" />
        </svg>
        {backLabel}
      </button>
      <h1 className="mt-1 text-2xl font-bold">{title}</h1>
    </header>
  )
}
