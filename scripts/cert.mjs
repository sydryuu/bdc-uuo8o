// 生成局域网 HTTPS 证书（用 mkcert），让手机能注册 Service Worker、安装 PWA。
// 用法：npm run cert   之后：npm run lan
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { networkInterfaces } from 'node:os'

const has = (cmd) => {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

if (!has('mkcert')) {
  console.error('没有找到 mkcert。先安装：brew install mkcert')
  process.exit(1)
}

const ips = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i.address)

mkdirSync('certs', { recursive: true })
execFileSync('mkcert', ['-install'], { stdio: 'inherit' })
execFileSync('mkcert', ['-cert-file', 'certs/dev.pem', '-key-file', 'certs/dev-key.pem', 'localhost', '127.0.0.1', ...ips], {
  stdio: 'inherit',
})
const caroot = execFileSync('mkcert', ['-CAROOT']).toString().trim()

console.log(`
证书已生成：certs/dev.pem（包含 ${['localhost', ...ips].join(', ')}）

接下来让手机信任这个证书（只需做一次）：
  根证书文件：${caroot}/rootCA.pem
  iPhone：用隔空投送把 rootCA.pem 发到手机 → 设置 → 已下载描述文件 → 安装
          → 设置 → 通用 → 关于本机 → 证书信任设置 → 打开 mkcert 那一项
  安卓：  把 rootCA.pem 发到手机 → 设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书

然后运行 npm run lan，手机浏览器打开：
${ips.map((ip) => `  https://${ip}:4173`).join('\n')}
`)
