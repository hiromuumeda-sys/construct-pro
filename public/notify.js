function notifKey(n) {
  return [n.type, n.title, n.date || '', (n.message || '').replace(/\d+/g, '#')].join('|');
}
function getConfirmedNotif() {
  try { return JSON.parse(localStorage.getItem('notif_confirmed') || '[]'); } catch(e) { return []; }
}
function setConfirmedNotif(arr) {
  localStorage.setItem('notif_confirmed', JSON.stringify(arr));
}
let __notifItems = [];
// 通知はsessionStorageにキャッシュし、画面遷移のたびに取得しない（TTL内はキャッシュ表示）。
// 最新化はベルを開いた時のみ（loadNotif(true)）。
const NOTIF_TTL = 5 * 60 * 1000;
function __readNotifCache() {
  try { const c = JSON.parse(sessionStorage.getItem('notif_cache') || 'null'); if (c && Array.isArray(c.items)) return c; } catch (_) {}
  return null;
}
let __notifFetching = null;
async function loadNotif(force) {
  const cache = __readNotifCache();
  if (!force && cache && (Date.now() - cache.ts) < NOTIF_TTL) {
    __notifItems = cache.items; renderNotif(); return;   // TTL内は取得しない
  }
  if (cache) { __notifItems = cache.items; renderNotif(); } // 期限切れでもまずキャッシュ表示（チラ防止）
  // 同時呼び出し（notify.js末尾＋header.js）は1回の取得にまとめる
  if (!__notifFetching) {
    __notifFetching = fetch('/api/notifications')
      .then(r => r.json())
      .then(items => { __notifItems = items; try { sessionStorage.setItem('notif_cache', JSON.stringify({ ts: Date.now(), items })); } catch (_) {} })
      .catch(() => {})
      .finally(() => { __notifFetching = null; });
  }
  await __notifFetching;
  renderNotif();
}
function renderNotif() {
  const items = __notifItems;
  const badge = document.getElementById('notif-badge');
  const list = document.getElementById('notif-list');
  const countLabel = document.getElementById('notif-count-label');
  if (!badge || !list) return;
  const confirmed = new Set(getConfirmedNotif());
  const colors = { error: 'text-error', warning: 'text-tertiary-fixed-dim', info: 'text-on-surface-variant' };
  const bg = { error: 'bg-error/5', warning: 'bg-surface-container-low', info: '' };
  const urgentUnconfirmed = items.filter(n => (n.level === 'error' || n.level === 'warning') && !confirmed.has(notifKey(n))).length;
  if (urgentUnconfirmed > 0) { badge.style.display = 'flex'; badge.textContent = urgentUnconfirmed > 99 ? '99+' : urgentUnconfirmed; }
  else { badge.style.display = 'none'; }
  const unconfirmedTotal = items.filter(n => !confirmed.has(notifKey(n))).length;
  if (countLabel) countLabel.textContent = '未確認 ' + unconfirmedTotal + ' / 全' + items.length;
  if (items.length === 0) {
    list.innerHTML = '<div class="px-4 py-8 text-center text-on-surface-variant text-label-md">通知はありません</div>';
    return;
  }
  list.innerHTML = items.map((n, i) => {
    const c = confirmed.has(notifKey(n));
    // 確認済はメッセージエリアの色を白（無背景）・テキストも中立色に
    const rowBg = c ? '' : (bg[n.level] || '');
    const titleColor = c ? 'text-on-surface' : (colors[n.level] || 'text-on-surface');
    const iconColor = c ? 'text-on-surface-variant' : (colors[n.level] || '');
    return `
      <div class="px-4 py-3 border-b border-outline-variant/30 flex gap-3 items-start ${rowBg}">
        <span class="material-symbols-outlined ${iconColor} text-[20px]">${n.icon}</span>
        <div class="flex-1 min-w-0">
          <p class="text-label-md font-bold ${titleColor}">${n.title}</p>
          <p class="text-body-sm text-on-surface-variant mt-0.5">${n.message}</p>
          ${n.date ? `<p class="text-label-sm text-on-surface-variant mt-1 tabular-numbers">${n.date}</p>` : ''}
          ${n.link ? `<a href="${n.link}" class="inline-flex items-center gap-0.5 text-label-sm text-secondary hover:underline mt-1"><span class="material-symbols-outlined text-[14px]">open_in_new</span>詳細を見る</a>` : ''}
        </div>
        ${c
          ? '<span class="text-label-sm text-secondary flex items-center gap-1 whitespace-nowrap"><span class="material-symbols-outlined text-[16px]">check_circle</span>確認済</span>'
          : '<button class="text-label-sm font-normal text-secondary border border-secondary/40 rounded-lg px-2.5 py-1 hover:bg-secondary/10 whitespace-nowrap" onclick="confirmNotif(' + i + ')">確認</button>'}
      </div>`;
  }).join('');
}
function confirmNotif(i) {
  const n = __notifItems[i];
  if (!n) return;
  const arr = getConfirmedNotif();
  const k = notifKey(n);
  if (!arr.includes(k)) { arr.push(k); setConfirmedNotif(arr); }
  renderNotif();
}
function toggleNotif(e) {
  e.stopPropagation();
  const panel = document.getElementById('notif-panel');
  const opening = panel.style.display === 'none';
  panel.style.display = opening ? 'block' : 'none';
  if (opening) loadNotif(true); // 開いた時だけ最新化
}
document.addEventListener('click', () => {
  const panel = document.getElementById('notif-panel');
  if (panel) panel.style.display = 'none';
});
loadNotif();
