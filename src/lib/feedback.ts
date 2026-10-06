import { getSettings } from './settings'

/** 震动反馈。iPhone 的 Safari 不支持 navigator.vibrate，调用会被忽略 */
export function vibrate(pattern: number | number[]) {
  if (!getSettings().vibrate) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* 不支持就算了 */
  }
}

export const vibrateCorrect = () => vibrate(15)
export const vibrateWrong = () => vibrate([30, 50, 30])

let persisted: boolean | null = null

/** 申请持久化存储，防止浏览器在空间紧张时清掉学习记录 */
export async function requestPersist(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null
    persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist())
  } catch {
    persisted = null
  }
  return persisted
}

export const isPersisted = () => persisted
