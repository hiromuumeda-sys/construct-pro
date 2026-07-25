// 金額バリデーション（負数拒否）のテスト。監査で「契約金額・見積額・決定金額・入金額が
// 負の値のまま受け入れられていた」と指摘された箇所の回帰防止。
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, loginAsAdmin } = require('./helpers');

let ctx;
let token;

test.before(async () => {
  ctx = await startServer();
  token = await loginAsAdmin(ctx.baseUrl);
});

test.after(async () => {
  await ctx.close();
});

test('案件登録: 負の金額は400で拒否される', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/projects`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'validation-test', client: 'test', amount: -100, deliveryMonth: '2029-01' }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /負の値/);
});

test('案件登録: 正の金額は登録できる（後始末込み）', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/projects`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'validation-test-positive', client: 'test', amount: 100, deliveryMonth: '2029-02' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  const { q } = require('./helpers');
  await q('DELETE FROM projects WHERE id=$1', [data.id]);
});

test('案件外支払: 負の金額は400で拒否される', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/misc-payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'test', payee: 'test', amount: -500 }),
  });
  assert.equal(res.status, 400);
});

test('案件外入金: 負の金額は400で拒否される', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/misc-receipts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'test', payer: 'test', amount: -500 }),
  });
  assert.equal(res.status, 400);
});

test('入金登録: 負の金額は400で拒否される', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/receipts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: 1, received_date: '2026-01-01', amount: -1 }),
  });
  assert.equal(res.status, 400);
});

test('発注: 見積額・決定額いずれかが負なら400で拒否される', async () => {
  const res = await fetch(`${ctx.baseUrl}/api/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: 1, category: 'test', vendor: 'test', decided: -1 }),
  });
  assert.equal(res.status, 400);
});
