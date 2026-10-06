import { useEffect } from 'react'
import { TabBar } from './components/TabBar'
import { useRoute } from './lib/router'
import { useSettings } from './lib/settings'
import { BooksPage } from './pages/BooksPage'
import { DataPage } from './pages/DataPage'
import { FavoritesPage } from './pages/FavoritesPage'
import { ImportPage } from './pages/ImportPage'
import { SearchPage } from './pages/SearchPage'
import { WordPage } from './pages/WordPage'
import { MePage } from './pages/MePage'
import { MistakesPage } from './pages/MistakesPage'
import { StatsPage } from './pages/StatsPage'
import { SettingsPage } from './pages/SettingsPage'
import { StudyPage } from './pages/StudyPage'
import { TodayPage } from './pages/TodayPage'

function useTheme() {
  const { theme } = useSettings()
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101214' : '#f6f7f5')
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

export function App() {
  const route = useRoute()
  useTheme()
  if (route === 'study') return <StudyPage key="today" mode="today" />
  if (route === 'practice') return <StudyPage key="practice" mode="practice" />
  return (
    <>
      {route === 'today' && <TodayPage />}
      {route === 'books' && <BooksPage />}
      {route === 'stats' && <StatsPage />}
      {route === 'me' && <MePage />}
      {route === 'mistakes' && <MistakesPage />}
      {route === 'settings' && <SettingsPage />}
      {route === 'search' && <SearchPage />}
      {route === 'favorites' && <FavoritesPage />}
      {route === 'word' && <WordPage />}
      {route === 'import' && <ImportPage />}
      {route === 'data' && <DataPage />}
      <TabBar current={route} />
    </>
  )
}
