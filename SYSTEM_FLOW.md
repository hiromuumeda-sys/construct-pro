# CONSTRUCT_PRO システムフロー

## 1. 全体構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONSTRUCT_PRO システム全体                      │
└─────────────────────────────────────────────────────────────────┘

                         ┌──────────────────┐
                         │  ダッシュボード    │
                         │ (ホーム画面)      │
                         └────────┬─────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
                ▼                 ▼                 ▼
         ┌───────────┐    ┌──────────────┐  ┌─────────────┐
         │ マスタ設定 │    │ 注文管理      │  │ 請求・支払い │
         └─────┬─────┘    └──────┬───────┘  └──────┬──────┘
               │                 │                  │
         ┌─────┴─────────────┐   │          ┌──────┘
         │                   │   │          │
         ▼                   ▼   ▼          ▼
    ┌─────────┐        ┌───────────┐  ┌─────────┐
    │案件マスタ│        │注文登録   │  │請求書   │
    │         │        │           │  │発行     │
    └────┬────┘        └─────┬─────┘  └────┬────┘
         │                   │             │
         ▼                   ▼             ▼
    ┌──────────┐        ┌──────────┐  ┌─────────┐
    │工事区分  │        │支払い管理│  │支払い済み│
    │マスタ    │        │          │  │フラグ   │
    └────┬─────┘        └──────────┘  └─────────┘
         │
         ▼
    ┌──────────┐
    │外注先    │
    │マスタ    │
    └──────────┘
```

---

## 2. ユーザーフロー

### 新規案件登録フロー

```
ユーザー
  │
  ▼
【案件マスタ】
  ├─ 案件名、発注元、発注者情報入力
  ├─ 契約金額、工期設定
  └─ ステータス設定（未対応）
      │
      ▼
【工事区分マスタ（事前設定）】
  ├─ 工事区分コード
  ├─ 工事区分名
  └─ 表示順序
      │
      ▼
【外注先マスタ（事前設定）】
  ├─ 会社名
  ├─ 部署、担当者
  └─ 連絡先（電話、メール、住所）
      │
      ▼
【注文管理】
  ├─ 案件選択
  ├─ 工事区分選択
  ├─ 外注先選択
  ├─ 見積額、予定金額、決定金額入力
  └─ ステータス設定
      │
      ▼
【請求書発行】
  ├─ 案件の全注文をまとめて請求書生成（PDF）
  ├─ 紫色フォーマット
  └─ メール送信可能
      │
      ▼
【支払い管理】
  ├─ 案件詳細で「支払い済み」チェック
  └─ テーブルで支払い状況を可視化
```

---

## 3. データフロー

### マスタデータ管理

```
【案件マスタ】(projects)
├─ id: 案件ID（主キー）
├─ name: 案件名 ※必須
├─ client: 発注元 ※必須
├─ clientCompany: 発注者会社
├─ clientPhone: 発注者電話番号
├─ clientEmail: 発注者メールアドレス
├─ clientAddress: 発注者住所
├─ amount: 契約金額
├─ startDate: 工期（開始）
├─ endDate: 工期（終了）
├─ status: ステータス（未対応/提案中/見積確認中/受注/失注）
├─ notes: 備考
└─ paid: 支払い済みフラグ（0:未払い / 1:支払い済み）

【工事区分マスタ】(categories)
├─ id: 区分ID
├─ code: 区分コード
├─ name: 区分名
├─ order: 表示順序
└─ note: 備考

【外注先マスタ】(vendors)
├─ id: 外注先ID
├─ company: 会社名
├─ dept: 部署名
├─ contact: 担当者名
├─ email: メールアドレス
├─ phone: 電話番号
├─ address: 所在地
└─ area: エリア

