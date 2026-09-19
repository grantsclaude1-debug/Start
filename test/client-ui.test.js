import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

test('client preserves structured error responses for expected conflict states', () => {
  assert.match(script, /error\.data=data/);
  assert.match(script, /error\.data\?\.result&&error\.data\?\.state/);
  assert.match(script, /Check-in result:/);
});

test('client recovers active holds after refresh and keeps confirmation available', () => {
  assert.match(script, /find\(hold=>hold\.status==='ACTIVE'\)/);
  assert.match(script, /confirm-order'\)\.disabled=!activeHold/);
});

test('login transitions move focus to visible headings and clear stale status', () => {
  assert.match(page, /<link rel="icon" href="data:,">/);
  assert.match(page, /id="login-title" tabindex="-1"/);
  assert.match(page, /id="overview-title" tabindex="-1"/);
  assert.match(script, /focusConsole:true/);
  assert.match(script, /focusLogin:true/);
  assert.match(script, /\/api\/auth\/status/);
});
