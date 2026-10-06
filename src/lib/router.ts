// 极简 hash 路由：#/ 今日、#/study 学习、#/books 词书、#/settings 设置
import { useSyncExternalStore } from 'react'

export type Route = 'today' | 'study' | 'books' | 'settings'

const parse = (): Route => {
  const h = location.hash.replace(/^#\/?/, '')
  return h === 'study' || h === 'books' || h === 'settings' ? h : 'today'
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export const useRoute = () => useSyncExternalStore(subscribe, parse)

export function navigate(r: Route, opts: { replace?: boolean } = {}) {
  const hash = r === 'today' ? '#/' : `#/${r}`
  if (opts.replace) location.replace(hash)
  else location.hash = hash
}
