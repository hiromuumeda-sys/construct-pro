// Supabase (PostgreSQL) 接続レイヤ
// 環境変数 DATABASE_URL に Supabase の接続文字列（Connection Pooler / Transaction mode 推奨）を設定する。
//   例: postgresql://postgres.xxxx:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
// ローカル開発用の簡易 .env ローダ（Vercel では環境変数が自動注入されるため不要）
try {
  const fs = require('fs');
  const p = require('path').join(__dirname, '.env');
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  }
} catch (_) { /* noop */ }

const pg = require('pg');
const { Pool } = pg;

// bigint(int8, OID=20) と numeric(OID=1700) を文字列ではなく数値として返す。
// （金額カラムが文字列だと フロントで sum+x が文字列連結になり集計が壊れるため）
pg.types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));
pg.types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // 3だとN+1クエリと組み合わさった際に同時アクセス時に詰まりやすいため引き上げ
  max: 10,
});

// クエリ実行ヘルパ。行配列を返す。
async function q(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

// 1行だけ返す（無ければ undefined）
async function one(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0];
}

// rowCount等、行配列以外の情報（楽観的ロックの更新件数チェック等）が必要な場合に使う。
async function exec(sql, params = []) {
  return pool.query(sql, params);
}

// 複数テーブルにまたがる更新をトランザクションで保護する。
// fn(client) 内では client.query(...) を使う（pool.query/q/oneは別コネクションに
// 割り当てられ得るため使わないこと）。エラー時は自動でROLLBACKする。
// pgbouncerのtransaction modeでも、1回のcheckout内でBEGIN〜COMMITを完結させる
// this使い方なら問題なく動作する（pg_advisory_xact_lockも同様にトランザクション内でのみ有効）。
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, q, one, exec, withTransaction };
