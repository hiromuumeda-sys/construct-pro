// 認証ユーティリティ
const Auth = {
  getToken() { return localStorage.getItem('auth_token'); },
  getUser() { return JSON.parse(localStorage.getItem('user') || 'null'); },
  isLoggedIn() { return !!this.getToken(); },

  logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  },

  headers() {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  },

  redirectIfNotLoggedIn() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login.html';
    }
  }
};

// fetch を自動ラップ：/api/ への全リクエストに認証トークンを付与する。
// これにより各画面の fetch を個別に書き換えなくても、サーバ側で操作者(userId)が特定でき、
// 操作履歴(audit_logs)が記録される。
(function () {
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init = {}) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isApi = url.includes('/api/');
    const token = Auth.getToken();
    if (isApi && token) {
      const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      init = { ...init, headers };
    }
    return origFetch(input, init);
  };
})();

// ページロード時に認証チェック
window.addEventListener('DOMContentLoaded', () => {
  if (!Auth.isLoggedIn() && !window.location.pathname.includes('login')) {
    window.location.href = '/login.html';
  }
});
