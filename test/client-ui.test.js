import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const page = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/styles.css', import.meta.url), 'utf8');

test('client preserves structured errors and duplicate admission states', () => {
  assert.match(script, /error\.data=data/);
  assert.match(script, /error\.data\?\.state/);
  assert.match(script, /duplicate or denied admission/);
});

test('client recovers active holds and prevents duplicate mutations', () => {
  assert.match(script, /find\(\(h\)=>h\.status==='ACTIVE'\)/);
  assert.match(script, /confirm-order'\)\.disabled=!activeHold\|\|pending/);
  assert.match(script, /if\(!activeHold\|\|pending\)return/);
  assert.match(script, /busy\(button,true,'Creating hold…'\)/);
});

test('focusable headings and login validation support keyboard use', () => {
  assert.match(page, /id="login-title" tabindex="-1"/);
  assert.match(page, /id="today-title" tabindex="-1"/);
  assert.match(script, /if\(focus\)\{\$\('#login-status'\)\.textContent='';[^}]*\$\('#login-title'\)\.focus\(\)/);
  assert.match(script, /if\(focus\).*\.focus\(\)/);
  assert.match(script, /field\.checkValidity\(\)/);
  assert.match(page, /minlength="16"/);
});

test('order rows use the domain status field', () => {
  assert.match(script, /\['State','status'/);
  assert.doesNotMatch(script, /\['State','state'/);
});

test('dynamic markup uses a single HTML escaping boundary', () => {
  assert.match(script, /const esc=/);
  assert.match(script, /esc\(p\.name\)/);
  assert.match(script, /esc\(report\.title\)/);
  assert.match(script, /esc\(ticket\.displayCode\)/);
  assert.match(script, /esc\(connector\.description\)/);
});

test('all required operator surfaces and mobile parity are present', () => {
  for (const id of ['today','schedule','sell','orders','admissions','customers','memberships','giftcards','catalog','inventory','staff','imports','reports','integrations','settings']) {
    assert.match(page, new RegExp(`id="${id}"`));
    assert.match(page, new RegExp(`data-nav="${id}"`));
  }
  for (const item of ['Today','Sell','Scan','More']) assert.match(page, new RegExp(`>${item}<`));
  assert.match(script, /toggleAttribute\('aria-current'/);
});

test('responsive, reduced-motion, forced-color, and hidden-state rules exist', () => {
  assert.match(styles, /\[hidden\]\{display:none!important\}/);
  assert.match(styles, /@media\(max-width:1200px\)/);
  assert.match(styles, /@media\(max-width:768px\)/);
  assert.match(styles, /table thead\{position:absolute;width:1px;height:1px;[^}]*overflow:hidden/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /forced-colors:active/);
});

test('strict style CSP has no inline style attributes to block', () => {
  assert.doesNotMatch(page, /\sstyle=/);
  assert.match(styles, /\.bars i:nth-child\(6\)\{height:30%\}/);
});

test('import center parses bounded local files and supports the full synthetic upload workflow', () => {
  assert.match(page, /type="file"/);
  assert.match(script, /await file\.text\(\)/);
  assert.match(script, /\/api\/import\/uploads/);
  assert.match(script, /\/api\/import\/mappings/);
  assert.match(script, /DRY_RUN/);
  assert.match(script, /COMMIT/);
  assert.match(script, /reconciliation/);
});

test('safety and durability boundaries remain persistent', () => {
  assert.match(page, /NON-PRODUCTION · SYNTHETIC DATA ONLY/);
  assert.match(page, /PER-INSTANCE/);
  assert.match(page, /Not production-durable/);
  assert.match(page, /No real people, payments, provider calls/);
  assert.doesNotMatch(page, /download=/);
  assert.match(page, /No download initiated/);
});
