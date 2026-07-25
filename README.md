# construct-pro

建設会社向けの社内業務管理システム（WIN WIN様デモ環境）。案件管理・工事計画・発注先/顧客マスタ・
売上入金管理・支払管理・請求書/見積書/注文書のPDF発行・監査ログなどをひとつのアプリで扱う。

現状はデモ／PoCとして構築されており、本番運用前提の品質保証は `quality_audit_report`（監査レポート）
を参照のこと。

## セットアップ

```bash
cp .env.example .env   # DATABASE_URL・JWT_SECRET等を設定（詳細は.env.example内のコメント参照）
npm install
npm run migrate        # 未適用のマイグレーションを適用（初回・環境構築時）
npm start               # http://localhost:4500
```

`.env` はgitignore対象。`JWT_SECRET` は必須（未設定だと起動時にエラーで落ちる）。生成方法は
`.env.example` に書いてある。

## 開発時によく使うコマンド

```bash
npm test          # node:test によるテスト一式（実DBに対して実行し、自分が作ったデータは自動で後始末する）
npm run lint       # ESLint
npm run build:css  # Tailwindのビルド（public/styles.cssを再生成。クラスを追加した時は必須）
npm run migrate    # migrations/ 配下の未適用SQLを適用
```

## アーキテクチャ

- **バックエンド**: Node.js + Express（`server.js`、単一ファイル）。DBアクセスは `db.js`（`pg.Pool`）経由。
- **フロントエンド**: ビルドツールなしのプレーンHTML/JS（`public/*.html`）。画面間で共有するロジックは
  `public/sidebar.js` `auth.js` `header.js` `notify.js` `status-utils.js` `esc.js` に分離しているが、
  各画面固有の描画・フォーム処理はページごとのインラインscriptに実装されている。
- **DB**: PostgreSQL（Supabase）。スキーマの正は `supabase/schema.sql`。新規環境はこれをそのまま実行
  すれば全テーブル・初期データができる。本番運用中のDBに対する差分適用は `migrations/` ＋
  `npm run migrate` で行う。
- **認証**: JWT（`Authorization: Bearer`）。`public/auth.js` が `window.fetch` をパッチして
  全ページの `/api/*` 呼び出しに自動でトークンを付与する。ロールは `admin` / `accounting` / `staff`
  （招待時に選択）と、レガシーな `user`（招待を使わないサインアップ時の既定値）。
- **デプロイ**: ローカルは `node server.js` の常駐プロセス、本番はVercelのサーバーレス関数
  （`api/index.js` が `server.js` のexportをそのまま使う）。詳細は [DEPLOY.md](DEPLOY.md)。

## スキーマ変更の手順

1. `server.js` の `ensureAux()` に冪等な `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` を追加する
   （サーバーレス環境でも初回リクエスト時に自動適用されるための安全網）。
2. 同じ変更を `supabase/schema.sql` にも反映し、新規環境の構築時にも同じ構造ができるようにする。
3. 既存の本番/デモDBに対しては `migrations/000X_description.sql` を追加し `npm run migrate` で適用する
   （`ensureAux()` に任せてもよいが、明示的に適用したい・複数テーブルにまたがる込み入った変更の場合はこちら）。

## 業務ルール

議事録で決まった業務上の前提（案件ID/工事IDの採番規則、権限、帳票の表示規則など）は
[docs/business-rules.md](docs/business-rules.md) にまとめてある。

## CI

`.github/workflows/ci.yml` がpush/PR時に lint・test を実行する。テストは別建てのテストDBを持たず
実際のdev用Supabaseに対して実行するため、GitHubリポジトリの Settings > Secrets and variables > Actions
に `DATABASE_URL` と `JWT_SECRET` の登録が必要（未登録だとCIのtestステップは失敗する）。
