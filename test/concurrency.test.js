// 同時実行性のテスト：案件ID採番のレース条件、楽観的ロック、トランザクションの後始末を確認する。
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, loginAsAdmin, q } = require('./helpers');

let ctx;
let token;

test.before(async () => {
  ctx = await startServer();
  token = await loginAsAdmin(ctx.baseUrl);
});

test.after(async () => {
  await ctx.close();
});

test('同じ引渡月への同時登録でも案件IDが重複しない', async () => {
  const deliveryMonth = '2030-06'; // 他のテスト・実データと衝突しない未来月を使う
  const requests = Array.from({ length: 6 }, (_, i) =>
    fetch(`${ctx.baseUrl}/api/projects`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `concurrency-test-${i}`, client: 'test', amount: 100, deliveryMonth }),
    }).then(r => r.json())
  );
  const results = await Promise.all(requests);
  const projectNos = results.map(r => r.project_no);
  const uniqueNos = new Set(projectNos);
  assert.equal(uniqueNos.size, projectNos.length, `project_noが重複した: ${JSON.stringify(projectNos)}`);

  await q(
    'DELETE FROM projects WHERE id = ANY($1)',
    [results.map(r => r.id)]
  );
});

test('楽観的ロック: 古いversionでの更新は409、正しいversionでの更新は成功する', async () => {
  const created = await fetch(`${ctx.baseUrl}/api/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: 1, category: 'concurrency-test', vendor: 'test', decided: 1000 }),
  }).then(r => r.json());

  try {
    const v1 = 1; // 新規作成直後は必ずversion=1

    const okRes = await fetch(`${ctx.baseUrl}/api/orders/${created.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decided: 2000, version: v1 }),
    });
    assert.equal(okRes.status, 200);
    const okData = await okRes.json();
    assert.equal(okData.version, 2);

    // v1はもう古い。同じversionで再度更新しようとすると409になるはず
    const staleRes = await fetch(`${ctx.baseUrl}/api/orders/${created.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decided: 3000, version: v1 }),
    });
    assert.equal(staleRes.status, 409);

    // decidedは2000のまま変わっていないはず（409側の更新は反映されない）
    const rows = await q('SELECT decided, version FROM orders WHERE id=$1', [created.id]);
    assert.equal(rows[0].decided, 2000);
    assert.equal(rows[0].version, 2);
  } finally {
    await q('DELETE FROM orders WHERE id=$1', [created.id]);
  }
});

test('存在しない案件へのchange-delivery-monthは404で、新規案件も作られない', async () => {
  const before = await q('SELECT COUNT(*) AS cnt FROM projects');
  const res = await fetch(`${ctx.baseUrl}/api/projects/999999999/change-delivery-month`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ deliveryMonth: '2030-07' }),
  });
  assert.equal(res.status, 404);
  const after = await q('SELECT COUNT(*) AS cnt FROM projects');
  assert.equal(before[0].cnt, after[0].cnt, 'ガード条件で弾かれた場合、新規案件が作られてはいけない');
});

test('支払登録の取消（トランザクション）後、残金と明細数の整合性が保たれる', async () => {
  const order = await fetch(`${ctx.baseUrl}/api/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: 1, category: 'concurrency-test-tx', vendor: 'test', decided: 5000, remaining: 5000 }),
  }).then(r => r.json());

  try {
    const rec = await fetch(`${ctx.baseUrl}/api/payment-records`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: order.id, amount: 1500 }),
    }).then(r => r.json());
    assert.equal(rec.remaining, 3500);

    const delRes = await fetch(`${ctx.baseUrl}/api/payment-records/${rec.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(delRes.status, 200);

    const orderRow = (await q('SELECT remaining FROM orders WHERE id=$1', [order.id]))[0];
    assert.equal(orderRow.remaining, 5000, '取消後は残金が元に戻っているべき');
    const recRow = await q('SELECT id FROM payment_records WHERE id=$1', [rec.id]);
    assert.equal(recRow.length, 0, '取消後は支払登録明細も削除されているべき');
  } finally {
    await q('DELETE FROM orders WHERE id=$1', [order.id]);
  }
});