【注文テーブル】(orders)
├─ id: 注文ID
├─ project_id: 案件ID（外部キー）
├─ category: 工事区分名
├─ vendor: 外注先名
├─ estimate: 見積額
├─ planned: 予定金額
├─ decided: 決定金額
├─ status: ステータス
└─ details: 詳細情報
```

---

## 4. 各画面の説明

### 4.1 案件マスタ（projects.html）

**目的**: 工事案件の基本情報を管理

**機能**:
- ✅ 案件の新規登録
- ✅ 案件情報の編集（発注者情報、金額、工期、ステータス）
- ✅ 支払い状況の管理（支払い済み/未払い）
- ✅ 案件の削除
- ✅ 請求書の発行（案件の全注文をまとめて）
- ✅ キーワード検索・ステータスフィルタ

**遷移先**:
- → 注文管理画面（「注文管理」ボタン）

---

### 4.2 工事区分マスタ（categories.html）

**目的**: 工事の区分を管理

**機能**:
- ✅ 工事区分の新規登録
- ✅ 区分情報の編集（名称、コード、表示順、備考）
- ✅ 区分の削除
- ✅ キーワード検索

**用途**:
- 注文登録時に工事区分を選択

---

### 4.3 外注先マスタ（vendors.html）

**目的**: 外注先企業の情報を管理

**機能**:
- ✅ 外注先の新規登録
- ✅ 外注先情報の編集（会社名、部署、担当者、連絡先）
- ✅ 外注先の削除
- ✅ キーワード・エリアで検索

**用途**:
- 注文登録時に外注先を選択

---

### 4.4 注文管理（orders-list.html）

**目的**: 案件に対する注文を管理、請求書を発行

**機能**:
- ✅ 注文の新規登録
- ✅ 注文情報の編集（金額、ステータス、期限、支払先など）
- ✅ 注文の削除
- ✅ **請求書の発行**（案件の全注文をまとめてPDF生成）
- ✅ キーワード・工事区分・ステータスで検索
- ✅ 履歴ログの表示

**特徴**:
- 一つの案件に複数の注文が可能
- 注文の金額を集計して請求書に反映
- 消費税（10%）は自動計算

---

## 5. 業務フロー例

### 新規案件から支払い完了までの流れ

```
1. 【マスタ設定】
   └─ 案件マスタで案件登録
      ├─ 案件名「京都御所南マンション改修工事」
      ├─ 発注元「京都工務店」
      ├─ 発注者情報入力
      └─ 契約金額「¥12,500,000」

2. 【注文登録】
   └─ 注文管理画面で注文登録
      ├─ 工事区分選択「塗装工事」
      ├─ 外注先選択「なにわ建設」
      ├─ 見積額「¥2,000,000」
      └─ 決定金額「¥1,800,000」

3. 【追加注文】
   └─ 複数の工事区分で注文追加
      ├─ 工事区分「電気工事」+ 外注先「関西電設工業」
      └─ 工事区分「設備工事」+ 外注先「京都冷熱工業所」

4. 【請求書発行】
   └─ 注文管理画面で「請求書を発行」クリック
      ├─ 全注文が集計される
      ├─ 小計：¥5,800,000
      ├─ 消費税（10%）：¥580,000
      └─ 合計：¥6,380,000

5. 【支払い管理】
   └─ 案件マスタで支払い状況を更新
      ├─ 「支払い済み」にチェック
      └─ テーブルに支払い状況を表示

6. 【完了】
   └─ 案件は「支払い済み」として管理
      └─ 履歴ログに記録
```

---

## 6. API エンドポイント一覧

### マスタ管理
```
GET  /api/projects          → 全案件取得
POST /api/projects          → 案件新規登録
PUT  /api/projects/:id      → 案件更新
DELETE /api/projects/:id    → 案件削除

GET  /api/categories        → 全工事区分取得
POST /api/categories        → 区分新規登録
PUT  /api/categories/:id    → 区分更新
DELETE /api/categories/:id  → 区分削除

GET  /api/vendors           → 全外注先取得
POST /api/vendors           → 外注先新規登録
PUT  /api/vendors/:id       → 外注先更新
DELETE /api/vendors/:id     → 外注先削除
```

### 注文・請求書
```
GET  /api/orders            → 全注文取得
POST /api/orders            → 注文新規登録
PUT  /api/orders/:id        → 注文更新
DELETE /api/orders/:id      → 注文削除

GET  /api/invoice/project/:projectId  → 案件の請求書PDF生成
```

### キャッシュ
```
GET  /api/cache             → 全マスタデータ取得
                              （projects, vendors, categories, orders）
```

---

## 7. 画面遷移図

```
┌─────────────────┐
│  案件マスタ      │
│ (projects.html) │
└────────┬────────┘
         │ 「注文管理」クリック
         ▼
┌──────────────────┐
│  注文管理        │
│(orders-list.html)│
│                  │
│ 「請求書を発行」 │
│      ↓           │
│   請求書PDF生成  │
└──────────────────┘

