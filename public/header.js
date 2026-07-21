// ヘッダー右側クラスター（通知ベル・ヘルプ・ユーザー情報・ログアウト）の共通化。
// 左側の検索ボックスは各画面固有の挙動のためそのまま残す。
// header 要素の「最後の子要素（=右側クラスター）」を統一マークアップで差し替える。

// 読み込み時のチラつき防止：差し替え前の静的な右側クラスターを不可視にしておく。
// （差し替え後のクラスターには .hdr-ready が付くので表示される。スペースは確保＝レイアウト不動）
(function injectHeaderAntiFlicker() {
  const css = 'header > div:last-child:not(.hdr-ready){visibility:hidden}';
  const style = document.createElement('style');
  style.id = 'hdr-anti-flicker';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();

const HEADER_RIGHT_HTML = `<div class="hdr-ready flex items-center gap-6">
<div class="flex items-center gap-4">
<div class="relative" id="notif-wrap">
<button class="material-symbols-outlined text-on-surface-variant hover:text-primary relative" onclick="toggleNotif(event)">notifications<span id="notif-badge" class="absolute -top-1 -right-1 bg-error text-on-error text-[9px] font-normal rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center" style="display:none">0</span></button>
<div id="notif-panel" class="absolute right-0 mt-2 w-96 max-h-[480px] overflow-y-auto bg-surface-container-lowest border border-outline-variant rounded-lg custom-shadow z-[200]" style="display:none" onclick="event.stopPropagation()">
<div class="px-4 py-3 border-b border-outline-variant flex justify-between items-center sticky top-0 bg-surface-container-lowest">
<span class="text-label-md font-label-md text-primary">通知</span>
<span class="text-label-sm text-on-surface-variant" id="notif-count-label"></span>
</div>
<div id="notif-list"></div>
</div>
</div>
<button class="material-symbols-outlined text-on-surface-variant hover:text-primary" title="ヘルプ">help</button>
</div>
<div class="h-8 w-px bg-outline-variant"></div>
<div class="flex items-center gap-3 cursor-pointer relative" id="hdr-user-menu" onclick="hdrToggleUserMenu(event)">
<div class="text-right">
<p class="text-label-md font-bold text-primary" id="hdr-user-name">ユーザー</p>
<p class="text-label-sm text-on-surface-variant" id="hdr-user-role">user</p>
</div>
<div class="w-10 h-10 rounded-full bg-secondary text-on-secondary font-bold flex items-center justify-center">👤</div>
<div id="hdr-user-panel" class="absolute right-0 top-full mt-2 w-48 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg hidden" onclick="event.stopPropagation()">
<a href="#" onclick="Auth.logout();return false;" class="flex items-center gap-3 px-4 py-3 text-on-surface hover:bg-surface-container-low text-body-sm"><span class="material-symbols-outlined">logout</span>ログアウト</a>
</div>
</div>
</div>`;

function hdrToggleUserMenu(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById('hdr-user-panel');
  if (panel) panel.classList.toggle('hidden');
}

document.addEventListener('click', e => {
  const menu = document.getElementById('hdr-user-menu');
  const panel = document.getElementById('hdr-user-panel');
  if (panel && menu && !menu.contains(e.target)) panel.classList.add('hidden');
});

document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  if (!header || !header.lastElementChild) return;
  // 右側クラスターを統一マークアップに差し替え
  header.lastElementChild.outerHTML = HEADER_RIGHT_HTML;

  // ログイン中ユーザーを表示（サイドバーと同様、localStorageの情報から一度だけ同期描画。
  // ネットワーク取得はせず、ページ毎の再読み込み・再描画を行わない）
  hdrRenderUser();

  // 差し替え後の新しい通知DOMへ確実に描画（notify.js があれば再読込）
  if (typeof loadNotif === 'function') loadNotif();
});

const HDR_ROLE_LABEL = { admin: '管理者', accounting: '経理部', staff: '一般社員', user: '一般社員' };
function hdrRenderUser() {
  // localStorage を直接参照（auth.js の Auth は const のため window.Auth で取れない）
  let u = null;
  try {
    u = JSON.parse(localStorage.getItem('user') || 'null');
  } catch (_) {}
  if (!u) return;
  const n = document.getElementById('hdr-user-name');
  const r = document.getElementById('hdr-user-role');
  if (n) n.textContent = u.name || u.email || 'ユーザー';
  if (r) r.textContent = HDR_ROLE_LABEL[u.role] || u.role || '一般社員';
}
