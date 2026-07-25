#!/usr/bin/env node
// 軽量なマイグレーション適用スクリプト。migrations/ 配下の *.sql をファイル名順に読み、
// schema_migrations テーブルに未適用のものだけをトランザクション内で実行して記録する。
// 実行例: node scripts/migrate.js
//
// 注意: server.js の ensureAux() は、このスクリプトを実行し忘れた場合や
// サーバーレス環境（Vercel）で初回リクエスト時に同じ変更を冪等に適用する安全網として
// 引き続き残している。両者は同じ変更を二重に表現することがあるが、どちらも
// IF NOT EXISTS 系の冪等な文なので害はない。
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text primary key,
      applied_at  timestamp default current_timestamp
    )
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const { rows: applied } = await pool.query('SELECT name FROM schema_migrations');
  const appliedNames = new Set(applied.map(r => r.name));

  let ranCount = 0;
  for (const file of files) {
    const name = path.basename(file, '.sql');
    if (appliedNames.has(name)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`✅ applied: ${name}`);
      ranCount++;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`❌ failed: ${name} — ${err.message}`);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(ranCount === 0 ? '適用すべき新しいマイグレーションはありません。' : `${ranCount}件のマイグレーションを適用しました。`);
  await pool.end();
}

main();
