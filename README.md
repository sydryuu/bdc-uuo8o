# 背单词

手机优先的背单词 PWA，自己用。用 FSRS 间隔重复（和新版 Anki 是同一个算法），做题方式参考多邻国。没有后端，所有数据都存在手机本地。

- 技术栈：Vite + React + TypeScript + Tailwind v4 + vite-plugin-pwa + Dexie（IndexedDB）+ ts-fsrs
- 没有外部字体，也不用 Google 服务，国内网络下都能用
- 发音：有道词典接口；失败或离线时自动改用系统朗读

## 本地运行

需要 Node 20 或更高版本。依赖从 npmmirror 安装，已经写在 `.npmrc` 里。

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 单元测试：调度、出题、词库转换
npm run build        # 类型检查并打包到 dist/
```

## 在手机上测试

### 方式 A：只看界面（最快，没有离线功能）

```bash
npm run dev:lan
```

手机和电脑连同一个 Wi-Fi，手机浏览器打开终端里显示的 `https://192.168.x.x:5173`，遇到证书警告时选"继续访问"。

这种方式用的是自签名证书，**Service Worker 不会注册**：不能离线使用，"添加到主屏幕"后也只是一个书签。

### 方式 B：完整 PWA（可以离线、可以安装，推荐）

Service Worker 和 PWA 安装都要求页面运行在**安全上下文**里，也就是 `https://` 或者 `localhost`。手机用 `http://192.168.x.x` 访问不算安全上下文。所以要做一张手机信任的局域网证书：

```bash
brew install mkcert   # 只需一次
npm run cert          # 生成 certs/dev.pem，并打印让手机信任证书的步骤
npm run lan           # 打包，然后用 https 在 4173 端口启动
```

让手机信任根证书（只需一次）：
- **iPhone**：用隔空投送把 `rootCA.pem` 发到手机，然后：
  1. 设置 → 已下载描述文件 → 安装
  2. 设置 → 通用 → 关于本机 → 证书信任设置 → 打开 mkcert 那一项
- **安卓**：把 `rootCA.pem` 发到手机，然后：设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书

然后在手机上打开 `https://<电脑局域网IP>:4173`：
- iPhone 用 Safari 打开，点"分享"→"添加到主屏幕"
- 安卓用 Chrome 打开，点菜单→"安装应用"

> 安卓的临时办法：在 `chrome://flags` 里打开 `unsafely-treat-insecure-origin-as-secure`，填入 `http://192.168.x.x:5173`。这样不用证书也能注册 Service Worker，但只对 Chrome 有效。

## 部署（正式使用）

**当前线上地址**：https://sydryuu.github.io/bdc-uuo8o/（仓库 `sydryuu/bdc-uuo8o`，公开，页面设置了 noindex）

更新方法：改完代码后执行 `git push`。GitHub Actions 会自动跑测试、打包并部署（`.github/workflows/deploy.yml`），大约 1 分钟后生效。已经装到主屏幕的应用，下次打开时会自动更新。


这是一个纯静态站点，`npm run build` 生成的 `dist/` 放到任何支持 HTTPS 的静态托管上就能用。

**装到主屏幕以后，平时使用都走本地缓存**：服务器速度只影响第一次打开和版本更新。

| 方案 | 要不要备案 | 费用 | 国内速度 | 说明 |
|---|---|---|---|---|
| GitHub Pages | 不需要 | 免费 | 时快时慢，偶尔打不开 | 设置 `BASE_PATH=/仓库名/ npm run build`。免费版仓库必须是公开的 |
| 香港或海外轻量服务器 + 自己的域名 | 不需要 | 每月几十元，外加域名费 | 一般，晚高峰可能慢 | 用 Nginx 托管 `dist/`，证书用 Let's Encrypt |
| 国内云（腾讯云 COS / 阿里云 OSS + CDN，或国内服务器） | **需要 ICP 备案**（个人可以办，一般 1–3 周） | 很低 | 最快最稳 | COS 的默认域名访问 HTML 会被强制下载，必须绑自己的已备案域名 |
| Vercel / Netlify / Cloudflare Pages | 不需要 | 免费 | 国内经常访问不了 | 不推荐 |