┌──────────────────┐
│ 工事区分マスタ    │
│(categories.html) │
└──────────────────┘

┌──────────────────┐
│ 外注先マスタ     │
│ (vendors.html)   │
└──────────────────┘

┌──────────────────┐
│ ヘッダー共通      │
│(header.html)     │
│                  │
│ - ダッシュボード  │
│ - 案件マスタ      │
│ - 外注先マスタ    │
│ - 工事区分マスタ  │
└──────────────────┘
```

---

## 8. キャッシュメカニズム

### 初回ロード（projects.html）
```
1. ページ読み込み
   ▼
2. initializeGlobalCache() 実行
   ▼
3. GET /api/cache で全データ取得
   ▼
4. window.appCache に保存
   {
     projects: [...],
     vendors: [...],
     categories: [...],
     orders: [...]
   }
   ▼
5. 他のページでは window.appCache を使用
```

### 日常運用
```
データ更新時:
  1. 該当エンドポイント呼び出し（POST/PUT/DELETE）
  2. initializeGlobalCache() 再実行
  3. window.appCache を最新データで更新
  4. UI 再描画
```

---

## 9. 主要機能概要

| 機能 | 画面 | 説明 |
|------|------|------|
| 案件管理 | 案件マスタ | 工事案件の基本情報、発注者情報、支払い状況を一元管理 |
| 工事区分管理 | 工事区分マスタ | 工事の分類を管理し、注文時に選択 |
| 外注先管理 | 外注先マスタ | 外注先企業の情報を管理、注文時に選択 |
| 注文管理 | 注文管理 | 案件ごとの注文を登録・編集・管理 |
| 請求書発行 | 注文管理 | 案件の全注文をまとめた請求書をPDF生成 |
| 支払い管理 | 案件マスタ | 支払い済み/未払いを管理、可視化 |

---

## 10. 技術スタック

- **フロントエンド**: HTML5, Tailwind CSS
- **バックエンド**: Node.js (Express)
- **データベース**: SQLite
- **PDF生成**: PDFKit
- **キャッシング**: JavaScript グローバルオブジェクト（window.appCache）

---

## まとめ

CONSTRUCT_PRO は以下の流れでシステムが構成されています：

```
【マスタ設定】（事前準備）
  ↓
【案件登録】
  ↓
【注文登録】（複数可）
  ↓
【請求書発行】（まとめて生成）
  ↓
【支払い管理】（状況記録）
  ↓
【完了】
```

各マスタは独立して管理でき、必要に応じて参照・更新が可能です。

---

## 11. データ受け渡し詳細

### 11.1 フロントエンド → バックエンド

#### 新規案件登録時のリクエスト

**URL**: `POST /api/projects`

**リクエストボディ**:
```json
{
  "name": "京都御所南マンション改修工事",
  "client": "京都工務店",
  "clientCompany": "京都工務店 営業部",
  "clientPhone": "075-123-4567",
  "clientEmail": "contact@kyoto-koumuten.jp",
  "clientAddress": "京都府京都市中京区",
  "amount": 12500000,
  "startDate": "2026-07-01",
  "endDate": "2026-09-30",
  "status": "受注",
  "notes": "外壁塗装・内装工事が含まれます",
  "paid": 0
}
```

**フロントエンド処理**:
```javascript
// 1. モーダルから入力値取得
const projectData = {
  name: document.getElementById('reg-name').value,
  client: document.getElementById('reg-client').value,
  clientCompany: document.getElementById('reg-client-company').value,
  // ... その他のフィールド
  paid: document.getElementById('reg-paid').checked ? 1 : 0
};

// 2. バックエンドへPOST
const response = await fetch('/api/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(projectData)
});

// 3. キャッシュ再取得
await initializeGlobalCache();

