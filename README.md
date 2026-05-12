# クレデシアワークス 公式サイト

**Credesia Works** — 商品ページ改善・EC改善・Excel業務効率化

🌐 https://credesiaworks.pages.dev

---

## 概要

会社・店舗・個人事業の「商品ページ改善」と「業務効率化」を支援する制作・改善サービスのランディングページです。

## 技術スタック

- Pure HTML / CSS / JavaScript（フレームワークなし）
- Cloudflare Pages でホスティング（mainブランチ自動デプロイ）
- Google Fonts（Noto Sans JP + Rajdhani）

## ファイル構成

| ファイル | 説明 |
|---------|------|
| `index.html` | メインLP |
| `machlog.html` | machlogアプリ紹介ページ |
| `sitemap.xml` | サイトマップ |
| `AGENTS.md` | AIエージェント向け詳細仕様書 |

## ローカル確認

```bash
# ブラウザで直接開く（ビルド不要）
open index.html
```

## デプロイ

mainブランチにpushすると Cloudflare Pages が自動デプロイします。

```bash
git add .
git commit -m "変更内容"
git push
```

## 詳細仕様

AIエージェントによる編集・更新は [AGENTS.md](./AGENTS.md) を参照してください。
