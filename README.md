# クレデシアワークス 公式サイト

Credesia Works のサービス紹介サイトです。既存の静的HTMLサイトを維持しながら、Markdownベースのブログを追加しています。

公開URL: https://credesiaworks.pages.dev

## 使用技術

- Pure HTML / CSS / JavaScript
- Node.js によるブログ静的生成
- Markdown記事
- Cloudflare Pages

フレームワークは使っていません。`npm run build` で `posts/*.md` から `blog/` 配下のHTMLと `sitemap.xml` を生成します。

## ファイル構成

| パス | 内容 |
| --- | --- |
| `index.html` | 既存トップページ |
| `machlog.html` | machlog紹介ページ |
| `posts/` | ブログ記事Markdown |
| `blog/` | 生成済みブログページ |
| `scripts/build-blog.mjs` | ブログ生成スクリプト |
| `scripts/serve.mjs` | ローカル確認用サーバー |
| `sitemap.xml` | サイトマップ |
| `robots.txt` | クローラー向け設定 |

## ローカル起動方法

```bash
npm run build
npm run dev
```

表示確認:

- トップページ: http://localhost:4173/
- ブログ一覧: http://localhost:4173/blog/
- ブログ詳細: http://localhost:4173/blog/excel-data-sheet/

## ビルド方法

```bash
npm run build
```

依存パッケージはありません。Node.js 18以上で動作します。

## 記事追加方法

`posts/` に Markdown ファイルを追加します。

```md
---
title: 記事タイトル
description: 記事説明
date: 2026-05-13
category: 業務改善
slug: sample-post
published: true
---

本文を書きます。
```

追加後に `npm run build` を実行すると、`blog/{slug}/index.html` と `blog/index.html`、`sitemap.xml` が更新されます。

## GitHub接続

現在のリモート確認:

```bash
git remote -v
```

このリポジトリでは、作業時点で以下の origin が設定されています。

```text
https://github.com/credesiaworks/credesiaworks-site.git
```

別のGitHubリポジトリへ接続する場合は、既存の `origin` を上書きする前に必ず確認してください。

新規接続の例:

```bash
git remote add origin https://github.com/USER/REPOSITORY.git
git branch -M main
git push -u origin main
```

既存 origin を変更する場合:

```bash
git remote -v
git remote set-url origin https://github.com/USER/REPOSITORY.git
git push -u origin main
```

## Cloudflare Pages設定

Cloudflare Pages では次の設定で公開できます。

- Framework preset: None
- Build command: `npm run build`
- Build output directory: `/`
- Root directory: 空欄またはリポジトリルート
- Node.js version: 18以上

独自ドメインは Cloudflare Pages の Custom domains から後で接続できます。

## 将来拡張メモ

今はMarkdown投稿で安定稼働させる構成です。将来的に次の拡張がしやすいよう、記事データは `posts/` に集約しています。

- Cloudflare D1 に記事メタ情報を保存
- Cloudflare R2 に画像を保存
- `/admin` 管理画面を追加
- スマホからの記事投稿
- 画像アップロード
