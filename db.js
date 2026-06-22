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

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
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

module.exports = { pool, q, one };
