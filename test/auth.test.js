// authMiddleware（server.js）の挙動を実サーバー起動+HTTPで検証する。
// このプロジェクトには別建てのテストDBが無いため、実際のdev用DBに対して行う。
// admin@example.com / testpass123 は既存のRBAC検証用リセット済みアカウント。
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startServer, loginAsAdmin } = require('./helpers');

let ctx;

test.before(async () => {
  ctx = await startServer();
});

test.after(async () => {
  await ctx.close();
});

test('リクエストにトークンが無ければ401', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/projects`);
  assert.equal(res.status, 401);
});

test('壊れた（署名不正な）トークンは401', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/projects`, {
    headers: { Authorization: 'Bearer not-a-real-jwt' },
  });
  assert.equal(res.status, 401);
});

test('正しいトークンなら200', async () => {
  const token = await loginAsAdmin(ctx.baseUrl);
  const res = await fetch(`${ctx.baseUrl}/api/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
});

test('token_versionが一致しないトークンは強制ログアウト扱いで401', async () => {
  // 正しい秘密鍵で署名されていても、DB上のtoken_versionと食い違えば拒否される
  // （ロール変更・アカウント停止時に既存セッションを即座に無効化する仕組み）
  const validToken = await loginAsAdmin(ctx.baseUrl);
  const payload = jwt.decode(validToken);
  const forgedButStaleVersion = jwt.sign({ id: payload.id, email: payload.email, tv: (payload.tv || 1) + 999 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const res = await fetch(`${ctx.baseUrl}/api/projects`, {
    headers: { Authorization: `Bearer ${forgedButStaleVersion}` },
  });
  assert.equal(res.status, 401);
});

test('ログインは職務分掌の対象外エンドポイントに認証なしでアクセスできる', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nonexistent@example.com', password: 'wrong' }),
  });
  // 401（Invalid credentials）が返る＝認証ミドルウェアでブロックされていない
  assert.equal(res.status, 401);
});

test('一般社員ロールは支払登録（ロール制限つきエンドポイント）で403', async () => {
  // admin1@example.com(id=6) はこのプロジェクトの検証で継続して使っているテスト専用アカウント。
  // role='user'はAPI経由では設定できない（招待ロールの検証対象外）ため、DBへ直接戻す。
  const { q } = require('./helpers');
  await q("UPDATE users SET role='staff' WHERE id=6");
  try {
    const row = (await q('SELECT token_version FROM users WHERE id=6'))[0];
    const staffToken = jwt.sign({ id: 6, email: 'admin1@example.com', tv: row.token_version }, process.env.JWT_SECRET, { expiresIn: '5m' });

    const res = await fetch(`${ctx.baseUrl}/api/payment-records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: 1, amount: 100 }),
    });
    assert.equal(res.status, 403);
  } finally {
    await q("UPDATE users SET role='user' WHERE id=6");
  }
});
