// 错题练习队列：不经过 FSRS。答对移出队列；答错隔几题再出，直到答对
import type { SessionItem } from './session'

export interface Practice {
  queue: SessionItem[]
  total: number
  /** 本轮已经答对移出的数量 */
  cleared: number
}

/** 答错后插回队列的位置：隔 3 题再出（队列不够长就放最后） */
export const RETRY_GAP = 3

export const createPractice = (items: SessionItem[]): Practice => ({ queue: items, total: items.length, cleared: 0 })

export const currentPractice = (p: Practice): SessionItem | null => p.queue[0] ?? null

export function answerPractice(p: Practice, correct: boolean): Practice {
  const [head, ...rest] = p.queue
  if (!head) return p
  if (correct) return { ...p, queue: rest, cleared: p.cleared + 1 }
  const again = { ...head, encounters: head.encounters + 1 }
  const at = Math.min(RETRY_GAP, rest.length)
  return { ...p, queue: [...rest.slice(0, at), again, ...rest.slice(at)] }
}
