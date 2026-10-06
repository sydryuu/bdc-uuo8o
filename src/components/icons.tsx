// 内联 SVG 图标，不依赖任何外部图标库
type P = { className?: string }
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const SpeakerIcon = ({ className = 'size-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M11 5 6 9H3v6h3l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
)

export const CloseIcon = ({ className = 'size-6' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const HomeIcon = ({ className = 'size-6' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </svg>
)

export const BookIcon = ({ className = 'size-6' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z" />
    <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3" />
  </svg>
)

export const GearIcon = ({ className = 'size-6' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
)

export const CheckIcon = ({ className = 'size-6' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} strokeWidth={2.5} aria-hidden>
    <path d="M5 12.5 10 17.5 19 7" />
  </svg>
)

export const ChartIcon = ({ className = 'size-6' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
)

export const UserIcon = ({ className = 'size-6' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
)

export const FlameIcon = ({ className = 'size-6' }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
    <path d="M12 2c.6 3.2-1 5.1-2.6 6.9C7.8 10.7 6 12.6 6 15.5A6 6 0 0 0 12 21.5a6 6 0 0 0 6-6c0-2.4-1-4.2-2.2-5.6-.3 1.3-1 2.3-2 2.8.4-3.7-.5-7.6-1.8-10.7z" />
  </svg>
)

export const ChevronIcon = ({ className = 'size-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const BackIcon = ({ className = 'size-6' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="m15 6-6 6 6 6" />
  </svg>
)

export const PlusIcon = ({ className = 'size-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const BulbIcon = ({ className = 'size-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.5.4.9 1 .9 1.6V16h5.2v-.5c0-.6.4-1.2.9-1.6A6 6 0 0 0 12 3z" />
  </svg>
)

export const StarIcon = ({ className = 'size-6', filled = false }: P & { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" className={className} {...base} fill={filled ? 'currentColor' : 'none'} aria-hidden>
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
  </svg>
)

export const SearchIcon = ({ className = 'size-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)
