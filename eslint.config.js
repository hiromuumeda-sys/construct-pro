const js = require('@eslint/js');

module.exports = [
  {
    ignores: ['node_modules/**', 'public/styles.css', 'coverage/**'],
  },
  js.configs.recommended,
  {
    // サーバー・テストコード（Node.js環境）
    files: ['server.js', 'db.js', 'api/**/*.js', 'scripts/**/*.js', 'test/**/*.js', 'eslint.config.js', 'tailwind.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      ecmaVersion: 2022,
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      // PDF帳票生成部で全角スペース（U+3000）をテンプレート内で意図的に使っているため、
      // テンプレートリテラル内のチェックは対象外にする（文字列リテラルは元々デフォルトで対象外）
      'no-irregular-whitespace': ['error', { skipTemplates: true }],
    },
  },
  {
    // フロントエンドの共通スクリプト（ブラウザ環境。グローバル関数を多用する構成のため no-undef は緩める）
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      ecmaVersion: 2022,
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        URL: 'readonly',
        FileReader: 'readonly',
        module: 'writable',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'off', // 画面ごとのinline <script>で定義される関数を相互参照するため
    },
  },
];
