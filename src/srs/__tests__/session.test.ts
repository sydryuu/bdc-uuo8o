import { describe, expect, it } from 'vitest'
import { dayEnd } from '../../lib/date'
import { makeScheduler, rate, Rating, State } from '../scheduler'
import { applyGrade, createSession, pickNext, type Session, type SessionItem } from '../session'

const s = makeScheduler({ fuzz: false })
const T = new Date(2026, 9, 6, 10, 0, 0).getTime()
const MIN = 60_000

const fresh = (w: string): SessionItem => ({ cardId: `w:${w}`, wordId: w, bookId: 'b', card: null, encounters: 0 })
const review = (w: string): SessionItem => {
  const card = rate(null, Rating.Easy, T - 10 * 86_400_000, s).card
  card.due = new Date(T - MIN) // 已到期
  return { cardId: `w:${w}`, wordId: w, bookId: 'b', card, encounters: 0 }
}

/** 模拟一整天：每次都选 grade，返回出卡顺序 */
function run(session: Session, grade: (it: SessionItem) => Rating.Again | Rating.Good, start = T, stepMs = 20_000) {
  const order: string[] = []
  let now = start
  for (let i = 0; i < 200; i++) {
    const it = pickNext(session, now)
    if (!it) break
    order.push(it.wordId)
    session = applyGrade(session, it.cardId, grade(it), now, s).session
    now += stepMs
  }
  return { order, session }
}

describe('学习会话', () => {
  it('先复习，再学新词', () => {
    const sess = createSession({ reviews: [review('old')], news: [fresh('a')], dayEnd: dayEnd(T) })
    expect(pickNext(sess, T)!.wordId).toBe('old')
  })

  it('新词全部答对：每个词出现两次后毕业，会话结束', () => {
    const sess = createSession({ reviews: [], news: [fresh('a'), fresh('b'), fresh('c')], dayEnd: dayEnd(T) })
    const { order, session } = run(sess, () => Rating.Good)
    expect(order.slice(0, 3)).toEqual(['a', 'b', 'c'])
    expect(order.filter((w) => w === 'a')).toHaveLength(2)
    expect(order).toHaveLength(6)
    expect(session.items).toHaveLength(0)
  })

  it('答错的新词会一直回来，直到答对', () => {
    let wrongLeft = 3
    const sess = createSession({ reviews: [], news: [fresh('hard'), fresh('easy')], dayEnd: dayEnd(T) })
    const { order, session } = run(sess, (it) => (it.wordId === 'hard' && wrongLeft-- > 0 ? Rating.Again : Rating.Good))
    expect(order.filter((w) => w === 'hard')).toHaveLength(3 + 2)
    expect(session.items).toHaveLength(0)
  })

  it('短间隔卡没到时间时，优先出别的卡', () => {
    let sess = createSession({ reviews: [], news: [fresh('a'), fresh('b')], dayEnd: dayEnd(T) })
    sess = applyGrade(sess, 'w:a', Rating.Good, T, s).session // a 10 分钟后到期
    expect(pickNext(sess, T + MIN)!.wordId).toBe('b')
  })

  it('不连续出同一张卡（有别的可选时）', () => {
    let sess = createSession({ reviews: [], news: [fresh('a'), fresh('b')], dayEnd: dayEnd(T) })
    sess = applyGrade(sess, 'w:a', Rating.Again, T, s).session
    sess = applyGrade(sess, 'w:b', Rating.Again, T + 1000, s).session
    // 两张都没到期，上一张是 b，应该出 a
    expect(pickNext(sess, T + 2000)!.wordId).toBe('a')
  })

  it('复习卡答对后移出会话；答错进入重学留在会话', () => {
    let sess = createSession({ reviews: [review('x'), review('y')], news: [], dayEnd: dayEnd(T) })
    const r1 = applyGrade(sess, 'w:x', Rating.Good, T, s)
    expect(r1.graduated).toBe(true)
    sess = r1.session
    const r2 = applyGrade(sess, 'w:y', Rating.Again, T, s)
    expect(r2.graduated).toBe(false)
    expect(r2.session.items.map((i) => i.wordId)).toEqual(['y'])
    expect(r2.session.items[0].card!.state).toBe(State.Relearning)
  })

  it('wasNew 只在新词第一次评分时为 true', () => {
    let sess = createSession({ reviews: [], news: [fresh('a')], dayEnd: dayEnd(T) })
    const r1 = applyGrade(sess, 'w:a', Rating.Again, T, s)
    expect(r1.wasNew).toBe(true)
    expect(applyGrade(r1.session, 'w:a', Rating.Good, T + MIN, s).wasNew).toBe(false)
  })
})
