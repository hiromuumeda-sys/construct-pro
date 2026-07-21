// 各画面固有の「ステータス→Tailwindクラス」マップの検索ロジックを共通化。
// 各画面(受注一覧/工事計画/支払管理/売上・入金管理)はドメイン固有のマップだけを保持し、
// 検索＋フォールバックのロジックはここに集約する（同じ形の関数を4画面で再実装しない）。
function statusClass(map, status, fallback = '') {
  return map[status] || fallback;
}
