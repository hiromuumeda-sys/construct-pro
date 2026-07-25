// 各画面固有の「ステータス→Tailwindクラス」マップと、その検索ロジックを共通化。
// 以前はマップの検索処理だけがここに集約され、肝心のマップ自体は4画面（受注一覧/工事計画/
// 支払管理/売上・入金管理）がそれぞれ個別に保持していた。そのため「未払いだけでなく部分払いも
// 黄色にする」といった変更のたびに複数画面へ手作業で反映する必要があり、抜け漏れの原因になっていた。
// マップ自体をここへ移し、各画面はSTATUS_MAPを参照するだけにする。
function statusClass(map, status, fallback = '') {
  return map[status] || fallback;
}

const STATUS_MAP = {
  // 受注一覧（projects.status）
  project: {
    未対応: 'bg-surface-container text-on-surface-variant',
    提案中: 'bg-secondary-container text-on-secondary-container',
    見積確認中: 'border border-outline-variant bg-surface-container-lowest text-on-surface-variant',
    受注: 'bg-secondary text-on-secondary',
    失注: 'bg-error-container text-on-error-container',
    // 引渡月変更に伴う複製元（旧案件ID）。手動選択はさせず、複製処理からのみ付与される
    オーダー移行: 'bg-surface-container-high text-on-surface-variant',
  },
  // 工事計画（orders.status）
  order: {
    未処理: 'bg-surface-container text-on-surface-variant',
    見積待ち: 'bg-tertiary-container text-on-tertiary-container',
    決定済み: 'bg-primary-container text-on-primary-container',
    発注完了: 'bg-secondary-container text-on-secondary-container',
    支払済み: 'bg-secondary text-on-secondary',
  },
  // 支払管理（orders.paymentStatus / misc_payments.status）
  payment: {
    未払い: 'bg-error/10 text-error',
    部分払い: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
    支払済み: 'bg-secondary-container text-on-secondary-container',
  },
  // 売上・入金管理（projects.pay_status相当 / misc_receipts.status）
  receipt: {
    入金済: 'bg-secondary-container text-on-secondary-container',
    一部入金: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
    未入金: 'bg-error/10 text-error',
  },
};

// ブラウザではグローバルとして、Node（テスト）ではrequireで使えるようにする
if (typeof module !== 'undefined' && module.exports) module.exports = { statusClass, STATUS_MAP };