// 4. UI再描画
renderTable();
```

#### 注文登録時のリクエスト

**URL**: `POST /api/orders`

**リクエストボディ**:
```json
{
  "project_id": 5,
  "category": "塗装工事",
  "vendor": "なにわ建設",
  "estimate": 2000000,
  "planned": 1950000,
  "decided": 1800000,
  "status": "発注予定",
  "details": "外壁塗装工事一式"
}
```

---

### 11.2 バックエンド → フロントエンド

#### キャッシュ取得時のレスポンス

**URL**: `GET /api/cache`

**レスポンスボディ**:
```json
{
  "projects": [
    {
      "id": 1,
      "name": "京都御所南マンション改修工事",
      "client": "京都工務店",
      "clientCompany": "京都工務店 営業部",
      "clientPhone": "075-123-4567",
      "clientEmail": "contact@kyoto-koumuten.jp",
      "clientAddress": "京都府京都市中京区",
      "amount": 12500000,
      "startDate": "2026-07-01",
      "endDate": "2026-09-30",
      "status": "受注",
      "notes": "外壁塗装・内装工事が含まれます",
      "paid": 1
    }
  ],
  "vendors": [
    {
      "id": 1,
      "company": "なにわ建設",
      "dept": "営業部",
      "contact": "田中太郎",
      "email": "contact@naniwa.jp",
      "phone": "06-123-4567",
      "address": "大阪府大阪市",
      "area": "関西"
    }
  ],
  "categories": [
    {
      "id": 1,
      "code": "001",
      "name": "塗装工事",
      "order": 1,
      "note": "外壁・内壁の塗装"
    }
  ],
  "orders": [
    {
      "id": 1,
      "project_id": 1,
      "category": "塗装工事",
      "vendor": "なにわ建設",
      "estimate": 2000000,
      "planned": 1950000,
      "decided": 1800000,
      "status": "発注予定",
      "details": "外壁塗装工事一式"
    }
  ]
}
```

**フロントエンド処理**:
```javascript
// 1. キャッシュ初期化
async function initializeGlobalCache() {
  const response = await fetch('/api/cache');
  window.appCache = await response.json();
}

// 2. キャッシュからデータ取得
const projects = window.appCache.projects;
const vendors = window.appCache.vendors;

// 3. テーブル描画
function renderTable() {
  projects.forEach(project => {
    // テーブル行生成
  });
}
```

---

## 12. 登録プロセス詳細

### 12.1 新規案件登録の完全なフロー

```
【ユーザーアクション】
  │
  ├─ 「案件を追加」ボタンクリック
  │   ▼
  ├─ モーダル表示（reg-modal）
  │   ├─ 案件名、発注元入力欄表示
  │   ├─ 発注者情報入力欄表示
  │   ├─ 金額、工期入力欄表示
  │   └─ 「支払い済み」チェックボックス表示
  │   ▼
  ├─ 全フィールド入力
  │   ├─ 案件名: "京都御所南マンション改修工事"
  │   ├─ 発注元: "京都工務店"
  │   ├─ 発注者電話: "075-123-4567"
  │   ├─ 発注者メール: "contact@kyoto-koumuten.jp"
  │   ├─ 発注者住所: "京都府京都市中京区"
  │   └─ 支払い済み: チェック（未チェック = 0, チェック = 1）
  │   ▼
  ├─ 「登録」ボタンクリック
  │   ▼
  ├─【バックエンド処理】
  │   ├─ リクエスト受け取り: POST /api/projects
  │   ├─ バリデーション実行
  │   │   ├─ 案件名が空でない確認
  │   │   └─ 発注元が空でない確認
  │   ├─ SQLite に INSERT
  │   │   └─ INSERT INTO projects (name, client, ..., paid)
  │   │      VALUES (?, ?, ..., ?)
  │   ├─ 新規案件ID返却（例: 10）
  │   └─ JSON レスポンス: { id: 10, name: "...", ... }
  │   ▼
  ├─【フロントエンド応答処理】
  │   ├─ POSTリクエスト完了を確認
  │   ├─ モーダルを閉じる
  │   ├─ 入力フィールド初期化
  │   ├─ キャッシュ再取得: GET /api/cache
  │   │   └─ window.appCache を最新データで上書き
  │   ├─ テーブル再描画: renderTable()
  │   │   └─ 新規案件を含む全案件を表示
  │   └─ ページを更新（オプション）
  │   ▼
  └─ 【完了】
     └─ テーブルに新規案件が表示される
