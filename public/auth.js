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

// ページロード時に認証チェック
window.addEventListener('DOMContentLoaded', () => {
  if (!Auth.isLoggedIn() && !window.location.pathname.includes('login')) {
    window.location.href = '/login.html';
  }
});
