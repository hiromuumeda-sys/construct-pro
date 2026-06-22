// sidebar 共通化
const SIDEBAR_HTML = `<aside class="fixed left-0 top-0 h-screen w-64 z-50 bg-surface-container-lowest border-r border-outline-variant flex flex-col py-6">
<div class="px-6 mb-10">
<h1 class="text-headline-md font-display-lg font-bold text-primary">WIN WIN様</h1>
<p class="text-label-sm text-on-surface-variant tracking-wider uppercase">デモ画面</p>
</div>
<nav class="flex-1 space-y-1">
<a class="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors" href="/reporting.html">
<span class="material-symbols-outlined">dashboard</span>
<span class="text-label-md">ダッシュボード</span>
</a>
<a class="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors" href="/projects.html">
<span class="material-symbols-outlined">engineering</span>
<span class="text-label-md">受注一覧</span>
</a>
<a class="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors" href="/customers.html">
<span class="material-symbols-outlined">groups</span>
<span class="text-label-md">顧客マスタ</span>
</a>
<a class="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors" href="/vendors.html">
<span class="material-symbols-outlined">store</span>
<span class="text-label-md">発注先マスタ</span>
</a>
<a class="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors" href="/categories.html">
<span class="material-symbols-outlined">category</span>
<span class="text-label-md">工事区分マスタ</span>
</a>
<a class="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors" href="/receipts.html">
<span class="material-symbols-outlined">savings</span>
<span class="text-label-md">売上・入金管理</span>
</a>
<a class="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors" href="/payment.html">
<span class="material-symbols-outlined">payments</span>
<span class="text-label-md">支払管理</span>
</a>
<a class="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors" href="/orders-list.html">
<span class="material-symbols-outlined">receipt_long</span>
<span class="text-label-md">工事計画</span>
</a>
<a class="flex items-center gap-3 px-6 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors" href="/history.html">
<span class="material-symbols-outlined">history</span>
<span class="text-label-md">履歴詳細</span>
</a>
</nav>
</aside>`;

document.addEventListener('DOMContentLoaded', () => {
  const existingSidebar = document.querySelector('aside');
  if (existingSidebar) {
    existingSidebar.outerHTML = SIDEBAR_HTML;
    setActiveSidebarLink();
  }
});

function setActiveSidebarLink() {
  const currentPath = window.location.pathname;
  const links = document.querySelectorAll('aside a');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (currentPath.includes(href.replace('/', ''))) {
      link.classList.add('text-secondary', 'font-bold', 'border-l-4', 'border-secondary', 'bg-surface-container-low');
      link.classList.remove('text-on-surface-variant', 'hover:bg-surface-container-low');
    }
  });
}
