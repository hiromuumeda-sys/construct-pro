// HTML特殊文字のエスケープを1箇所に集約する共通ユーティリティ。
// 以前は画面ごとに esc() を個別実装しており（実装漏れ・実装差異あり）、
// customers/vendors/projects/receiptsには存在せず無防備だった。
function escHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}
