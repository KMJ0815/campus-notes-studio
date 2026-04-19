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
```

クリーン環境では `npm ci && npm test && npm run build` が最低ラインです。配布用は `npm run package:source` を使い、`node_modules`, `dist`, `__MACOSX` を含めない source-only ZIP を `handoff/` に作ります。

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

## PWA

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/offline.html`
- `public/icon-192.png`
- `public/icon-512.png`

アプリ本体で `navigator.serviceWorker.register("/sw.js", { scope: "/" })` を呼んでおり、`manifest` も `index.html` に組み込み済みです。

ServiceWorker を更新する際は `public/sw.js` の `SW_VERSION` を `v2` → `v3` のようにインクリメントしてください。activate 時に古い cache が削除され、`usePwaStatus` が更新を検知してユーザにリロードを促します。
