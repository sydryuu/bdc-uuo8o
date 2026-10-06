// 极简 hash 路由
import { useSyncExternalStore } from 'react'

export type Route = 'today' | 'study' | 'practice' | 'books' | 'stats' | 'me' | 'mistakes' | 'settings'

const ROUTES: Route[] = ['today', 'study', 'practice', 'books', 'stats', 'me', 'mistakes', 'settings']

const parse = (): Route => {
  const h = location.hash.replace(/^#\/?/, '') as Route
  return ROUTES.includes(h) ? h : 'today'
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

/** 底部标签对应的分组：错题本、设置都属于"我的" */
export const tabOf = (r: Route): Route => (r === 'mistakes' || r === 'settings' ? 'me' : r)
