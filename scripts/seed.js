#!/usr/bin/env node
// Supabase にスキーマ＆シードデータを投入するスクリプト
// 実行例: DATABASE_URL="postgresql://..." node scripts/seed.js

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

// .env ローダ
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  }
} catch (_) {}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('❌ DATABASE_URL が設定されていません。');
  console.error('   例: DATABASE_URL="postgresql://postgres:pass@..." node scripts/seed.js');
  process.exit(1);
}

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  console.log('🚀 schema.sql を実行中...');
  try {
    await pool.query(sql);
    console.log('✅ 完了！テーブル作成＆シードデータ投入が完了しました。');
  } catch (err) {
    console.error('❌ エラー:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
