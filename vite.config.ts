/// <reference types="vitest/config" />
import { existsSync, readFileSync } from 'node:fs'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// 局域网真机测试用 HTTPS：有 mkcert 证书（certs/）就用它（手机信任后 Service Worker 才能注册），
// 没有就用自签证书（能打开页面，但 iOS 不会注册 Service Worker）
const CERT = 'certs/dev.pem'
const KEY = 'certs/dev-key.pem'
const mkcert = existsSync(CERT) && existsSync(KEY) ? { cert: readFileSync(CERT), key: readFileSync(KEY) } : undefined

export default defineConfig(({ mode }) => {
  const lan = mode === 'lan'
  const https = lan ? mkcert : undefined
  return {
    base: process.env.BASE_PATH ?? '/',
    define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
    plugins: [
      react(),
      tailwindcss(),
      lan && !mkcert && basicSsl(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['icons/*.png'],
        manifest: {
          name: '背单词',
          short_name: '背单词',
          description: '间隔重复背单词',
          lang: 'zh-CN',
          start_url: '.',
          scope: '.',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f6f7f5',
          theme_color: '#10b981',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // 小学词书随应用预缓存（约 400KB）；初高中、四六级选中时才下载（存进 IndexedDB 后离线可用）
          globPatterns: ['**/*.{js,css,html,png,svg}', 'books/index.json', 'books/pep-[3456][ab].json'],
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              // 常用词典分片：查过的字母离线也能查
              urlPattern: ({ url }) => url.pathname.includes('/dict/') && url.pathname.endsWith('.json'),
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'dict', expiration: { maxEntries: 40 } },
            },
            {
              // 有道发音：播放过的音频缓存起来，离线也能放。接口不带 CORS 头，只能存成不透明响应（status 0）
              urlPattern: ({ url }) => url.hostname === 'dict.youdao.com' && url.pathname === '/dictvoice',
              handler: 'CacheFirst',
              options: {
                cacheName: 'voice',
                cacheableResponse: { statuses: [0, 200] },
                expiration: { maxEntries: 5000, purgeOnQuotaError: true },
              },
            },
          ],
        },
      }),
    ],
    server: { host: lan, https },
    preview: { host: lan, https },
    test: { environment: 'node', include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'] },
  }
})
