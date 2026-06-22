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
async function loadNotif() {
  try {
    const res = await fetch('/api/notifications');
    __notifItems = await res.json();
  } catch(e) { return; }
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
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', () => {
  const panel = document.getElementById('notif-panel');
  if (panel) panel.style.display = 'none';
});
loadNotif();
