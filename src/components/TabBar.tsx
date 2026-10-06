import { navigate, tabOf, type Route } from '../lib/router'
import { BookIcon, ChartIcon, HomeIcon, UserIcon } from './icons'

const TABS: { route: Route; label: string; Icon: typeof HomeIcon }[] = [
  { route: 'today', label: '今日', Icon: HomeIcon },
  { route: 'books', label: '词书', Icon: BookIcon },
  { route: 'stats', label: '统计', Icon: ChartIcon },
  { route: 'me', label: '我的', Icon: UserIcon },
]

export function TabBar({ current }: { current: Route }) {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
      <div className="mx-auto flex max-w-lg">
        {TABS.map(({ route, label, Icon }) => (
          <button
            key={route}
            type="button"
            onClick={() => navigate(route, { replace: true })}
            className={`flex flex-1 flex-col items-center gap-0.5 pt-2 text-xs font-medium ${
              tabOf(current) === route ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400'
            }`}
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>
    </nav>
  )
}
