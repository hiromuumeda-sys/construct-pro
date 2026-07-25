// テスト共通ヘルパー。exportされたExpressアプリをランダムな空きポートで起動し、
// テスト終了時にクローズする。DBは本番と同じdev用Supabaseに接続する
// （このプロジェクトには別建てのテストDBが無いため。テストは自分が作ったデータのみ操作し、
// 完了後に必ず削除する）。
const app = require('../server');
const { q } = require('../db');

async function startServer() {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

async function loginAsAdmin(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'testpass123' }),
  });
  if (!res.ok) throw new Error('admin login failed in test setup — is the dev DB reachable?');
  const data = await res.json();
  return data.token;
}

module.exports = { startServer, loginAsAdmin, q };
