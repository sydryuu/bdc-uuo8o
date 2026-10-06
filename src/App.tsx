import { useEffect } from 'react'
import { TabBar } from './components/TabBar'
import { useRoute } from './lib/router'
import { useSettings } from './lib/settings'
import { BooksPage } from './pages/BooksPage'
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
  if (route === 'study') return <StudyPage />
  return (
    <>
      {route === 'today' && <TodayPage />}
      {route === 'books' && <BooksPage />}
      {route === 'settings' && <SettingsPage />}
      <TabBar current={route} />
    </>
  )
}
