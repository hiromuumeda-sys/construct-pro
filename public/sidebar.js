// サイドバー共通化
// フォント／アイコンサイズはインライン style で明示し、TailwindのCDN処理タイミングに
// 依存しないようにする（動的注入時のサイズ崩れ防止）。
const SIDEBAR_LINKS = [
  { href: '/reporting.html',   icon: 'dashboard',    label: 'ダッシュボード' },
  { href: '/projects.html',    icon: 'engineering',  label: '受注一覧' },
  { href: '/customers.html',   icon: 'groups',       label: '顧客マスタ' },
  { href: '/vendors.html',     icon: 'store',        label: '発注先マスタ' },
  { href: '/categories.html',  icon: 'category',     label: '工事区分マスタ' },
  { href: '/receipts.html',    icon: 'savings',      label: '売上・入金管理' },
  { href: '/payment.html',     icon: 'payments',     label: '支払管理' },
  { href: '/orders-list.html', icon: 'receipt_long', label: '工事計画' },
  { href: '/history.html',     icon: 'history',      label: '履歴詳細' },
];

function buildSidebar() {
  const current = window.location.pathname;
  const items = SIDEBAR_LINKS.map(l => {
    const active = current.endsWith(l.href);
    const base = 'flex items-center gap-3 px-6 py-2.5 transition-colors';
    const cls = active
      ? `${base} text-secondary font-bold border-l-4 border-secondary bg-surface-container-low`
      : `${base} text-on-surface-variant hover:bg-surface-container-low`;
    return `<a class="${cls}" href="${l.href}">
<span class="material-symbols-outlined" style="font-size:20px">${l.icon}</span>
<span style="font-size:13px;font-weight:600;letter-spacing:0.02em">${l.label}</span>
</a>`;
  }).join('');

  return `<aside class="fixed left-0 top-0 h-screen w-64 z-50 bg-surface-container-lowest border-r border-outline-variant flex flex-col py-6">
<div class="px-6 mb-8">
<h1 class="font-bold text-primary" style="font-size:20px;line-height:1.2">WIN WIN様</h1>
<p class="text-on-surface-variant tracking-wider uppercase" style="font-size:11px">デモ画面</p>
</div>
<nav class="flex-1 space-y-0.5">${items}</nav>
</aside>`;
}

// サイドバーのサイズをCSSで強制（DOM置換の成否やTailwindの適用状況に依存しない保険）。
(function injectSidebarCss() {
  const css = `
aside h1 { font-size: 20px !important; line-height: 1.2 !important; }
aside nav a { padding-top: 10px !important; padding-bottom: 10px !important; }
aside nav a span:not(.material-symbols-outlined) { font-size: 13px !important; font-weight: 600 !important; letter-spacing: 0.02em !important; }
aside nav a .material-symbols-outlined { font-size: 20px !important; }
`;
  const style = document.createElement('style');
  style.id = 'sidebar-size-fix';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();

document.addEventListener('DOMContentLoaded', () => {
  const existing = document.querySelector('aside');
  if (existing) existing.outerHTML = buildSidebar();
});