```

### 12.2 新規注文登録の完全なフロー

```
【ユーザーアクション】
  │
  ├─ 案件マスタで案件を選択
  │   ▼
  ├─ 「注文管理」ボタンクリック
  │   └─ orders-list.html?project_id=5 へ遷移
  │   ▼
  ├─ orders-list.html ページロード
  │   ├─ URL パラメータから project_id 取得
  │   ├─ window.appCache から該当案件データ抽出
  │   ├─ 関連注文を表示
  │   └─ キャッシュが空の場合は GET /api/cache で初期化
  │   ▼
  ├─ 「注文を追加」ボタンクリック
  │   ▼
  ├─ モーダル表示（order-modal）
  │   ├─ 工事区分ドロップダウン表示
  │   │   └─ window.appCache.categories から選択肢生成
  │   ├─ 外注先ドロップダウン表示
  │   │   └─ window.appCache.vendors から選択肢生成
  │   └─ 見積額、予定金額、決定金額入力欄表示
  │   ▼
  ├─ 内容入力
  │   ├─ 工事区分: "塗装工事" を選択
  │   ├─ 外注先: "なにわ建設" を選択
  │   ├─ 見積額: 2,000,000 入力
  │   ├─ 予定金額: 1,950,000 入力
  │   └─ 決定金額: 1,800,000 入力
  │   ▼
  ├─ 「登録」ボタンクリック
  │   ▼
  ├─【バックエンド処理】
  │   ├─ リクエスト受け取り: POST /api/orders
  │   ├─ バリデーション実行
  │   │   ├─ project_id が有効確認
  │   │   └─ category, vendor が空でない確認
  │   ├─ SQLite に INSERT
  │   │   └─ INSERT INTO orders (project_id, category, vendor, ...)
  │   │      VALUES (5, ?, ?, ...)
  │   └─ JSON レスポンス: { id: 25, project_id: 5, ... }
  │   ▼
  ├─【フロントエンド応答処理】
  │   ├─ モーダルを閉じる
  │   ├─ 入力フィールド初期化
  │   ├─ キャッシュ再取得: GET /api/cache
  │   ├─ 現在のページ（orders-list）のテーブル再描画
  │   │   └─ 新規注文を含む全注文を表示
  │   └─ 成功メッセージ表示（オプション）
  │   ▼
  └─ 【完了】
     └─ テーブルに新規注文が表示される
```

---

## 13. 請求書発行プロセス詳細

### 13.1 請求書発行の完全なフロー

```
【ユーザーアクション】
  │
  ├─ orders-list.html（案件ID付き）を表示
  │   └─ URL: /orders-list.html?project_id=5
  │   ▼
  ├─ 「請求書を発行」ボタンクリック
  │   ▼
  ├─【フロントエンド処理】
  │   ├─ generateInvoice() 関数実行
  │   ├─ URL からproject_id 取得
  │   │   └─ const projectId = url.searchParams.get('project_id')
  │   ├─ 請求書PDF生成エンドポイント呼び出し
  │   │   └─ window.open('/api/invoice/project/5', '_blank')
  │   └─ 新しいウィンドウで PDF ダウンロード
  │   ▼
  ├─【バックエンド処理】
  │   ├─ リクエスト受け取り: GET /api/invoice/project/5
  │   ├─ データベース クエリ実行
  │   │   ├─ 案件データ取得
  │   │   │   └─ SELECT * FROM projects WHERE id=5
  │   │   └─ 関連注文全て取得
  │   │       └─ SELECT * FROM orders WHERE project_id=5
  │   ├─ PDFKit でドキュメント生成開始
  │   │   ├─ ページサイズ: A4
  │   │   └─ フォント設定
  │   │   ▼
  │   ├─ ヘッダー部分作成
  │   │   ├─ 背景色: 紫色（#8B4789）
  │   │   ├─ 会社名表示: "CONSTRUCT_PRO"
  │   │   ├─ 発行日付: 本日の日付
  │   │   └─ 請求書タイトル表示
  │   │   ▼
  │   ├─ 発注者情報表示
  │   │   ├─ 発注元（企業名）
  │   │   ├─ 発注者担当者
  │   │   ├─ 電話・メール・住所
  │   │   └─ 案件名
  │   │   ▼
  │   ├─ 注文詳細テーブル作成
  │   │   ├─ 列: 工事区分、外注先、見積額、予定金額、決定金額
  │   │   └─ 各注文をテーブル行として追加
  │   │       └─ 5件の注文 → 5行のテーブル
  │   │   ▼
  │   ├─ 金額計算
  │   │   ├─ 小計（決定金額の合計）
  │   │   │   └─ 各注文の決定金額を合計
  │   │   │      例: 1,800,000 + 1,200,000 + 800,000 = 3,800,000
  │   │   ├─ 消費税（10%自動計算）
  │   │   │   └─ 小計 × 0.1 = 3,800,000 × 0.1 = 380,000
  │   │   └─ 合計金額
  │   │       └─ 小計 + 消費税 = 3,800,000 + 380,000 = 4,180,000
  │   │   ▼
  │   ├─ 金額表示セクション
  │   │   ├─ 小計: ¥3,800,000
  │   │   ├─ 消費税: ¥380,000
  │   │   └─ 合計: ¥4,180,000（太字・大きめフォント）
  │   │   ▼
  │   ├─ フッター情報追加
  │   │   ├─ 請求期限: 30日以内
  │   │   ├─ 支払い方法: 指定方法
  │   │   └─ 注記: 適用税率等
  │   │   ▼
  │   ├─ PDF をバイナリデータとしてレスポンス
  │   │   ├─ Content-Type: application/pdf
  │   │   ├─ Content-Disposition: attachment; filename="invoice_project_5_YYYYMMDD.pdf"
  │   │   └─ PDF バイナリデータ送信
  │   └─ エラー処理
  │       ├─ 案件が見つからない → エラーレスポンス
  │       ├─ データベースエラー → エラーレスポンス
  │       └─ コンソール にログ出力（デバッグ用）
  │   ▼
  ├─【ブラウザ処理】
  │   ├─ レスポンス受け取り
  │   ├─ PDF をメモリに保持
  │   ├─ 新しいタブで PDF を表示
  │   │   └─ または自動ダウンロード開始
  │   └─ ユーザーが印刷またはダウンロード可能に
  │   ▼
  └─ 【完了】
     └─ 請求書PDF が表示 / ダウンロード完了
