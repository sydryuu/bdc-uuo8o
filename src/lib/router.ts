// 极简 hash 路由：#/页面 或 #/word/单词
import { useSyncExternalStore } from 'react'

export type Route =
  | 'today'
  | 'study'
  | 'practice'
  | 'books'
  | 'stats'
  | 'me'
  | 'mistakes'
  | 'settings'
  | 'search'
  | 'favorites'
  | 'word'
  | 'import'
  | 'data'

const ROUTES: Route[] = ['today', 'study', 'practice', 'books', 'stats', 'me', 'mistakes', 'settings', 'search', 'favorites', 'word', 'import', 'data']

const parts = () => location.hash.replace(/^#\/?/, '').split('/')

const parse = (): Route => {
  const h = parts()[0] as Route
  return ROUTES.includes(h) ? h : 'today'
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export const useRoute = () => useSyncExternalStore(subscribe, parse)

/** 路由参数，例如 #/word/apple 里的 apple */
export const useRouteParam = () => useSyncExternalStore(subscribe, () => decodeURIComponent(parts().slice(1).join('/')))

export function navigate(r: Route, opts: { replace?: boolean; param?: string } = {}) {
  const hash = r === 'today' ? '#/' : `#/${r}${opts.param ? `/${encodeURIComponent(opts.param)}` : ''}`
  if (opts.replace) location.replace(hash)
  else location.hash = hash
}

export const openWord = (id: string) => navigate('word', { param: id })

/** 底部标签对应的分组 */
export const tabOf = (r: Route): Route =>
  r === 'mistakes' || r === 'settings' || r === 'favorites' || r === 'import' || r === 'data' || r === 'search' || r === 'word' ? 'me' : r
