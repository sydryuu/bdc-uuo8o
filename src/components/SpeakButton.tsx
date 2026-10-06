import { useState } from 'react'
import { speak } from '../audio/player'
import { useSettings, type Accent } from '../lib/settings'
import { SpeakerIcon } from './icons'

export function SpeakButton({ text, accent, className = '', label }: { text: string; accent?: Accent; className?: string; label?: string }) {
  const s = useSettings()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      aria-label={label ?? `朗读 ${text}`}
      onClick={(e) => {
        e.stopPropagation()
        setBusy(true)
        speak(text, accent ?? s.accent).finally(() => setTimeout(() => setBusy(false), 400))
      }}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full text-emerald-600 active:bg-emerald-50 dark:text-emerald-400 dark:active:bg-emerald-950 ${busy ? 'opacity-60' : ''} ${className}`}
    >
      <SpeakerIcon />
    </button>
  )
}
