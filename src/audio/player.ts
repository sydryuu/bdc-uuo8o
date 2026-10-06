// 发音：有道接口优先，失败或超时降级到浏览器自带朗读（speechSynthesis）
// 有道接口不带 CORS 头，只能用 <audio> 播放；Service Worker 会把播放过的音频缓存起来（见 vite.config.ts）
import type { Accent } from '../lib/settings'

const TIMEOUT_MS = 2500
// 44 字节的静音 wav，用来在用户点击时"解锁" iOS 的音频播放
const SILENT =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

let el: HTMLAudioElement | null = null
const audio = () => (el ??= new Audio())

export const youdaoUrl = (text: string, accent: Accent) =>
  `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${accent === 'uk' ? 1 : 2}`

/** 必须在一次点击事件里调用：iOS 要求音频首次播放由用户手势触发 */
export function unlockAudio() {
  const a = audio()
  a.src = SILENT
  a.play().catch(() => {})
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''))
}

let seq = 0

export async function speak(text: string, accent: Accent): Promise<'youdao' | 'tts' | 'none'> {
  const id = ++seq
  const a = audio()
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  try {
    await playUrl(a, youdaoUrl(text, accent))
    return 'youdao'
  } catch {
    if (id !== seq) return 'none' // 已经有新的播放请求，别再朗读旧的
    return tts(text, accent) ? 'tts' : 'none'
  }
}

function playUrl(a: HTMLAudioElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      a.removeEventListener('playing', onOk)
      a.removeEventListener('error', onErr)
    }
    const onOk = () => (cleanup(), resolve())
    const onErr = () => (cleanup(), reject(new Error('audio error')))
    const timer = setTimeout(() => (cleanup(), a.pause(), reject(new Error('timeout'))), TIMEOUT_MS)
    a.addEventListener('playing', onOk)
    a.addEventListener('error', onErr)
    a.src = url
    a.play().catch(onErr)
  })
}

function tts(text: string, accent: Accent): boolean {
  if (!('speechSynthesis' in window)) return false
  const lang = accent === 'uk' ? 'en-GB' : 'en-US'
  const voices = speechSynthesis.getVoices()
  const voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith('en'))
  if (!voice && voices.length) return false // 有语音列表但没有英文（部分国产安卓浏览器）
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang
  if (voice) u.voice = voice
  u.rate = 0.9
  speechSynthesis.speak(u)
  return true
}
