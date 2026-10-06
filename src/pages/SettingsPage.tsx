import type { ReactNode } from 'react'
import { speak } from '../audio/player'
import { Segmented, Stepper, SubHeader, Toggle } from '../components/ui'
import { navigate } from '../lib/router'
import { updateSettings, useSettings, type Accent, type Theme } from '../lib/settings'

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3">
      <div>
        <p className="font-medium">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-stone-400">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-sm font-semibold text-stone-400">{title}</h2>
      <div className="divide-y divide-stone-100 rounded-2xl bg-white shadow-sm dark:divide-stone-800 dark:bg-stone-900">{children}</div>
    </section>
  )
}

const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)

export function SettingsPage() {
  const s = useSettings()
  return (
    <div className="mx-auto max-w-lg px-4 pb-28">
      <SubHeader title="设置" back={() => navigate('me', { replace: true })} backLabel="我的" />

      <Group title="学习">
        <Row title="每日新词" hint="初学者建议 5–10 个">
          <Stepper value={s.dailyNew} min={5} max={50} step={5} onChange={(v) => updateSettings({ dailyNew: v })} />
        </Row>
      </Group>

      <Group title="发音">
        <Row title="口音">
          <Segmented<Accent>
            value={s.accent}
            options={[
              { value: 'us', label: '美音' },
              { value: 'uk', label: '英音' },
            ]}
            onChange={(v) => {
              updateSettings({ accent: v })
              speak('hello', v)
            }}
          />
        </Row>
        <Row title="新词自动发音" hint="出现新单词时自动读一遍">
          <Toggle label="新词自动发音" checked={s.autoPlay} onChange={(v) => updateSettings({ autoPlay: v })} />
        </Row>
      </Group>

      <Group title="外观与反馈">
        <Row title="深色模式">
          <Segmented<Theme>
            value={s.theme}
            options={[
              { value: 'system', label: '跟随系统' },
              { value: 'light', label: '浅色' },
              { value: 'dark', label: '深色' },
            ]}
            onChange={(v) => updateSettings({ theme: v })}
          />
        </Row>
        <Row title="震动反馈" hint={isIOS ? 'iPhone 浏览器不支持网页震动' : '答对答错时轻微震动'}>
          <Toggle label="震动反馈" checked={s.vibrate} onChange={(v) => updateSettings({ vibrate: v })} />
        </Row>
      </Group>


      <section className="mt-8 space-y-1 px-1 text-xs leading-relaxed text-stone-400">
        <p>词库：KyleBing/english-vocabulary（BSD-3）、ECDICT（MIT）</p>
        <p>发音：有道词典；无法联网时使用系统朗读</p>
        <p>调度：FSRS（ts-fsrs）</p>
        <p>仅供个人学习使用 · v{__APP_VERSION__}</p>
      </section>
    </div>
  )
}
