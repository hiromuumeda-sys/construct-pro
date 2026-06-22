# Supabase + Vercel デプロイ手順

DB を **Supabase（PostgreSQL）**、ホスティングを **Vercel（サーバーレス）** で構成します。

## 1. Supabase（DB）

1. https://supabase.com でプロジェクトを作成
2. ダッシュボード > **SQL Editor** を開き、`supabase/schema.sql` の中身を貼り付けて **Run**
   - テーブル作成＋初期データ（案件10・発注先10・工事区分10・顧客10・注文100・入金5）が投入されます
3. **Project Settings > Database > Connection string > Transaction**（ポート6543）の接続文字列をコピー
   - `[YOUR-PASSWORD]` を実際のDBパスワードに置換

## 2. ローカル確認（任意）

```bash
cp .env.example .env       # .env に DATABASE_URL を設定
npm install
npm start                  # http://localhost:4500
```

## 3. Vercel（デプロイ）

### A. CLI で

```bash
npm i -g vercel
vercel login               # ご自身のアカウントで認証
vercel                     # プレビューデプロイ
vercel --prod              # 本番デプロイ
```

### B. GitHub 連携で

1. このリポジトリを GitHub に push
2. vercel.com > **Add New > Project** でリポジトリをインポート

### 環境変数（Vercel プロジェクト設定 > Environment Variables）

| 変数 | 値 |
|------|----|
| `DATABASE_URL` | Supabase の Transaction 接続文字列（必須） |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | メール送信を使う場合のみ |

## 構成メモ

- `api/index.js` … Vercel 関数のエントリ（Express アプリをエクスポート）
- `vercel.json` … 全リクエストを Express に集約、`public/**` を同梱
- `db.js` … `pg` による Supabase 接続（`DATABASE_URL`）
- `server.js` … API 本体（ローカルは `node server.js` で listen、Vercel ではモジュール読み込み）
- 静的ファイル（HTML/theme.js/notify.js）は Express の `express.static('public')` が配信
