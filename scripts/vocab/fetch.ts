// 下载原始数据到 data/raw/。已存在的文件跳过（加 --force 重新下载）。
// 用 curl 下载，自动走 HTTPS_PROXY 环境变量里的代理。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BOOKS, ECDICT_URL, kbUrl } from './config.ts'

const RAW_DIR = join(import.meta.dirname, '../../data/raw')
const force = process.argv.includes('--force')

function download(url: string, file: string) {
  const dest = join(RAW_DIR, file)
  if (!force && existsSync(dest) && statSync(dest).size > 0) {
    console.log(`跳过（已存在）${file}`)
    return
  }
  console.log(`下载 ${file}\n  ${url}`)
  const tmp = dest + '.part'
  execFileSync('curl', ['-fL', '--retry', '3', '--progress-bar', '-o', tmp, url], { stdio: 'inherit' })
  renameSync(tmp, dest)
}

mkdirSync(RAW_DIR, { recursive: true })
for (const file of new Set(BOOKS.map((b) => b.kbFile))) download(kbUrl(file), `kb-${file}.jsonl`)
download(ECDICT_URL, 'ecdict.csv')
console.log('完成')