## 更新词库

词库由脚本从开源数据生成，结果放在 `public/books/`，已经提交进仓库，平时不用重新跑。

```bash
npm run vocab:fetch   # 下载原始数据到 data/raw/（约 67MB，走 HTTPS_PROXY 代理）
npm run vocab:build   # 清洗合并，输出 public/books/*.json 和 index.json
```

- GitHub 下载慢时可以换镜像：`GH_RAW_BASE=https://ghfast.top/https://raw.githubusercontent.com npm run vocab:fetch`
- 加新词书：在 `scripts/vocab/config.ts` 的 `BOOKS` 里加一项
- 手动修正某个词（释义、例句等），或者删掉某个词：编辑 `data/overrides/overrides.json`

```json
{
  "words": { "ruler": { "meanings": [{ "pos": "n.", "cn": "直尺；尺子" }] } },
  "remove": { "pep-3a": ["some-word"] }
}
```

- 每本词书都有一个内容哈希作为版本号。词书更新后，应用下次打开时会自动导入新词条，**学习记录不受影响**（学习记录按单词 id 关联）

### 数据来源和许可证

| 来源 | 许可证 | 用途 |
|---|---|---|
| [KyleBing/english-vocabulary](https://github.com/KyleBing/english-vocabulary) | BSD-3-Clause | 主数据：分级词表、音标、释义、例句、短语 |
| [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT) | MIT | 补词性、缺失的英式音标、考试标签、词频（只在构建时使用） |
| 有道词典发音接口 | 非公开接口 | 在线发音 |

KyleBing 的数据格式和有道背单词一致，原始内容很可能来自有道。这些数据只适合个人学习使用，不要公开再分发或商用。另外，人教 PEP 词表可能是 2024 年改版前的旧版。

## 目录

```
scripts/vocab/   词库构建脚本（config / fetch / clean / merge / build）及测试
data/overrides/  手动修正
public/books/    构建出的词书（index.json + 每本书一个文件）
src/db/          IndexedDB 表结构、词书按需加载
src/srs/         FSRS 封装（scheduler）、学习会话（session）、数据读写（store）
src/quiz/        出题和干扰项
src/audio/       发音（有道 → 系统朗读）
src/pages/       今日 / 学习 / 词书 / 设置
```

## 学习规则

- **每天凌晨 4 点切日**：熬夜学的仍然算前一天。
- **学习顺序**：先复习到期的词，再学新词。新词数量在设置里调，默认每天 10 个。
- **新词怎么学**：先看卡片，再做题。答对后自己评分：模糊 / 认识 / 简单。答错自动记为"忘记"，过几分钟会再出现，直到答对为止。新词连续两次答"认识"就算学会，之后按 FSRS 安排复习时间。
- **当前词书学完**：自动接着学下一本。
- **题型按熟练度递进**（6 种）：
  - 新词和学习中的词：看英文选中文、看中文选英文、听音选词
  - 复习间隔 ≥3 天：再加上短语搭配、例句填空（没有合适短语或例句的词不出这两种）
  - 复习间隔 ≥7 天：再加上拼写（看中文、听发音，输入单词；可以提示首字母，用了提示最高只能评"认识"）
  - 第一次见固定是"看英文选中文"，之后随机出，不会连续两次出同一种
- **短语**：单词卡上每条短语旁边都有"学"按钮，点了就会单独加入学习，按 FSRS 调度。短语不占每日新词名额。
- **错题本**（在"我的"里）：答错或点"忘记"会自动加进来，并记录错误次数、最近一次出错时间、错在哪种题型。在错题本里时连续答对 3 次自动移出，也可以手动移出或加回。
  - "练习错题"一次最多 20 个，最常错的优先，答错的隔几题再出，直到全部答对
  - 练习**不影响** FSRS 复习安排，只更新错题本
- **打卡**：当天答过至少 1 题就算打卡，错题练习也算。今天还没学时，昨天之前的连续记录会保留。
- **已掌握**：复习间隔 ≥21 天的单词（和 Anki 的"成熟"标准一致）。
