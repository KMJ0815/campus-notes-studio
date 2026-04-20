# Campus Notes Studio

大学生向けの授業ノート管理アプリです。時間割、授業別ノート、資料、出席記録をブラウザの IndexedDB に保存し、PWA としてインストールできる構成にしています。

## 技術構成

- React
- Vite
- Tailwind CSS
- IndexedDB (`idb`)
- Framer Motion
- JSZip

## 再現手順

```bash
npm ci
npm test
npm run build
npm run package:source
npm run verify:handoff
```

クリーン環境では `npm ci && npm test && npm run build` が最低ラインです。handoff の正規フローは `npm run package:source` で `handoff/campus-notes-studio-source.zip` を作り、`npm run verify:handoff` で source-only であることを検証する形です。

## Handoff

- 正規の配布成果物は `handoff/campus-notes-studio-source.zip` のみです。
- outer wrapper ZIP や手元で作った追加 ZIP は正規成果物として扱いません。
- `npm run verify:handoff` は `node_modules`, `dist`, `.git`, `__MACOSX` を含む ZIP を失敗させます。
- handoff 前は `npm test`, `npm run build`, `npm run package:source`, `npm run verify:handoff` を順に通してください。

## 開発

```bash
npm ci
npm run dev
```

ブラウザで表示したら、授業の追加、ノート作成、資料添付、資料メモ編集、出席記録、ZIP エクスポートまでローカル完結で使えます。

## ビルド

```bash
npm run build
```

## Cloudflare Pages

Cloudflare Pages へはそのまま静的配信できます。公式の Vite 向け設定は `npm run build` を実行し、出力ディレクトリを `dist` にする形です。SPA ルーティング用に [public/_redirects](public/_redirects) を追加してあり、深い URL でも `index.html` にフォールバックします。Cloudflare Pages の `_redirects` は静的アセットディレクトリに置けます。  
参考:
- [Cloudflare Pages Vite guide](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)
- [Cloudflare Pages redirects](https://developers.cloudflare.com/pages/configuration/redirects/)
- [Cloudflare Pages build image / Node version](https://developers.cloudflare.com/pages/configuration/language-support-and-tools/)

Pages の設定値:

- Project name: `campus-notes-studio`
- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `.node-version` の `22.16.0`

推奨:

- GitHub リポジトリを Cloudflare Pages に接続して `main` を production branch にする
- Build system は v3 を使う
- PWA 更新を安定させるため [public/_headers](public/_headers) で `sw.js` と `manifest.webmanifest` を `no-cache` にしてある
- IndexedDB / OPFS を使うので、本番 URL は HTTPS 配信にする

## PWA

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/offline.html`
- `public/icon-192.png`
- `public/icon-512.png`

アプリ本体で `navigator.serviceWorker.register("/sw.js", { scope: "/" })` を呼んでおり、`manifest` も `index.html` に組み込み済みです。

ServiceWorker を更新する際は `public/sw.js` の `SW_VERSION` を `v2` → `v3` のようにインクリメントしてください。activate 時に古い cache が削除され、`usePwaStatus` が更新を検知してユーザにリロードを促します。
