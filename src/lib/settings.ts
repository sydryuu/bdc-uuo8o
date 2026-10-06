import { useEffect, useState } from 'react'
import { db } from '../db/db'

export type Accent = 'uk' | 'us'
export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  dailyNew: number
  accent: Accent
  autoPlay: boolean
  theme: Theme
  vibrate: boolean
  currentBookId: string
}

export const DEFAULT_SETTINGS: Settings = {
  dailyNew: 10,
  accent: 'us',
  autoPlay: true,
  theme: 'system',
  vibrate: true,
  currentBookId: 'pep-3a',
}

const KEY = 'settings'
let cache: Settings = DEFAULT_SETTINGS
const listeners = new Set<(s: Settings) => void>()

export async function initSettings(): Promise<Settings> {
  const row = await db.kv.get(KEY)
  cache = { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) }
  listeners.forEach((l) => l(cache))
  return cache
}

export const getSettings = () => cache

export async function updateSettings(patch: Partial<Settings>) {
  cache = { ...cache, ...patch }
  listeners.forEach((l) => l(cache))
  await db.kv.put({ key: KEY, value: cache })
}

export function useSettings(): Settings {
  const [s, set] = useState(cache)
  useEffect(() => {
    listeners.add(set)
    set(cache)
    return () => void listeners.delete(set)
  }, [])
  return s
}
