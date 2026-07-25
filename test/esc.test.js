const test = require('node:test');
const assert = require('node:assert/strict');
const { escHtml } = require('../public/esc.js');

test('escHtml escapes all 5 HTML-special characters', () => {
  assert.equal(escHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('escHtml leaves plain text untouched', () => {
  assert.equal(escHtml('京都御所南マンション改修工事'), '京都御所南マンション改修工事');
});

test('escHtml neutralizes a script-tag injection attempt', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const escaped = escHtml(payload);
  assert.ok(!escaped.includes('<img'), 'raw <img tag must not survive escaping');
  assert.equal(escaped, '&lt;img src=x onerror=alert(1)&gt;');
});

test('escHtml treats null/undefined as empty string', () => {
  assert.equal(escHtml(null), '');
  assert.equal(escHtml(undefined), '');
});

test('escHtml coerces numbers to strings', () => {
  assert.equal(escHtml(1234), '1234');
});