```

### 13.2 請求書PDF のレイアウト例

```
┌─────────────────────────────────────────────┐
│ ╔═════════════════════════════════════════╗ │
│ ║    CONSTRUCT_PRO                       ║ │
│ ║           請  求  書                    ║ │  ← 紫色背景（#8B4789）
│ ║  発行日: 2026年06月18日                  ║ │
│ ╚═════════════════════════════════════════╝ │
│                                             │
│ 【ご請求先】                               │
│ 京都工務店 営業部                          │
│ 電話: 075-123-4567                        │
│ メール: contact@kyoto-koumuten.jp         │
│ 住所: 京都府京都市中京区                   │
│                                             │
│ 【案件名】                                 │
│ 京都御所南マンション改修工事              │
│                                             │
│ ┌───────────────┬────────┬────────────┐   │
│ │ 工事区分      │ 外注先 │ 決定金額   │   │
│ ├───────────────┼────────┼────────────┤   │
│ │ 塗装工事      │ A会社  │ 1,800,000 │   │
│ │ 電気工事      │ B会社  │ 1,200,000 │   │
│ │ 設備工事      │ C会社  │   800,000 │   │
│ │ 防水工事      │ D会社  │   600,000 │   │
│ │ 内装工事      │ E会社  │   400,000 │   │
│ └───────────────┴────────┴────────────┘   │
│                                             │
│                    小計: ¥ 4,800,000       │
│                消費税（10%）: ¥   480,000 │
│                  ━━━━━━━━━━━━━━        │
│              合計金額: ¥ 5,280,000         │
│                                             │
│ 【お支払い期限】                           │
│ 本請求書を受け取りから30日以内にお支払い │
│ ください。                                 │
│                                             │
└─────────────────────────────────────────────┘
```

### 13.3 サーバー側コード例（概要）

```javascript
app.get('/api/invoice/project/:projectId', (req, res) => {
  try {
    const projectId = req.params.projectId;
    console.log('Invoice request for project:', projectId);

    // 1. 案件データ取得
    const project = db.prepare('SELECT * FROM projects WHERE id=?')
                      .get(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // 2. 関連注文取得
    const orders = db.prepare('SELECT * FROM orders WHERE project_id=?')
                      .all(projectId);

    // 3. PDFKit でドキュメント作成
    const doc = new PDFDocument();
    
    // ヘッダー部分（紫色背景）
    doc.fillColor('#8B4789')
       .rect(0, 0, 612, 80)
       .fill();
    
    doc.fillColor('white')
       .font('Helvetica-Bold')
       .fontSize(24)
       .text('CONSTRUCT_PRO', 50, 20)
       .fontSize(16)
       .text('請 求 書', 450, 20);

    // 発注者情報
    doc.fillColor('black')
       .fontSize(12)
       .text(`発注元: ${project.client}`, 50, 120)
       .text(`電話: ${project.clientPhone}`, 50, 140)
       .text(`住所: ${project.clientAddress}`, 50, 160);

    // 注文テーブル
    let y = 220;
    orders.forEach(order => {
      doc.fontSize(10)
         .text(`${order.category} - ${order.vendor}`, 50, y)
         .text(`決定金額: ¥${order.decided.toLocaleString()}`, 400, y);
      y += 30;
    });

    // 金額計算と表示
    const subtotal = orders.reduce((sum, o) => sum + o.decided, 0);
    const tax = Math.floor(subtotal * 0.1);
    const total = subtotal + tax;

    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text(`合計: ¥${total.toLocaleString()}`, 400, y + 40);

    // レスポンスヘッダー設定
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 
                  `attachment; filename="invoice_${projectId}.pdf"`);

    // PDFをレスポンスに送信
    doc.pipe(res);
    doc.end();

  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});
```

---

## 14. メール送信機能（実装予定）

### 14.1 メール送信の概要

**実装ステータス**: 準備完了（nodemailer ライブラリ装備）

**用途**: 請求書をメールで発注元に送信

### 14.2 想定される実装フロー

```
【ユーザーアクション】
  │
  ├─ 注文管理画面で「請求書をメールで送信」ボタンクリック
  │   ▼
  ├─ メール送信ダイアログ表示
  │   ├─ 宛先: 発注元メールアドレス（自動入力）
  │   ├─ CC: オプション
  │   ├─ 件名: "【CONSTRUCT_PRO】請求書のご送付" 等
  │   └─ 本文: テンプレート（カスタマイズ可能）
  │   ▼
  ├─ 「送信」ボタンクリック
  │   ▼
  ├─【バックエンド処理】
  │   ├─ リクエスト受け取り: POST /api/email/invoice
  │   ├─ リクエストボディ:
  │   │   {
  │   │     "projectId": 5,
  │   │     "to": "contact@kyoto-koumuten.jp",
  │   │     "subject": "【CONSTRUCT_PRO】請求書のご送付",
  │   │     "body": "いつもお世話になっております..."
  │   │   }
  │   ├─ 請求書PDF生成
  │   │   └─ 上記の請求書生成処理と同じ
  │   ├─ nodemailer で メール作成
  │   │   ├─ From: system@construct-pro.local
  │   │   ├─ To: contact@kyoto-koumuten.jp
  │   │   ├─ Subject: 指定された件名
  │   │   ├─ Body: HTML形式またはテキスト形式
  │   │   └─ Attachments: PDFファイル（請求書）
  │   ├─ SMTP サーバーに接続
  │   │   └─ 環境変数から接続設定を取得
  │   │      - SMTP_HOST: "smtp.example.com"
  │   │      - SMTP_PORT: 587
  │   │      - SMTP_USER: "user@example.com"
  │   │      - SMTP_PASS: "password"
  │   ├─ メール送信実行
  │   └─ JSON レスポンス:
  │       {
  │         "success": true,
  │         "message": "メールを送信しました",
  │         "sentTo": "contact@kyoto-koumuten.jp"
  │       }
  │   ▼
  ├─【フロントエンド応答処理】
  │   ├─ メール送信完了を確認
  │   ├─ ダイアログを閉じる
  │   ├─ 成功メッセージ表示
  │   │   └─ "メールが sent@kyoto-koumuten.jp に送信されました"
  │   └─ ページを更新（オプション）
  │   ▼
  └─ 【完了】
     └─ メール送信完了、発注元が請求書を受け取る
```

### 14.3 メール設定（環境変数）

**.env ファイル例**:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@construct-pro.com
```

### 14.4 メール送信のコード例（実装時用）

```javascript
const nodemailer = require('nodemailer');

// SMTP設定
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// メール送信エンドポイント
app.post('/api/email/invoice', async (req, res) => {
  try {
    const { projectId, to, subject, body } = req.body;

    // 請求書PDF生成（stream として）
    const invoiceStream = generateInvoicePDF(projectId);

    // メール送信
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: to,
      subject: subject,
      html: body, // HTMLメール
      attachments: [
        {
          filename: `invoice_${projectId}.pdf`,
          content: invoiceStream,
          contentType: 'application/pdf'
        }
      ]
    });

    res.json({
      success: true,
      message: 'メールを送信しました',
      sentTo: to
    });

  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({
      error: 'メール送信に失敗しました',
      details: error.message
    });
  }
});
```

### 14.5 メール本文テンプレート例

```html
<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
  <h2>いつもお世話になっております</h2>

  <p>
    CONSTRUCT_PRO より、下記案件の請求書をお送りいたします。
  </p>

  <div style="background: #f5f5f5; padding: 15px; margin: 20px 0; border-left: 4px solid #8B4789;">
    <p><strong>案件名:</strong> 京都御所南マンション改修工事</p>
    <p><strong>請求金額:</strong> ¥5,280,000（税込）</p>
    <p><strong>支払期限:</strong> 2026年07月18日</p>
  </div>

  <p>
    ご不明な点がございましたら、お気軽にお問い合わせください。
  </p>

  <p>
    よろしくお願いいたします。<br>
    <strong>CONSTRUCT_PRO システムサポート</strong><br>
    support@construct-pro.com
  </p>
</div>
```

---

## 15. エラー処理とバリデーション

### 15.1 クライアント側バリデーション

```javascript
// 案件登録時のバリデーション
function validateProjectForm() {
  const name = document.getElementById('reg-name').value.trim();
  const client = document.getElementById('reg-client').value.trim();

  if (!name) {
    alert('案件名を入力してください');
    return false;
  }

  if (!client) {
    alert('発注元を入力してください');
    return false;
  }

  return true;
}

// 送信前にバリデーション実行
document.getElementById('reg-save-btn').addEventListener('click', () => {
  if (validateProjectForm()) {
    saveProject();
  }
});
```

### 15.2 サーバー側バリデーション

```javascript
app.post('/api/projects', (req, res) => {
  const { name, client, amount, startDate, endDate } = req.body;

  // 必須項目チェック
  if (!name || name.trim() === '') {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: '案件名は必須です' 
    });
  }

  if (!client || client.trim() === '') {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: '発注元は必須です' 
    });
  }

  // 金額チェック
  if (amount && isNaN(amount)) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: '金額は数値で入力してください' 
    });
  }

  // 日付チェック
  if (startDate && endDate) {
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ 
        error: 'Bad Request', 
        message: '工期（開始）は工期（終了）より前である必要があります' 
      });
    }
  }

  // ここから INSERT 処理
  // ...
});
```

### 15.3 エラーレスポンス形式

```json
{
  "error": "error_type",
  "message": "Human readable message",
  "details": "Optional detailed information"
}
```

例:
```json
{
  "error": "Bad Request",
  "message": "案件名は必須です"
}
```

---

## 16. まとめ - データフローの全体像

```
┌─────────────────────────────────────────────────────────────────┐
│                       ユーザー操作                                 │
│                                                                   │
│ ① マスタ設定（案件、工事区分、外注先）→ GET /api/cache で全取得│
│ ② 案件選択 → 注文登録 → POST /api/orders で注文作成            │
│ ③ 「請求書を発行」 → GET /api/invoice/project/:id で PDF生成   │
│ ④ 「メール送信」（予定） → POST /api/email/invoice で送信       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                   ┌──────────────────┐
                   │  window.appCache  │
                   │  (グローバル)     │
                   │  {                │
                   │   projects: [...] │
                   │   vendors: [...]  │
                   │   categories: ...│
                   │   orders: [...]   │
                   │  }                │
                   └──────────────────┘
                              ↓
                   ┌──────────────────┐
                   │  Express Server   │
                   │   (Node.js)       │
                   │                   │
                   │  POST/PUT/DELETE  │
                   │  API エンドポイント
                   └──────────────────┘
                              ↓
                   ┌──────────────────┐
                   │  SQLite Database  │
                   │                   │
                   │ projects table    │
                   │ orders table      │
                   │ vendors table     │
                   │ categories table  │
                   └──────────────────┘
```

このフローにより、ユーザーの操作 → キャッシュ → サーバー → DB という確実なデータの受け渡しが実現されます。
