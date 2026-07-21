// サイドバー共通化
// フォント／アイコンサイズはインライン style で明示し、TailwindのCDN処理タイミングに
// 依存しないようにする（動的注入時のサイズ崩れ防止）。
// マスタ系は「マスタ設定」にまとめ、マウスオーバーで分岐先（顧客/発注先/工事区分）を表示。
const SIDEBAR_LINKS = [
  { href: '/reporting.html', icon: 'dashboard', label: 'ダッシュボード' },
  { href: '/projects.html', icon: 'engineering', label: '受注一覧' },
  {
    icon: 'settings',
    label: 'マスタ設定',
    children: [
      { href: '/customers.html', icon: 'groups', label: '顧客マスタ' },
      { href: '/vendors.html', icon: 'store', label: '発注先マスタ' },
      { href: '/categories.html', icon: 'category', label: '工事区分マスタ' },
    ],
  },
  { href: '/receipts.html', icon: 'savings', label: '売上・入金管理' },
  { href: '/payment.html', icon: 'payments', label: '支払管理' },
  { href: '/orders-list.html', icon: 'receipt_long', label: '工事計画' },
  { href: '/history.html', icon: 'history', label: '履歴詳細' },
  { href: '/invite.html', icon: 'person_add', label: 'アカウント発行' },
];

const LABEL_STYLE = 'font-size:12px;font-weight:500;letter-spacing:0.01em';
const ICON_STYLE = 'font-size:18px';

function buildSidebar() {
  const current = window.location.pathname;
  const isActive = href => href && current.endsWith(href);

  const items = SIDEBAR_LINKS.map(l => {
    const base = 'flex items-center gap-2 px-4 py-2.5 transition-colors';

    // グループ（マスタ設定）：ホバーで右側にサブメニューを表示
    if (l.children) {
      const groupActive = l.children.some(c => isActive(c.href));
      const parentCls = groupActive ? `${base} text-secondary font-bold border-l-4 border-secondary bg-surface-container-low` : `${base} text-on-surface-variant hover:bg-surface-container-low`;
      const sub = l.children
        .map(c => {
          const a = isActive(c.href);
          const cc = a ? 'flex items-center gap-3 px-4 py-2.5 text-secondary font-bold bg-surface-container-low' : 'flex items-center gap-3 px-4 py-2.5 text-on-surface-variant hover:bg-surface-container-low';
          return `<a class="${cc}" href="${c.href}">
<span class="material-symbols-outlined" style="${ICON_STYLE}">${c.icon}</span>
<span style="${LABEL_STYLE}">${c.label}</span>
</a>`;
        })
        .join('');
      return `<div class="relative group">
<div class="${parentCls} cursor-pointer justify-between">
<span class="flex items-center gap-3">
<span class="material-symbols-outlined" style="${ICON_STYLE}">${l.icon}</span>
<span style="${LABEL_STYLE}">${l.label}</span>
</span>
<span class="material-symbols-outlined" style="font-size:18px">chevron_right</span>
</div>
<div class="hidden group-hover:block absolute left-full top-0 w-56 bg-surface-container-lowest border border-outline-variant rounded-r-lg rounded-bl-lg shadow-lg z-[60] py-1">
<p class="px-4 pt-2 pb-1 text-on-surface-variant uppercase tracking-wider" style="font-size:10px">マスタ設定</p>
${sub}
</div>
</div>`;
    }

    // 通常リンク
    const active = isActive(l.href);
    const cls = active ? `${base} text-secondary font-bold border-l-4 border-secondary bg-surface-container-low` : `${base} text-on-surface-variant hover:bg-surface-container-low`;
    return `<a class="${cls}" href="${l.href}">
<span class="material-symbols-outlined" style="${ICON_STYLE}">${l.icon}</span>
<span style="${LABEL_STYLE}">${l.label}</span>
</a>`;
  }).join('');

  return `<aside class="fixed left-0 top-0 h-screen w-48 z-50 bg-surface-container-lowest border-r border-outline-variant flex flex-col py-6">
<div class="px-4 mb-8">
<img src="/logo.png" alt="WIN WIN" style="height:32px;width:auto;display:block"
  onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/>
<h1 class="font-bold text-primary" style="font-size:20px;line-height:1.2;display:none">WIN WIN様</h1>
<p class="text-on-surface-variant tracking-wider uppercase" style="font-size:11px;margin-top:4px">デモ画面</p>
</div>
<nav class="flex-1 space-y-0.5">${items}</nav>
</aside>`;
}

// サイドバーのサイズをCSSで強制（DOM置換の成否やTailwindの適用状況に依存しない保険）。
(function injectSidebarCss() {
  const css = `
aside h1 { font-size: 20px !important; line-height: 1.2 !important; }
aside nav a, aside nav .group > div:first-child { padding-top: 8px !important; padding-bottom: 8px !important; }
aside nav a span:not(.material-symbols-outlined), aside nav .group span:not(.material-symbols-outlined) { font-size: 12px !important; font-weight: 500 !important; letter-spacing: 0.01em !important; }
aside nav a .material-symbols-outlined, aside nav .group .material-symbols-outlined { font-size: 18px !important; }
aside nav .group p { font-size: 10px !important; font-weight: 600 !important; }
/* main内のボタン・入力・日付ピッカーの文字サイズを統一（サイズ指定漏れの16px既定を補正）。
   aside(サイドバー)は対象外。見出しやテーブル等の非ボタン要素も触らない。 */
main input, main select, main textarea { font-size: 13px !important; }
main button { font-size: 13px !important; }
main button .material-symbols-outlined, main button.material-symbols-outlined { font-size: 18px !important; }
/* 一覧のステータス変更プルダウン：小さめ・非太字・@tailwindcss/formsのSVG矢印を消して
   独自のexpand_more矢印1つだけにする（二重矢印・はみ出し防止）。全画面共通。 */
main select.appearance-none {
  font-size: 11px !important; font-weight: 400 !important;
  background-image: none !important; background-position: right .25rem center !important;
  padding-right: 1.25rem !important; text-overflow: ellipsis;
}
/* ピル型ステータス選択の文字を中央寄せ（Safariは select の text-align を無視するため
   text-align-last も併用）。フィルター用select(rounded-lg)は対象外。 */
main select.appearance-none.rounded-full { text-align: center !important; text-align-last: center !important; padding-left: 1.25rem !important; }
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
