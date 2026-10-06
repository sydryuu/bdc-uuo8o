import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { requestPersist } from './lib/feedback'
import { initSettings } from './lib/settings'
import './index.css'

// 有新版本时自动更新（下次打开生效）
registerSW({ immediate: true })

async function boot() {
  await Promise.all([initSettings(), requestPersist()])
  createRoot(document.getElementById('root')!).render(<App />)
}

boot()
